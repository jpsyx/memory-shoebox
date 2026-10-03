import type {
  SendPreparedFileOptions,
  EngineContext,
  WorkerSlot,
  UploadEngineFile,
} from "./createUploadEngine.types";
import { failUploadFile } from "@/upload/transferUploadFile/failUploadFile";
import { transferUploadFile } from "@/upload/transferUploadFile/transferUploadFile";
import { type TransferOutcome } from "@/upload/transferUploadFile/transferUploadFile.types";

import {
  makePreparedUploadFileFromFile,
  recycleMediaWorker,
} from "./uploadPreparationHelpers";

import { emitUploadFileOutcome } from "./uploadEngineEventHelpers";

/**
 * One file, start to finish: hash, derivatives, original, derivatives,
 * complete. A file the browser could not read, or whose worker died, is
 * failed rather than waited on.
 */
async function _sendFile(
  functionOptions: Readonly<{
    context: EngineContext;
    slot: WorkerSlot;
    item: UploadEngineFile;
  }>,
): Promise<TransferOutcome> {
  const { context, slot, item } = functionOptions;

  const common = {
    sessionId: context.sessionId,
    fileId: item.fileId,
    api: context.api,
    signal: context.controller.signal,
    ...(context.retry === undefined ? {} : { retry: context.retry }),
  };
  const prepared = await makePreparedUploadFileFromFile({
    context: context,
    slot: slot,
    file: item.file,
  }).catch((error: unknown) => {
    recycleMediaWorker(slot);
    // The worker's own words, which already name the browser's error.
    return error instanceof Error ? error.message : String(error);
  });
  // Preparation runs on the main thread in part (a header read, a video's
  // poster), which a cancel cannot interrupt, so it is checked on the way out.
  if (context.controller.signal.aborted) {
    return { outcome: "aborted" };
  }
  return _sendPreparedFile({ context, item, prepared, common });
}

/** One slot draining the shared queue, a file at a time, until it is empty. */
async function _drainQueue(
  functionOptions: Readonly<{ context: EngineContext; slot: WorkerSlot }>,
): Promise<void> {
  const { context, slot } = functionOptions;

  const item = context.queue.shift();
  if (item === undefined || context.controller.signal.aborted) {
    return;
  }
  context.onEvent({ kind: "file-started", fileId: item.fileId });
  emitUploadFileOutcome({
    context: context,
    fileId: item.fileId,
    outcome: await _sendFile({ context: context, slot: slot, item: item }),
  });
  await _drainQueue({ context: context, slot: slot });
}

/**
 * Every slot draining the queue at once.
 *
 * A lane that rejects (a caller's `onEvent` that threw, say) aborts the run
 * before `start` rejects with it, so the other lanes stop where they are
 * rather than carry on sending after the caller has been told it failed.
 */
export async function drainUploadEngineLanes(
  functionOptions: Readonly<{
    context: EngineContext;
    slots: readonly WorkerSlot[];
  }>,
): Promise<void> {
  const { context, slots } = functionOptions;

  await Promise.all(
    slots.map((slot) => {
      return _drainQueue({ context: context, slot: slot }).catch(
        (error: unknown) => {
          context.controller.abort();
          throw error;
        },
      );
    }),
  );
}

// Dispatch the prepared file while forwarding its progress events.
function _sendPreparedFile(
  options: Readonly<SendPreparedFileOptions>,
): Promise<TransferOutcome> {
  const { context, item, prepared, common } = options;
  if (typeof prepared === "string") {
    return failUploadFile({
      ...common,
      problemCode: "connection_lost",
      detail: prepared,
    });
  }
  return transferUploadFile({
    ...common,
    ...prepared,
    file: item.file,
    transport: context.transport,
    onProgress: (progress) => {
      context.onEvent({
        kind: "file-progress",
        fileId: item.fileId,
        ...progress,
      });
    },
  });
}
