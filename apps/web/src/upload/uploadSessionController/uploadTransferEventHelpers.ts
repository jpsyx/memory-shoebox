import type {
  UploadApi,
  UploadEngineEvent,
} from "@/upload/createUploadEngine/createUploadEngine.types";
import type {
  UploadControllerContext,
  UploadFileActivity,
} from "./uploadSessionController.types";
import { makeUploadSnapshotFromCompletion } from "./uploadSnapshotHelpers/uploadSnapshotHelpers";

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

/** Publishes authoritative upload state within the current operation. */
export function makeUploadEngineApiFromContext(
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

/** Publishes authoritative upload state within the current operation. */
export function makeUploadEventReceiverFromContext(
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
