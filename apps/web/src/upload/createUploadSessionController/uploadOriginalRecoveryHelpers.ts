import type {
  UploadFileDto,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import type { UploadControllerContext } from "./createUploadSessionController.types";

function _isRecoverable(file: Readonly<UploadFileDto>): boolean {
  return (
    !file.duplicateReason &&
    (file.state === "waiting" ||
      file.state === "sending" ||
      file.state === "failed")
  );
}

function _warnStorageUnavailable(
  context: Readonly<UploadControllerContext>,
  generation: number,
): void {
  if (context.isCurrent(generation)) {
    context.publish({
      ...context.state.snapshot,
      recoveryStorageWarning:
        "Keep this tab open until uploading finishes. This browser could not save all the originals for recovery after a refresh. If needed, select the same photos again; completed uploads will be skipped.",
    });
  }
}

/** Saves only recoverable originals before transfer, without blocking on storage errors. */
export async function savePendingUploadOriginals(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
  }>,
): Promise<void> {
  const { context, generation } = options;
  const snapshot = context.state.snapshot;
  const detail = snapshot.detail!;
  const fileIds = new Set(
    detail.files.filter(_isRecoverable).map((file) => {
      return file.fileId;
    }),
  );
  const saving = context.dependencies.originalStore
    .saveFiles({
      memberId: context.dependencies.memberId,
      sessionId: detail.sessionId,
      filesById: new Map(
        [...snapshot.filesById].filter(([fileId]) => {
          return fileIds.has(fileId);
        }),
      ),
    })
    .then(() => {
      if (context.isCurrent(generation)) {
        context.publish({
          ...context.state.snapshot,
          recoveryStorageWarning: undefined,
        });
      }
    })
    .catch(() => {
      _warnStorageUnavailable(context, generation);
    });
  context.state.pendingOriginalSave = saving;
  await saving;
  if (context.state.pendingOriginalSave === saving) {
    context.state.pendingOriginalSave = undefined;
  }
}

/** Deletes confirmed terminal rows after any pending save, keeping failures resumable. */
export async function pruneUploadOriginals(
  options: Readonly<{
    context: UploadControllerContext;
    detail: UploadSessionDetail;
  }>,
): Promise<void> {
  const { context, detail } = options;
  const scope = {
    memberId: context.dependencies.memberId,
    sessionId: detail.sessionId,
  };
  await context.state.pendingOriginalSave;
  try {
    if (detail.state === "cancelled") {
      await context.dependencies.originalStore.clearSession(scope);
    } else {
      const fileIds = detail.files
        .filter((file) => {
          return !_isRecoverable(file);
        })
        .map((file) => {
          return file.fileId;
        });
      if (fileIds.length > 0) {
        await context.dependencies.originalStore.removeFiles({
          ...scope,
          fileIds,
        });
      }
    }
  } catch {
    // Browser cleanup is best effort; abandoned copies also expire.
  }
}

/** Reconnects stored originals only after the server authorizes a complete manifest read. */
export async function restoreUploadOriginals(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    detail: UploadSessionDetail;
  }>,
): Promise<void> {
  const { context, generation, detail } = options;
  if (detail.state === "draft" || detail.state === "cancelled") {
    await pruneUploadOriginals({ context, detail });
    return;
  }
  try {
    const files = await context.dependencies.originalStore.readFiles({
      memberId: context.dependencies.memberId,
      sessionId: detail.sessionId,
    });
    if (!context.isCurrent(generation)) {
      return;
    }
    const filesById = new Map(context.state.snapshot.filesById);
    detail.files.filter(_isRecoverable).forEach((row) => {
      const file = files.get(row.fileId);
      if (
        file &&
        file.size === row.declaredBytes &&
        !filesById.has(row.fileId)
      ) {
        filesById.set(row.fileId, file);
      }
    });
    context.publish({ ...context.state.snapshot, filesById });
  } catch {
    _warnStorageUnavailable(context, generation);
  }
  await pruneUploadOriginals({ context, detail });
}

/** Explicitly abandoning a local batch clears its saved originals, including a pending save. */
export function clearUploadOriginals(
  context: Readonly<UploadControllerContext>,
): void {
  const sessionId = context.state.snapshot.detail?.sessionId;
  if (!sessionId) {
    return;
  }
  const cleanup = Promise.all([
    context.state.pendingOriginalSave,
    context.state.pendingOriginalCleanup,
  ])
    .then(() => {
      return context.dependencies.originalStore.clearSession({
        memberId: context.dependencies.memberId,
        sessionId,
      });
    })
    .catch(() => {});
  context.state.pendingOriginalCleanup = cleanup;
  void cleanup.finally(() => {
    if (context.state.pendingOriginalCleanup === cleanup) {
      context.state.pendingOriginalCleanup = undefined;
    }
  });
}
