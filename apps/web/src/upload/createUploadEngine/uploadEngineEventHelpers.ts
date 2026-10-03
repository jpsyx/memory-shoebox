import type { UploadSessionState } from "@memory-shoebox/shared";

import { type TransferOutcome } from "@/upload/transferUploadFile/transferUploadFile.types";

import type { EngineContext } from "./createUploadEngine.types";

/** The event one file's ending owes the caller, and its answer kept. */
export function emitUploadFileOutcome(
  functionOptions: Readonly<{
    context: EngineContext;
    fileId: string;
    outcome: TransferOutcome;
  }>,
): void {
  const { context, fileId, outcome } = functionOptions;

  // A cancelled run reports no ending, even for an answer that was already
  // on its way back when `cancel` was called.
  if (outcome.outcome === "aborted" || context.controller.signal.aborted) {
    return;
  }
  if (outcome.outcome === "batch-closed") {
    ((sourceContext: EngineContext): void => {
      sourceContext.isBatchClosed = true;
      sourceContext.controller.abort();
    })(context);
    return;
  }
  if (outcome.outcome === "skipped") {
    context.hasSkippedFile = true;
    context.onEvent({ kind: "file-skipped", fileId, reason: outcome.reason });
    return;
  }
  if (outcome.response !== undefined) {
    context.answers.latest = outcome.response;
    if (outcome.response.didSettle) {
      context.answers.latched = outcome.response;
    }
  }
  if (outcome.outcome === "done") {
    context.onEvent({ kind: "file-done", fileId, response: outcome.response });
  } else {
    context.onEvent({
      kind: "file-failed",
      fileId,
      problemCode: outcome.problemCode,
      detail: outcome.detail,
    });
  }
}

/**
 * The batch's state as this run leaves it, or undefined when nothing can say.
 *
 * The latch's answer says `settled`; without one, the newest answer says what
 * the batch is now. **A skipped duplicate is the exception.** Presign cancelled
 * it and ran the latch in the same transaction, and its `409` carries no state,
 * so that cancel may be what settled the batch with no `complete` here to say
 * so. After a skip, the batch itself is read.
 */
async function _getFinalSessionState(
  context: EngineContext,
): Promise<UploadSessionState | undefined> {
  const { latched, latest } = context.answers;
  if (latched !== undefined) {
    return latched.sessionState;
  }
  if (!context.hasSkippedFile) {
    return latest?.sessionState ?? undefined;
  }
  return context.api
    .getUploadSession({ sessionId: context.sessionId, limit: 1 })
    .then(
      (detail) => {
        return detail.state;
      },
      () => {
        return latest?.sessionState ?? undefined;
      },
    );
}

/**
 * The one event a run ends with, once every lane has drained: `batch-closed`
 * for a run stopped by a batch gone elsewhere, otherwise `settled`.
 *
 * At the end rather than when the latch's answer arrives, because with two
 * lanes the other file's answer can arrive after it, and the ending must be
 * the last event of a run. A run that was cancelled, or that ended no file,
 * has nothing to report and emits nothing.
 */
export async function emitUploadRunEnding(
  context: Readonly<EngineContext>,
): Promise<void> {
  if (context.isBatchClosed) {
    context.onEvent({ kind: "batch-closed" });
    return;
  }
  if (context.controller.signal.aborted) {
    return;
  }
  const sessionState = await _getFinalSessionState(context);
  if (sessionState !== undefined && !context.controller.signal.aborted) {
    context.onEvent({ kind: "settled", sessionState });
  }
}
