import {
  UPLOAD_LIMITS,
  type PutUploadManifestResponse,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import {
  makeIdleUploadSnapshot,
  releaseUploadBatchLocally,
} from "./uploadIdleSnapshotHelpers";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { getWholeUploadSession } from "@/api/uploadsHelpers/getWholeUploadSession/getWholeUploadSession";
import {
  clearUploadRecoveryHint,
  getEditTargetsFromRecoveryHint,
  readUploadRecoveryHint,
  writeUploadRecoveryHint,
} from "./uploadRecoveryStorage/uploadRecoveryStorage";
import type {
  UploadControllerContext,
  UploadPendingPick,
  UploadPhase,
} from "./uploadSessionController.types";

/** Reads an addressed batch, or current then remembered batch, never opens one. */
export async function loadUploadSession(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    sessionId?: string;
  }>,
): Promise<void> {
  const { context, generation, sessionId } = options;
  context.publish({ ...context.state.snapshot, phase: "loading" });
  if (sessionId) {
    await _readAndPublish({ context, generation, sessionId });
    return;
  }
  const current = await context.dependencies.api.getCurrentUploadSession();
  if (!context.isCurrent(generation)) {
    return;
  }
  if (current) {
    await _readAndPublish({
      context,
      generation,
      sessionId: current.sessionId,
    });
    return;
  }
  if (await _loadRememberedSession({ context, generation })) {
    return;
  }
  if (context.isCurrent(generation)) {
    releaseUploadBatchLocally({
      context,
      isBusy: context.state.snapshot.isBusy,
    });
  }
}

async function _loadRememberedSession(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<boolean> {
  const { context, generation } = options;
  const hint = readUploadRecoveryHint(context.dependencies);
  if (!hint) {
    return false;
  }
  try {
    await _readAndPublish({ context, generation, sessionId: hint.sessionId });
    return true;
  } catch (error) {
    if (!context.isCurrent(generation)) {
      return true;
    }
    if (!(error instanceof ApiRequestError) || error.status !== 404) {
      throw error;
    }
    clearUploadRecoveryHint(context.dependencies);
    return false;
  }
}

/** Declares every pick, preserving successful chunks and undeclared references. */
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
    await _readAndPublish({
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
      _publishDetail({ context, detail, isOpening: true });
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
        await _readAndPublish({
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
  await _readAndPublish({ context, generation, sessionId });
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

async function _readAndPublish(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    sessionId: string;
  }>,
): Promise<void> {
  const { context, generation, sessionId } = options;
  const detail = await getWholeUploadSession({
    sessionId,
    read: context.dependencies.api.getUploadSession,
  });
  if (context.isCurrent(generation)) {
    _publishDetail({ context, detail });
    context.state.needsDeclarationRead = false;
  }
}

function _publishDetail(
  options: Readonly<{
    context: UploadControllerContext;
    detail: UploadSessionDetail;
    isOpening?: boolean;
  }>,
): void {
  const { context, detail } = options;
  const snapshot = context.state.snapshot;
  const isSameSession = snapshot.detail?.sessionId === detail.sessionId;
  const hint = readUploadRecoveryHint(context.dependencies);
  const editTargets = isSameSession
    ? snapshot.editTargets
    : getEditTargetsFromRecoveryHint({ hint, detail });
  const selectedFileIds = _getSelectedFileIdsFromDetail({
    context,
    detail,
    isSameSession,
  });
  if (!isSameSession && !options.isOpening) {
    context.state.pendingPicks = [];
    context.state.needsDeclarationRead = false;
    context.state.recoveryPicks = undefined;
  }
  context.publish({
    ...snapshot,
    detail,
    phase: getPhaseFromUploadDetail(detail),
    editTargets,
    selectedFileIds,
    recoveryMatches: isSameSession
      ? snapshot.recoveryMatches
      : makeIdleUploadSnapshot().recoveryMatches,
    checkingCount: isSameSession ? snapshot.checkingCount : 0,
    checkingTotal: isSameSession ? snapshot.checkingTotal : 0,
    declaredCount:
      isSameSession || options.isOpening ? snapshot.declaredCount : 0,
    declarationTotal:
      isSameSession || options.isOpening ? snapshot.declarationTotal : 0,
    filesById: isSameSession ? snapshot.filesById : new Map(),
    fileActivityById: isSameSession ? snapshot.fileActivityById : new Map(),
  });
  writeUploadRecoveryHint({
    ...context.dependencies,
    hint: {
      version: 1,
      sessionId: detail.sessionId,
      editTargets: Object.fromEntries(editTargets),
    },
  });
}

/** Chooses the visible phase from authoritative server state. */
export function getPhaseFromUploadDetail(
  detail: Readonly<UploadSessionDetail>,
): UploadPhase {
  if (detail.state === "draft") {
    return "draft";
  }
  if (detail.state === "cancelled") {
    return "unavailable";
  }
  if (detail.state === "settled") {
    return detail.files.some((file) => {
      return file.state !== "done";
    })
      ? "partial"
      : "done";
  }
  return "resume";
}

function _getSelectedFileIdsFromDetail(
  options: Readonly<{
    context: UploadControllerContext;
    detail: UploadSessionDetail;
    isSameSession: boolean;
  }>,
): Set<string> {
  const { context, detail, isSameSession } = options;
  return new Set(
    [...context.state.snapshot.selectedFileIds].filter((fileId) => {
      return (
        isSameSession &&
        detail.state === "draft" &&
        detail.files.some((file) => {
          return file.fileId === fileId && file.state === "waiting";
        })
      );
    }),
  );
}
