import type {
  CompleteUploadFileResponse,
  UploadProblemCode,
  UploadSessionState,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../../app.config";
import {
  completeUploadFile,
  getUploadSession,
  presignUploadFile,
} from "@/api/uploads/uploads";
import { getImageHeaderFromFile } from "@/upload/getImageHeaderFromFile/getImageHeaderFromFile";
import { getQuickTimeHeaderFromBlob } from "@/upload/getQuickTimeHeaderFromBlob/getQuickTimeHeaderFromBlob";
import { getDeclaredContentTypeFromFile } from "@/upload/getManifestEntryFromFile/getManifestEntryFromFile";
import type {
  MadeDerivative,
  PixelSize,
} from "@/upload/jpegDerivatives/jpegDerivatives";
import {
  makeVideoDerivatives,
  type VideoDerivativesResult,
} from "@/upload/makeVideoDerivatives/makeVideoDerivatives";
import {
  makeMediaWorkerClientFromPort,
  type MediaWorkerClient,
} from "@/upload/mediaWorker/mediaWorkerClient";
import type { MediaWorkerPort } from "@/upload/mediaWorker/mediaWorkerProtocol";
import type { ImageDerivativesResult } from "@/upload/makeImageDerivatives/makeImageDerivatives";
import type { RetryPolicy } from "@/upload/transferUploadFile/transferPlanning";
import {
  failUploadFile,
  transferUploadFile,
  type TransferApi,
  type TransferOutcome,
} from "@/upload/transferUploadFile/transferUploadFile";
import {
  createXhrUploadTransport,
  type UploadTransport,
} from "@/upload/transferUploadFile/uploadTransport";

/**
 * The routes the engine calls: the transfer's two, and the batch read that
 * tells `settled` the state after a skipped duplicate. Injectable for tests.
 */
export type UploadApi = TransferApi &
  Pick<typeof import("@/api/uploads/uploads"), "getUploadSession">;

/** One committed file to send: its manifest row, and the `File` itself. */
export type UploadEngineFile = { fileId: string; file: File };

/** Everything step 7b draws, as it happens. */
export type UploadEngineEvent =
  /** A lane picked the file up: hashing begins. Before any of its bytes. */
  | { kind: "file-started"; fileId: string }
  | {
      kind: "file-progress";
      fileId: string;
      sentBytes: number;
      totalBytes: number;
    }
  | { kind: "file-done"; fileId: string; response: CompleteUploadFileResponse }
  | {
      kind: "file-failed";
      fileId: string;
      problemCode: UploadProblemCode;
      detail: string;
    }
  /**
   * Presign found these bytes in another file of the batch and cancelled this
   * one (design decision 15). It ends the file as the two above do, and
   * nothing else is sent for it.
   */
  | { kind: "file-skipped"; fileId: string; reason: "duplicate" }
  /**
   * At most once per `start`, and then its last event, after every file has
   * ended: the batch's state then, `settled` when this run fired the latch.
   * **None** for an empty input, for a run that was cancelled, or for one in
   * which no `complete` answered, because then nothing says what state the
   * batch is in. `start` resolving, not this event, is the end of a run.
   */
  | { kind: "settled"; sessionState: UploadSessionState };

/** A running batch: start it once, cancel it at most once. */
export type UploadEngine = {
  start: (files: readonly UploadEngineFile[]) => Promise<void>;
  cancel: () => void;
};

/** What `createUploadEngine` takes. Everything but two has a default. */
export type CreateUploadEngineOptions = {
  sessionId: string;
  /** Files in flight at once. `appConfig.upload.maxParallelTransfers`. */
  concurrency?: number;
  /** The three routes. Defaults to `src/api/uploads`; injectable for tests. */
  api?: UploadApi;
  onEvent: (event: UploadEngineEvent) => void;
  /** A fresh media worker. Defaults to the real one; injectable for tests. */
  createMediaWorker?: () => MediaWorkerPort;
  /** The PUT. Defaults to `XMLHttpRequest`; injectable for tests. */
  transport?: UploadTransport;
  /** The poster maker. Defaults to the real one; jsdom has no `<video>`. */
  makeVideoDerivatives?: (file: Blob) => Promise<VideoDerivativesResult>;
  retry?: RetryPolicy;
};

/** One of the `concurrency` lanes: its worker, and what that worker cost. */
type WorkerSlot = {
  client: MediaWorkerClient | null;
  /** HEIC decodes through libheif since this worker started. */
  wasmDecodeCount: number;
};

/** What one file's preparation produced, ready to transfer. */
type PreparedFile = {
  contentHash: string;
  derivatives: MadeDerivative[];
  size: PixelSize | null;
  durationMs: number | null;
};

/** The engine's state, shared by every slot of one batch. */
type EngineContext = Required<
  Omit<CreateUploadEngineOptions, "concurrency" | "retry">
> & {
  concurrency: number;
  retry: RetryPolicy | undefined;
  controller: AbortController;
  queue: UploadEngineFile[];
  /** The `complete` answers this run has had: the latch's, and the last. */
  answers: {
    latched: CompleteUploadFileResponse | null;
    latest: CompleteUploadFileResponse | null;
  };
  /** Whether presign cancelled any file of this run as a duplicate. */
  hasSkippedFile: boolean;
};

/** The real worker, as a module worker so it can lazy-load libheif. */
function _createBrowserMediaWorker(): MediaWorkerPort {
  return new Worker(new URL("../mediaWorker/mediaWorker.ts", import.meta.url), {
    type: "module",
  });
}

/**
 * The slot's worker, started on first use.
 *
 * Never started once the run is cancelled: `cancel` ends the workers, and a
 * file still being prepared on the main thread (a header read, a video's
 * poster) would otherwise start a new one that nothing will ever end.
 */
function _getClient(
  context: EngineContext,
  slot: WorkerSlot,
): MediaWorkerClient {
  context.controller.signal.throwIfAborted();
  slot.client ??= makeMediaWorkerClientFromPort(context.createMediaWorker());
  return slot.client;
}

/**
 * Ends the slot's worker and lets the next file start a fresh one.
 *
 * libheif's heap grows to about 174 MB after a 24 MP file and never shrinks
 * (decision 1), so a worker that has decoded
 * `appConfig.upload.heicWorkerRecycleCount` HEIC files through it is replaced.
 * A worker that errored is replaced the same way, since it may be broken.
 */
function _recycleWorker(slot: WorkerSlot): void {
  slot.client?.terminate();
  slot.client = null;
  slot.wasmDecodeCount = 0;
}

/**
 * Whether libheif was tried and a derivative was dropped as a result.
 *
 * A decode that timed out or was aborted can leave libheif's runtime in an
 * unknown state, so that worker is replaced at once rather than after
 * `appConfig.upload.heicWorkerRecycleCount` attempts.
 */
function _isLibheifRunSuspect(
  made: Readonly<
    Pick<ImageDerivativesResult, "usedWasmDecoder" | "dropDetail">
  >,
): boolean {
  return made.usedWasmDecoder && made.dropDetail !== undefined;
}

/** An image's derivatives, made in the slot's worker, and its size. */
async function _prepareImage(options: {
  context: EngineContext;
  slot: WorkerSlot;
  file: File;
  contentType: string;
}): Promise<Omit<PreparedFile, "contentHash">> {
  const { slot } = options;
  const header = await getImageHeaderFromFile(options.file);
  const size =
    header.width === null || header.height === null
      ? null
      : { width: header.width, height: header.height };
  const made = await _getClient(options.context, slot).makeImageDerivatives({
    file: options.file,
    contentType: options.contentType,
    size,
  });
  if (made.usedWasmDecoder) {
    slot.wasmDecodeCount += 1;
  }
  if (
    slot.wasmDecodeCount >= appConfig.upload.heicWorkerRecycleCount ||
    _isLibheifRunSuspect(made)
  ) {
    _recycleWorker(slot);
  }
  return {
    derivatives: made.derivatives,
    size: made.originalSize ?? size,
    durationMs: null,
  };
}

/**
 * A video's poster and thumb, on the main thread, with its size and duration.
 *
 * The size is the decoder's when it drew a poster and the track header's when
 * it could not, so a codec this browser cannot play still completes:
 * `complete` needs dimensions, and the file itself states them.
 */
async function _prepareVideo(
  context: EngineContext,
  file: File,
): Promise<Omit<PreparedFile, "contentHash">> {
  const [made, movie] = await Promise.all([
    context.makeVideoDerivatives(file),
    getQuickTimeHeaderFromBlob(file),
  ]);
  const trackSize =
    movie.width === null || movie.height === null
      ? null
      : { width: movie.width, height: movie.height };
  return {
    derivatives: made.derivatives,
    size: made.size ?? trackSize,
    durationMs: movie.durationMs,
  };
}

/** Hash, then derivatives: decision 8's first two steps. */
async function _prepareFile(
  context: EngineContext,
  slot: WorkerSlot,
  file: File,
): Promise<PreparedFile> {
  const contentHash = await _getClient(context, slot).hash(file);
  const contentType = getDeclaredContentTypeFromFile(file);
  if (contentType.startsWith("image/")) {
    return {
      contentHash,
      ...(await _prepareImage({ context, slot, file, contentType })),
    };
  }
  if (contentType.startsWith("video/")) {
    return { contentHash, ...(await _prepareVideo(context, file)) };
  }
  return { contentHash, derivatives: [], size: null, durationMs: null };
}

/** The event one file's ending owes the caller, and its answer kept. */
function _emitOutcome(
  context: EngineContext,
  fileId: string,
  outcome: TransferOutcome,
): void {
  // A cancelled run reports no ending, even for an answer that was already
  // on its way back when `cancel` was called.
  if (outcome.outcome === "aborted" || context.controller.signal.aborted) {
    return;
  }
  if (outcome.outcome === "skipped") {
    context.hasSkippedFile = true;
    context.onEvent({ kind: "file-skipped", fileId, reason: outcome.reason });
    return;
  }
  if (outcome.response !== null) {
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
 * The batch's state as this run leaves it, or null when nothing can say.
 *
 * The latch's answer says `settled`; without one, the newest answer says what
 * the batch is now. **A skipped duplicate is the exception.** Presign
 * cancelled it and ran the latch in the same transaction, and its `409`
 * carries no state, so that cancel may be what settled the batch with no
 * `complete` here to say so. After a skip, the batch itself is read.
 */
async function _getFinalSessionState(
  context: EngineContext,
): Promise<UploadSessionState | null> {
  const { latched, latest } = context.answers;
  if (latched !== null) {
    return latched.sessionState;
  }
  if (!context.hasSkippedFile) {
    return latest?.sessionState ?? null;
  }
  return context.api
    .getUploadSession({ sessionId: context.sessionId, limit: 1 })
    .then(
      (detail) => {
        return detail.state;
      },
      () => {
        return latest?.sessionState ?? null;
      },
    );
}

/**
 * The one `settled` a run ends with, once every lane has drained.
 *
 * At the end rather than when the latch's answer arrives, because with two
 * lanes the other file's answer can arrive after it, and `settled` must be
 * the last event of a run. A run that was cancelled, or that ended no file,
 * has nothing to report and emits nothing.
 */
async function _emitSettled(context: EngineContext): Promise<void> {
  if (context.controller.signal.aborted) {
    return;
  }
  const sessionState = await _getFinalSessionState(context);
  if (sessionState !== null && !context.controller.signal.aborted) {
    context.onEvent({ kind: "settled", sessionState });
  }
}

/**
 * One file, start to finish: hash, derivatives, original, derivatives,
 * complete. A file the browser could not read, or whose worker died, is
 * failed rather than waited on.
 */
async function _sendFile(
  context: EngineContext,
  slot: WorkerSlot,
  item: UploadEngineFile,
): Promise<TransferOutcome> {
  const common = {
    sessionId: context.sessionId,
    fileId: item.fileId,
    api: context.api,
    signal: context.controller.signal,
    ...(context.retry === undefined ? {} : { retry: context.retry }),
  };
  const prepared = await _prepareFile(context, slot, item.file).catch(
    (error: unknown) => {
      _recycleWorker(slot);
      // The worker's own words, which already name the browser's error.
      return error instanceof Error ? error.message : String(error);
    },
  );
  // Preparation runs on the main thread in part (a header read, a video's
  // poster), which a cancel cannot interrupt, so it is checked on the way out.
  if (context.controller.signal.aborted) {
    return { outcome: "aborted" };
  }
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

/** One slot draining the shared queue, a file at a time, until it is empty. */
async function _drainQueue(
  context: EngineContext,
  slot: WorkerSlot,
): Promise<void> {
  const item = context.queue.shift();
  if (item === undefined || context.controller.signal.aborted) {
    return;
  }
  context.onEvent({ kind: "file-started", fileId: item.fileId });
  _emitOutcome(context, item.fileId, await _sendFile(context, slot, item));
  await _drainQueue(context, slot);
}

/**
 * Every slot draining the queue at once.
 *
 * A lane that rejects (a caller's `onEvent` that threw, say) aborts the run
 * before `start` rejects with it, so the other lanes stop where they are
 * rather than carry on sending after the caller has been told it failed.
 */
async function _drainAllLanes(
  context: EngineContext,
  slots: readonly WorkerSlot[],
): Promise<void> {
  await Promise.all(
    slots.map((slot) => {
      return _drainQueue(context, slot).catch((error: unknown) => {
        context.controller.abort();
        throw error;
      });
    }),
  );
}

/** Every option resolved to its default, and the batch's own state. */
function _makeContextFromOptions(
  input: Readonly<{
    options: Readonly<CreateUploadEngineOptions>;
    controller: AbortController;
    files: readonly UploadEngineFile[];
  }>,
): EngineContext {
  const { options } = input;
  return {
    sessionId: options.sessionId,
    concurrency: options.concurrency ?? appConfig.upload.maxParallelTransfers,
    api: options.api ?? {
      presignUploadFile,
      completeUploadFile,
      getUploadSession,
    },
    onEvent: options.onEvent,
    createMediaWorker: options.createMediaWorker ?? _createBrowserMediaWorker,
    transport: options.transport ?? createXhrUploadTransport(),
    makeVideoDerivatives: options.makeVideoDerivatives ?? makeVideoDerivatives,
    retry: options.retry,
    controller: input.controller,
    queue: [...input.files],
    answers: { latched: null, latest: null },
    hasSkippedFile: false,
  };
}

/**
 * The upload engine: the whole client half of `upload.md` § The transfer
 * sequence, with no UI of its own (decision 8).
 *
 * `start` takes the committed files still to send and runs each through one
 * pipeline, in decision 8's order: **hash** (streaming, in a worker),
 * **derivatives** (images in the worker, resized on decode, HEIC through
 * libheif where the browser cannot; videos on the main thread, the only
 * thread with a `<video>`), the **original** (one PUT, or its parts), the
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
 * cancelled. A run that ended at least one file with an answer from the server
 * finishes with one `settled`, last, carrying the batch's state; an empty
 * input, a cancelled run and a run no `complete` answered emit none.
 * **`start` resolving is the end of a run**, with every worker terminated: that
 * is what to wait for, not for `settled`.
 *
 * **Resume** is the caller re-declaring the picked files through the manifest
 * and passing only the ones still pending: a file the manifest answered as
 * `already_done` must never be passed, because it is not to be sent again.
 *
 * `cancel` is final: it stops new work, aborts the PUTs in flight and ends
 * the workers. A cancelled file reports no ending; its row stays `sending` for
 * "send what did arrive" or a later resume, which is a new engine.
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
      const context = _makeContextFromOptions({ options, controller, files });
      const laneCount = Math.max(
        1,
        Math.min(context.concurrency, files.length),
      );
      slots = Array.from({ length: laneCount }, () => {
        return { client: null, wasmDecodeCount: 0 };
      });
      try {
        await _drainAllLanes(context, slots);
        await _emitSettled(context);
      } finally {
        slots.forEach(_recycleWorker);
        isRunning = false;
      }
    },
    cancel: () => {
      controller.abort();
      slots.forEach(_recycleWorker);
    },
  };
}
