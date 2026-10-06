import type { UploadControllerContext } from "./createUploadSessionController.types";
import { releaseUploadBatchLocally } from "./uploadIdleSnapshotHelpers";
import { clearUploadRecoveryHint } from "./uploadRecoveryStorageHelpers/uploadRecoveryStorageHelpers";

/** Releases unstarted work immediately, including a draft still opening. */
export function discardUploadDraft(
  context: Readonly<UploadControllerContext>,
): Promise<void> {
  const { state, dependencies } = context;
  if (state.isDestroyed) {
    return Promise.resolve();
  }
  if (state.pendingDraftDiscard) {
    state.generation += 1;
    return state.pendingDraftDiscard;
  }
  const detail = state.snapshot.detail;
  if (state.isArming || (detail && detail.state !== "draft")) {
    return Promise.resolve();
  }
  const opening = state.pendingDraftOpening;
  state.generation += 1;
  releaseUploadBatchLocally({ context });
  clearUploadRecoveryHint(dependencies);
  const cancellation = detail
    ? dependencies.api.cancelUploadSession(detail.sessionId)
    : opening
      ? opening.then((opened) => {
          return opened.state === "draft"
            ? dependencies.api.cancelUploadSession(opened.sessionId)
            : undefined;
        })
      : Promise.resolve();
  state.pendingDraftDiscard = cancellation;
  return cancellation.finally(() => {
    if (state.pendingDraftDiscard === cancellation) {
      state.pendingDraftDiscard = undefined;
    }
  });
}
