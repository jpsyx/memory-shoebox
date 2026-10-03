import {
  setUploadVisibilityRequestSchema,
  type SetUploadVisibilityRequest,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { getWholeUploadSession } from "@/api/uploadsHelpers/getWholeUploadSession/getWholeUploadSession";
import type {
  UploadApi,
  UploadEngineEvent,
  UploadEngineFile,
} from "@/upload/createUploadEngine/createUploadEngine.types";
import { getPhaseFromUploadDetail } from "./uploadDeclarationHelpers";
import { makeUploadSnapshotFromCompletion } from "./uploadSnapshotHelpers/uploadSnapshotHelpers";
import type {
  UploadControllerContext,
  UploadFileActivity,
  UploadPhase,
  UploadSnapshot,
} from "./uploadSessionController.types";

function _getPendingFilesFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): UploadEngineFile[] {
  const pendingById = new Map<string, UploadEngineFile>();
  snapshot.detail?.files.forEach((row) => {
    const file = snapshot.filesById.get(row.fileId);
    if (file && (row.state === "waiting" || row.state === "sending")) {
      pendingById.set(row.fileId, { fileId: row.fileId, file });
    }
  });
  return [...pendingById.values()];
}

function _assertPendingHandles(snapshot: Readonly<UploadSnapshot>): void {
  const pending = snapshot.detail!.files.filter((file) => {
    return file.state === "waiting" || file.state === "sending";
  });
  if (
    pending.some((file) => {
      return !snapshot.filesById.has(file.fileId);
    })
  ) {
    throw new Error("Pick the original files again before uploading.");
  }
  if (pending.length === 0) {
    throw new Error("Pick at least one accepted file before uploading.");
  }
}

function _getVisibilityKey(
  visibility: Readonly<SetUploadVisibilityRequest>,
): string {
  const subjects = new Set(
    visibility.subjects.map((subject) => {
      return `${subject.kind}:${subject.id}`;
    }),
  );
  return JSON.stringify([visibility.mode, [...subjects].sort()]);
}

function _publishMutationDetail(
  options: Readonly<{
    context: UploadControllerContext;
    detail: UploadSessionDetail;
  }>,
): void {
  const { context, detail } = options;
  const rows = new Map(
    context.state.snapshot.detail?.files.map((row) => {
      return [row.fileId, row];
    }),
  );
  detail.files.forEach((row) => {
    rows.set(row.fileId, row);
  });
  const wholeDetail = {
    ...detail,
    files: [...rows.values()].sort((left, right) => {
      return left.position - right.position;
    }),
    nextCursor: null,
  };
  const snapshot = { ...context.state.snapshot, detail: wholeDetail };
  context.publish({ ...snapshot, phase: _getPhaseFromSnapshot(snapshot) });
}

function _makeEngineApi(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    flush: () => void;
  }>,
): UploadApi {
  const { context, generation, flush } = options;
  return {
    presignUploadFile: context.dependencies.api.presignUploadFile,
    getUploadSession: context.dependencies.api.getUploadSession,
    completeUploadFile: async (request) => {
      const response =
        await context.dependencies.api.completeUploadFile(request);
      if (context.isCurrent(generation)) {
        flush();
        context.publish(
          makeUploadSnapshotFromCompletion({
            snapshot: context.state.snapshot,
            response,
          }),
        );
      }
      return response;
    },
  };
}

function _makeEventReceiver(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): {
  onEvent: (event: Readonly<UploadEngineEvent>) => void;
  flush: () => void;
  cancel: () => void;
} {
  const { context, generation } = options;
  const buffer = _makeProgressBuffer(options);
  return {
    flush: buffer.flush,
    cancel: buffer.cancel,
    onEvent: (event) => {
      if (!context.isCurrent(generation)) {
        return;
      }
      if (event.kind === "file-progress") {
        buffer.onProgress(event);
        return;
      }
      buffer.flush();
      _publishTerminalEvent({ context, event });
    },
  };
}

function _makeProgressBuffer(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): {
  onProgress: (
    event: Readonly<Extract<UploadEngineEvent, { kind: "file-progress" }>>,
  ) => void;
  flush: () => void;
  cancel: () => void;
} {
  const { context, generation } = options;
  let frame: number | undefined;
  const pending = new Map<string, UploadFileActivity>();
  const cancel = () => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
    frame = undefined;
    pending.clear();
  };
  const flush = () => {
    _publishBufferedProgress({ context, generation, pending });
    cancel();
  };
  return {
    cancel,
    flush,
    onProgress: (event) => {
      pending.set(event.fileId, {
        isIncludedInEmail: context.state.snapshot.fileActivityById.get(
          event.fileId,
        )?.isIncludedInEmail,
        kind: "transferring",
        sentBytes: event.sentBytes,
        totalBytes: event.totalBytes,
      });
      frame ??= requestAnimationFrame(flush);
    },
  };
}

function _publishTerminalEvent(
  options: Readonly<{
    context: UploadControllerContext;
    event: Readonly<UploadEngineEvent>;
  }>,
): void {
  const { context, event } = options;
  const snapshot = context.state.snapshot;
  if (
    event.kind === "settled" ||
    event.kind === "batch-closed" ||
    event.kind === "file-progress"
  ) {
    return;
  }
  if (event.kind === "file-done") {
    context.publish(
      makeUploadSnapshotFromCompletion({ snapshot, response: event.response }),
    );
    return;
  }
  const fileActivityById = new Map(snapshot.fileActivityById);
  if (event.kind === "file-started") {
    fileActivityById.set(event.fileId, {
      kind: "preparing",
      isIncludedInEmail: snapshot.fileActivityById.get(event.fileId)
        ?.isIncludedInEmail,
    });
  } else if (event.kind === "file-skipped") {
    fileActivityById.set(event.fileId, {
      kind: "duplicate",
      isIncludedInEmail: snapshot.fileActivityById.get(event.fileId)
        ?.isIncludedInEmail,
    });
  } else if (fileActivityById.get(event.fileId)?.kind !== "confirmed") {
    fileActivityById.set(event.fileId, {
      isIncludedInEmail: snapshot.fileActivityById.get(event.fileId)
        ?.isIncludedInEmail,
      kind: "unconfirmed",
      problemCode: event.problemCode,
      detail: event.detail,
    });
  }
  context.publish({ ...snapshot, fileActivityById });
}

async function _refreshAfterRun(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    sessionId: string;
  }>,
): Promise<void> {
  const { context, generation, sessionId } = options;
  try {
    const detail = await getWholeUploadSession({
      sessionId,
      read: context.dependencies.api.getUploadSession,
    });
    if (context.isCurrent(generation)) {
      const snapshot = _makeSnapshotFromRead({
        snapshot: context.state.snapshot,
        detail,
      });
      context.publish({ ...snapshot, phase: _getPhaseFromSnapshot(snapshot) });
    }
  } catch (error) {
    if (context.isCurrent(generation)) {
      context.publish({ ...context.state.snapshot, phase: "partial" });
      throw error;
    }
  }
}

function _getPhaseFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): UploadPhase {
  const detail = snapshot.detail!;
  if (detail.state !== "settled") {
    return getPhaseFromUploadDetail(detail);
  }
  return detail.files.some((file) => {
    return (
      file.state !== "done" &&
      snapshot.fileActivityById.get(file.fileId)?.kind !== "duplicate"
    );
  })
    ? "partial"
    : "done";
}

function _makeSnapshotFromRead(
  options: Readonly<{ snapshot: UploadSnapshot; detail: UploadSessionDetail }>,
): UploadSnapshot {
  const { snapshot, detail } = options;
  const fileActivityById = new Map(snapshot.fileActivityById);
  detail.files.forEach((file) => {
    if (
      file.state !== "waiting" &&
      file.state !== "sending" &&
      fileActivityById.get(file.fileId)?.kind !== "duplicate"
    ) {
      fileActivityById.set(file.fileId, {
        isIncludedInEmail: snapshot.fileActivityById.get(file.fileId)
          ?.isIncludedInEmail,
        kind: "confirmed",
        state: file.state,
      });
    }
  });
  return { ...snapshot, detail, fileActivityById };
}

function _publishBufferedProgress(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    pending: ReadonlyMap<string, UploadFileActivity>;
  }>,
): void {
  const { context, generation, pending } = options;
  if (context.isCurrent(generation) && pending.size > 0) {
    context.publish({
      ...context.state.snapshot,
      fileActivityById: new Map([
        ...context.state.snapshot.fileActivityById,
        ...pending,
      ]),
    });
  }
}

/** Validates a draft, saves a changed rule, then arms its accepted manifest. */
export async function armUploadSession(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    visibility: Readonly<SetUploadVisibilityRequest>;
  }>,
): Promise<void> {
  const { context, generation } = options;
  const detail = context.state.snapshot.detail;
  if (!detail || detail.state !== "draft") {
    throw new Error("Only a draft batch can be armed.");
  }
  const visibility = setUploadVisibilityRequestSchema.parse(options.visibility);
  _assertPendingHandles(context.state.snapshot);
  if (_getVisibilityKey(visibility) !== _getVisibilityKey(detail.visibility)) {
    const saved = await context.dependencies.api.setUploadVisibility({
      sessionId: detail.sessionId,
      body: visibility,
    });
    if (!context.isCurrent(generation)) {
      return;
    }
    context.publish({
      ...context.state.snapshot,
      detail: { ...context.state.snapshot.detail!, visibility: saved },
    });
  }
  const armed = await context.dependencies.api.commitUploadSession({
    sessionId: detail.sessionId,
    intent: "arm",
  });
  if (context.isCurrent(generation)) {
    _publishMutationDetail({ context, detail: armed });
  }
}

/**
 * Runs distinct pending handles through the existing engine and awaits its end.
 * Recovery callers must publish their fresh server baseline before invoking it.
 * Its generation must remain current; close/reset invalidate every late answer.
 * Releases the setup lock while running so an explicit close can interrupt it.
 */
export async function runUploadTransfer(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<void> {
  const { context, generation } = options;
  const sessionId = context.state.snapshot.detail!.sessionId;
  const files = _getPendingFilesFromSnapshot(context.state.snapshot);
  const events = _makeEventReceiver(options);
  const engine = context.dependencies.createUploadEngine({
    sessionId,
    api: _makeEngineApi({ ...options, flush: events.flush }),
    createMediaWorker: context.dependencies.createMediaWorker,
    onEvent: events.onEvent,
  });
  context.state.engine = engine;
  context.state.cancelTransferProgress = events.cancel;
  context.publish({
    ...context.state.snapshot,
    phase: "sending",
    isBusy: false,
    isRunning: true,
    selectedFileIds: new Set(),
  });
  try {
    await engine.start(files);
    if (context.isCurrent(generation)) {
      events.flush();
      await _refreshAfterRun({ context, generation, sessionId });
    }
  } finally {
    events.cancel();
    if (context.isCurrent(generation)) {
      context.state.engine = undefined;
      context.state.cancelTransferProgress = undefined;
      context.publish({ ...context.state.snapshot, isRunning: false });
    }
  }
}

/** Stops local work before committing close; landed media remains on the server. */
export async function closeUploadBatch(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<void> {
  const { context, generation } = options;
  const detail = context.state.snapshot.detail;
  if (!detail || detail.state !== "uploading") {
    throw new Error("Only an uploading batch can be closed.");
  }
  context.state.cancelRecoveryChecking?.();
  context.state.cancelRecoveryChecking = undefined;
  context.state.cancelTransferProgress?.();
  context.state.cancelTransferProgress = undefined;
  context.state.engine?.cancel();
  context.state.engine = undefined;
  context.publish({ ...context.state.snapshot, isRunning: false });
  const closed = await context.dependencies.api.commitUploadSession({
    sessionId: detail.sessionId,
    intent: "close",
  });
  if (context.isCurrent(generation)) {
    const wholeDetail = closed.nextCursor
      ? await getWholeUploadSession({
          sessionId: detail.sessionId,
          read: (request) => {
            return request.cursor
              ? context.dependencies.api.getUploadSession(request)
              : Promise.resolve(closed);
          },
        })
      : closed;
    if (context.isCurrent(generation)) {
      _publishMutationDetail({ context, detail: wholeDetail });
    }
  }
}
