import { getWholeUploadSessionFromSessionId } from "@/api/uploadsHelpers/getWholeUploadSessionFromSessionId/getWholeUploadSessionFromSessionId";
import { UPLOAD_LIMITS } from "@memory-shoebox/shared";
import type { UploadControllerContext } from "./createUploadSessionController.types";
import { publishUploadSessionDetail } from "./uploadManifestReadHelpers";

type RemovalOptions = {
  context: UploadControllerContext;
  generation: number;
  fileIds: readonly string[];
};

function _getDraftFileIdsFromRemoval({
  context,
  fileIds,
}: Readonly<RemovalOptions>): string[] {
  const snapshot = context.state.snapshot;
  const detail = snapshot.detail;
  if (!detail || detail.state !== "draft" || detail.committedAt !== null) {
    throw new Error("Only files in a draft batch can be removed.");
  }
  if (snapshot.recoveryMatches.ambiguous.length > 0) {
    throw new Error("Finish matching chosen originals before removing files.");
  }
  const knownIds = new Set(
    detail.files
      .filter((file) => {
        return file.state === "waiting" || file.state === "refused";
      })
      .map((file) => {
        return file.fileId;
      }),
  );
  if (
    fileIds.some((fileId) => {
      return !knownIds.has(fileId);
    })
  ) {
    throw new Error("Choose files from this draft before removing them.");
  }
  return [...new Set(fileIds)];
}

async function _refreshRemoval({
  context,
  generation,
}: Readonly<RemovalOptions>): Promise<void> {
  if (!context.isCurrent(generation)) {
    return;
  }
  const detail = await getWholeUploadSessionFromSessionId({
    sessionId: context.state.snapshot.detail!.sessionId,
    read: context.dependencies.api.getUploadSession,
  });
  if (context.isCurrent(generation)) {
    publishUploadSessionDetail({ context, detail });
  }
}

/** Deletes bounded draft chunks and recovers uncertain answers by reading. */
export async function removeDraftFiles(
  options: Readonly<RemovalOptions>,
): Promise<void> {
  const fileIds = _getDraftFileIdsFromRemoval(options);
  if (fileIds.length === 0) {
    return;
  }
  const { context, generation } = options;
  const sessionId = context.state.snapshot.detail!.sessionId;
  context.publish({ ...context.state.snapshot, hasUnconfirmedRemoval: true });
  try {
    await fileIds.reduce(async (previousChunk, _fileId, position) => {
      await previousChunk;
      if (
        !context.isCurrent(generation) ||
        position % UPLOAD_LIMITS.manifestEntriesPerRequest !== 0
      ) {
        return;
      }
      await context.dependencies.api.removeUploadFiles({
        sessionId,
        fileIds: fileIds.slice(
          position,
          position + UPLOAD_LIMITS.manifestEntriesPerRequest,
        ),
      });
    }, Promise.resolve());
    await _refreshRemoval(options);
  } catch (error) {
    try {
      await _refreshRemoval(options);
    } catch {
      /* Keep submission blocked until a successful read. */
    }
    throw error;
  }
}
