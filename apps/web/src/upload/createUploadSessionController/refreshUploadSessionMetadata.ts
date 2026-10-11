import { getWholeUploadSessionFromSessionId } from "@/api/uploadsHelpers/getWholeUploadSessionFromSessionId/getWholeUploadSessionFromSessionId";
import type { UploadControllerContext } from "./createUploadSessionController.types";

/** Refreshes server metadata without replacing active browser work. */
export function refreshUploadSessionMetadata(
  context: Readonly<UploadControllerContext>,
): Promise<void> {
  if (context.state.pendingMetadataRefresh) {
    context.state.isMetadataRefreshQueued = true;
    return context.state.pendingMetadataRefresh;
  }
  const pending = _drainMetadataRefresh(context).finally(() => {
    if (context.state.pendingMetadataRefresh === pending) {
      context.state.pendingMetadataRefresh = undefined;
    }
  });
  context.state.pendingMetadataRefresh = pending;
  return pending;
}

async function _drainMetadataRefresh(
  context: Readonly<UploadControllerContext>,
): Promise<void> {
  context.state.isMetadataRefreshQueued = false;
  await _refresh(context);
  if (context.state.isMetadataRefreshQueued) {
    await _drainMetadataRefresh(context);
  }
}

async function _refresh(
  context: Readonly<UploadControllerContext>,
): Promise<void> {
  const generation = context.state.generation;
  const previousDetail = context.state.snapshot.detail;
  const sessionId = previousDetail?.sessionId;
  if (!sessionId || !context.isCurrent(generation)) {
    return;
  }
  const detail = await getWholeUploadSessionFromSessionId({
    sessionId,
    read: context.dependencies.api.getUploadSession,
  });
  if (
    !context.isCurrent(generation) ||
    context.state.snapshot.detail?.sessionId !== sessionId ||
    context.state.isMetadataRefreshQueued
  ) {
    return;
  }
  // Completion and declaration reads outrank a response started before them.
  if (context.state.snapshot.detail !== previousDetail) {
    await _refresh(context);
    return;
  }
  context.publish({ ...context.state.snapshot, detail });
}
