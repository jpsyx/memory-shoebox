import type {
  CompleteUploadFileResponse,
  UploadFileDto,
  UploadProgress,
  UploadSessionDetail,
  UploadSessionState,
} from "@memory-shoebox/shared";
import type { UploadSnapshot } from "../uploadSessionController.types";

/** Terminal count orders aggregate answers within one transfer run. */
function _getTerminalCountFromProgress(
  progress: Readonly<UploadProgress>,
): number {
  return (
    progress.doneCount +
    progress.failedCount +
    progress.refusedCount +
    progress.cancelledCount
  );
}

/** Chooses an aggregate without losing confirmed counts or bytes. */
function _getProgressFromCompletion(
  options: Readonly<{
    progress: UploadProgress;
    response: CompleteUploadFileResponse;
  }>,
): UploadProgress {
  const { progress, response } = options;
  if (
    _getTerminalCountFromProgress(response.progress) <
    _getTerminalCountFromProgress(progress)
  ) {
    return progress;
  }
  return {
    ...response.progress,
    doneCount: Math.max(progress.doneCount, response.progress.doneCount),
    doneBytes: Math.max(progress.doneBytes, response.progress.doneBytes),
  };
}

/** Settlement remains known even if the latch's answer arrives late. */
function _getStateFromCompletion(
  options: Readonly<{
    detail: UploadSessionDetail;
    response: CompleteUploadFileResponse;
  }>,
): UploadSessionState {
  const { detail, response } = options;
  if (detail.state === "cancelled") {
    return "cancelled";
  }
  if (
    detail.state === "settled" ||
    response.sessionState === "settled" ||
    response.didSettle
  ) {
    return "settled";
  }
  return _getTerminalCountFromProgress(response.progress) >=
    _getTerminalCountFromProgress(detail.progress)
    ? response.sessionState
    : detail.state;
}

/**
 * Records every completion row, even when its aggregate arrived late.
 * Explicit retry starts with fresh authoritative detail as its baseline.
 */
export function makeUploadSnapshotFromCompletion(
  options: Readonly<{
    snapshot: UploadSnapshot;
    response: CompleteUploadFileResponse;
  }>,
): UploadSnapshot {
  const { snapshot, response } = options;
  const detail = snapshot.detail;
  if (!detail) {
    return snapshot;
  }
  const filesById = new Map(
    detail.files.map((file) => {
      return [file.fileId, file];
    }),
  );
  filesById.set(response.file.fileId, response.file);
  return {
    ...snapshot,
    detail: {
      ...detail,
      progress: _getProgressFromCompletion({
        progress: detail.progress,
        response,
      }),
      state: _getStateFromCompletion({ detail, response }),
      files: [...filesById.values()].sort((left, right) => {
        return left.position - right.position;
      }),
      pendingFiles: detail.pendingFiles.filter((file) => {
        return file.fileId !== response.file.fileId;
      }),
    },
    fileActivityById: {
      ...snapshot.fileActivityById,
      [response.file.fileId]: { kind: "confirmed", state: response.file.state },
    },
  };
}

/** All editable rows on a server capture day, including offscreen prints. */
export function getDayFilesFromSnapshot(
  options: Readonly<{ snapshot: UploadSnapshot; capturedOn: string }>,
): UploadFileDto[] {
  return (
    options.snapshot.detail?.files.filter((file) => {
      return (
        file.capturedOn === options.capturedOn &&
        file.state !== "refused" &&
        file.state !== "cancelled"
      );
    }) ?? []
  );
}
