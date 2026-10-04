import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { getWholeUploadSessionFromSessionId } from "@/api/uploadsHelpers/getWholeUploadSessionFromSessionId/getWholeUploadSessionFromSessionId";
import type { UploadSessionDetail } from "@memory-shoebox/shared";
import type {
  UploadControllerContext,
  UploadEditTargets,
  UploadPhase,
} from "./createUploadSessionController.types";
import {
  makeIdleUploadSnapshot,
  releaseUploadBatchLocally,
} from "./uploadIdleSnapshotHelpers";
import {
  clearUploadRecoveryHint,
  getEditTargetsFromRecoveryHint,
  getUploadRecoveryHintFromStorage,
  writeUploadRecoveryHint,
} from "./uploadRecoveryStorageHelpers/uploadRecoveryStorageHelpers";

async function _loadRememberedSession(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<boolean> {
  const { context, generation } = options;
  const hint = getUploadRecoveryHintFromStorage(context.dependencies);
  if (!hint) {
    return false;
  }
  try {
    await readAndPublishUploadSession({
      context,
      generation,
      sessionId: hint.sessionId,
    });
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

function _getLiveEditTargetsFromContext(
  options: Readonly<{
    context: UploadControllerContext;
    detail: UploadSessionDetail;
    isSameSession: boolean;
  }>,
): UploadEditTargets {
  const { context, detail, isSameSession } = options;
  const hint = isSameSession
    ? {
        version: 1 as const,
        sessionId: detail.sessionId,
        editTargets: Object.fromEntries(context.state.snapshot.editTargets),
      }
    : getUploadRecoveryHintFromStorage(context.dependencies);
  return getEditTargetsFromRecoveryHint({ hint, detail });
}

function _saveLiveTargetsToStorage(
  context: Readonly<UploadControllerContext>,
): void {
  const snapshot = context.state.snapshot;
  writeUploadRecoveryHint({
    ...context.dependencies,
    hint: {
      version: 1,
      sessionId: snapshot.detail!.sessionId,
      editTargets: Object.fromEntries(snapshot.editTargets),
    },
  });
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

/**
 * Reads an addressed batch, or current then remembered batch, never opens one.
 */
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
    await readAndPublishUploadSession({ context, generation, sessionId });
    return;
  }
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

/** Publishes authoritative upload state within the current operation. */
export async function readAndPublishUploadSession(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    sessionId: string;
  }>,
): Promise<void> {
  const { context, generation, sessionId } = options;
  const detail = await getWholeUploadSessionFromSessionId({
    sessionId,
    read: context.dependencies.api.getUploadSession,
  });
  if (context.isCurrent(generation)) {
    publishUploadSessionDetail({ context, detail });
    context.state.needsDeclarationRead = false;
  }
}

/** Publishes authoritative upload state within the current operation. */
export function publishUploadSessionDetail(
  options: Readonly<{
    context: UploadControllerContext;
    detail: UploadSessionDetail;
    isOpening?: boolean;
  }>,
): void {
  const { context, detail } = options;
  const snapshot = context.state.snapshot;
  const isSameSession = snapshot.detail?.sessionId === detail.sessionId;
  const editTargets = _getLiveEditTargetsFromContext({
    context,
    detail,
    isSameSession,
  });
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
    recoveryFilesByRef: isSameSession ? snapshot.recoveryFilesByRef : undefined,
    checkingCount: isSameSession ? snapshot.checkingCount : 0,
    checkingTotal: isSameSession ? snapshot.checkingTotal : 0,
    declaredCount:
      isSameSession || options.isOpening ? snapshot.declaredCount : 0,
    declarationTotal:
      isSameSession || options.isOpening ? snapshot.declarationTotal : 0,
    filesById: isSameSession ? snapshot.filesById : new Map(),
    fileActivityById: isSameSession ? snapshot.fileActivityById : new Map(),
  });
  _saveLiveTargetsToStorage(context);
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
