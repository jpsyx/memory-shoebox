import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  UPLOAD_LIMITS,
  type PutUploadManifestResponse,
} from "@memory-shoebox/shared";
import type {
  UploadControllerContext,
  UploadPendingPick,
} from "./createUploadSessionController.types";
import {
  publishUploadSessionDetail,
  readAndPublishUploadSession,
} from "./uploadManifestReadHelpers";

function _retainPickedFiles(
  options: Readonly<{
    context: UploadControllerContext;
    files: readonly File[];
  }>,
): void {
  const { context, files } = options;
  context.state.pendingPicks.push(
    ...files.map((file) => {
      return { file, clientRef: crypto.randomUUID() };
    }),
  );
  context.publish({
    ...context.state.snapshot,
    phase: "declaring",
    declarationTotal:
      context.state.snapshot.declaredCount + context.state.pendingPicks.length,
  });
}

async function _openDraftIfNeeded(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<void> {
  const { context, generation } = options;
  if (context.state.snapshot.detail) {
    return;
  }
  try {
    const detail = await context.dependencies.api.openUploadSession({
      clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (context.isCurrent(generation)) {
      publishUploadSessionDetail({ context, detail, isOpening: true });
    }
  } catch (error) {
    if (!context.isCurrent(generation)) {
      return;
    }
    if (
      error instanceof ApiRequestError &&
      error.code === "upload_session_conflict"
    ) {
      context.state.pendingPicks = [];
      const current = await context.dependencies.api.getCurrentUploadSession();
      if (!context.isCurrent(generation)) {
        return;
      }
      if (current) {
        await readAndPublishUploadSession({
          context,
          generation,
          sessionId: current.sessionId,
        });
      }
    }
    throw error;
  }
}

async function _readPendingHeaders(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<void> {
  const { context, generation } = options;
  const unread = context.state.pendingPicks.filter((pick) => {
    return !pick.entry;
  });
  let position = 0;
  const readLane = async (): Promise<void> => {
    if (!context.isCurrent(generation)) {
      return;
    }
    const pick = unread[position++];
    if (!pick) {
      return;
    }
    const entry = await context.dependencies.getManifestEntryFromFile({
      file: pick.file,
      clientRef: pick.clientRef,
    });
    if (!context.isCurrent(generation)) {
      return;
    }
    pick.entry = entry;
    await readLane();
  };
  await Promise.all([readLane(), readLane()]);
}

async function _sendPendingChunks(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<void> {
  const { context, generation } = options;
  if (
    !context.isCurrent(generation) ||
    context.state.pendingPicks.length === 0
  ) {
    return;
  }
  const sessionId = context.state.snapshot.detail!.sessionId;
  const picks = context.state.pendingPicks.slice(
    0,
    UPLOAD_LIMITS.manifestEntriesPerRequest,
  );
  const entries = picks.map((pick) => {
    if (!pick.entry) {
      throw new Error("Picked file headers have not been read.");
    }
    return pick.entry;
  });
  const response = await context.dependencies.api.putUploadManifest({
    sessionId,
    files: entries,
  });
  if (!context.isCurrent(generation)) {
    return;
  }
  _recordOutcomes({ context, picks, response });
  context.state.pendingPicks.splice(0, picks.length);
  context.state.needsDeclarationRead = true;
  await readAndPublishUploadSession({ context, generation, sessionId });
  await _sendPendingChunks(options);
}

function _recordOutcomes(
  options: Readonly<{
    context: UploadControllerContext;
    picks: readonly UploadPendingPick[];
    response: PutUploadManifestResponse;
  }>,
): void {
  const { context, picks, response } = options;
  const filesById = new Map(context.state.snapshot.filesById);
  const pickedByRef = new Map(
    picks.map((pick) => {
      return [pick.clientRef, pick.file];
    }),
  );
  response.outcomes.forEach((outcome) => {
    const file = pickedByRef.get(outcome.clientRef);
    if (file && !filesById.has(outcome.fileId)) {
      filesById.set(outcome.fileId, file);
    }
  });
  context.publish({
    ...context.state.snapshot,
    filesById,
    declaredCount: context.state.snapshot.declaredCount + picks.length,
  });
}

/**
 * Declares every pick, preserving successful chunks and undeclared references.
 */
export async function declareUploadPicks(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    files: readonly File[];
  }>,
): Promise<void> {
  const { context, generation, files } = options;
  if (
    context.state.snapshot.detail &&
    context.state.snapshot.detail.state !== "draft"
  ) {
    throw new Error("Fresh picks require a draft batch.");
  }
  if (
    files.length === 0 &&
    context.state.pendingPicks.length === 0 &&
    !context.state.needsDeclarationRead
  ) {
    return;
  }
  _retainPickedFiles({ context, files });
  await _openDraftIfNeeded({ context, generation });
  if (!context.isCurrent(generation)) {
    return;
  }
  context.publish({ ...context.state.snapshot, phase: "declaring" });
  if (context.state.needsDeclarationRead) {
    await readAndPublishUploadSession({
      context,
      generation,
      sessionId: context.state.snapshot.detail!.sessionId,
    });
  }
  await _readPendingHeaders({ context, generation });
  if (!context.isCurrent(generation)) {
    return;
  }
  await _sendPendingChunks({ context, generation });
  if (context.isCurrent(generation)) {
    context.publish({ ...context.state.snapshot, phase: "draft" });
  }
}

/** Deletes only an existing draft; teardown/reset never calls this action. */
export async function cancelUploadDraft(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    onCancelled: () => void;
  }>,
): Promise<void> {
  const { context, generation } = options;
  const detail = context.state.snapshot.detail;
  if (!detail || detail.state !== "draft") {
    throw new Error("Only a draft batch can be cancelled.");
  }
  await context.dependencies.api.cancelUploadSession(detail.sessionId);
  if (context.isCurrent(generation)) {
    options.onCancelled();
  }
}
