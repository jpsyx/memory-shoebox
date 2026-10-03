import type {
  CreateUploadEngineOptions,
  UploadEngine,
  WorkerSlot,
} from "./createUploadEngine.types";

import { recycleMediaWorker } from "./uploadPreparationHelpers";

import { drainUploadEngineLanes } from "./drainUploadEngineLanes";

import { emitUploadRunEnding } from "./uploadEngineEventHelpers";

import { makeContextFromOptions } from "./makeContextFromOptions";

/**
 * The upload engine: the whole client half of `upload.md` § The transfer
 * sequence, with no UI of its own (decision 8).
 *
 * `start` takes the committed files still to send and runs each through one
 * pipeline, in decision 8's order: **hash** (streaming, in a worker),
 * **derivatives** (images in the worker, resized on decode, HEIC through
 * libheif where the browser cannot; videos on the main thread, the only thread
 * with a `<video>`), the **original** (one PUT, or its parts), the
 * **derivatives'** PUTs, and **complete**. Derivatives are made before the
 * original moves, so a file's small blobs are ready the moment its big one
 * lands. They are held, a few hundred kilobytes a file, until the file's
 * transfer ends.
 *
 * **Never more than `concurrency` files at once**, each lane with its own
 * worker, because the spike found two at a time the phone's best and 264
 * concurrent completes would only queue on SQLite's one writer. A failed file
 * never stops the batch; every file starts with `file-started` and ends in
 * exactly one `file-done`, `file-failed` or `file-skipped`, unless the run is
 * cancelled. A run with a final session state from a completion response or a
 * session read after a duplicate skip emits one `settled` event, last. Empty
 * input, cancellation or an unavailable final state emits none. **`start`
 * resolving is the end of a run**, with every worker terminated: that is what
 * to wait for, not for `settled`.
 *
 * **Resume** is the caller re-declaring the picked files through the manifest
 * and passing only the ones still pending: a file the manifest answered as
 * `already_done` must never be passed, because it is not to be sent again.
 *
 * `cancel` is final: it stops new work, aborts the PUTs in flight and ends the
 * workers. A cancelled file reports no ending; its row stays `sending` for
 * "send what did arrive" or a later resume, which is a new engine. **A batch
 * closed or cancelled elsewhere** stops the run the same way, the moment a
 * transfer is told so, and the run ends with `batch-closed` rather than
 * `settled`.
 *
 * @param options.sessionId The committed session.
 * @param options.onEvent Called for every event, in order.
 */
export function createUploadEngine(
  options: Readonly<CreateUploadEngineOptions>,
): UploadEngine {
  const controller = new AbortController();
  let slots: WorkerSlot[] = [];
  let isRunning = false;
  return {
    start: async (files) => {
      if (isRunning) {
        throw new Error("This upload engine is already running");
      }
      isRunning = true;
      const context = makeContextFromOptions({ options, controller, files });
      const laneCount = Math.max(
        1,
        Math.min(context.concurrency, files.length),
      );
      slots = Array.from({ length: laneCount }, () => {
        return { client: undefined, wasmDecodeCount: 0 };
      });
      // However the run is stopped, a worker mid-hash is ended with it.
      const endWorkers = () => {
        slots.forEach(recycleMediaWorker);
      };
      controller.signal.addEventListener("abort", endWorkers, { once: true });
      try {
        await drainUploadEngineLanes({ context: context, slots: slots });
        await emitUploadRunEnding(context);
      } finally {
        controller.signal.removeEventListener("abort", endWorkers);
        endWorkers();
        isRunning = false;
      }
    },
    cancel: () => {
      controller.abort();
      slots.forEach(recycleMediaWorker);
    },
  };
}
