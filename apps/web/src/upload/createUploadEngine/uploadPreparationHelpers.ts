import { appConfig } from "../../../../../app.config";

import { getImageHeaderFromFile } from "@/upload/getImageHeaderFromFile/getImageHeaderFromFile";

import { getQuickTimeHeaderFromBlob } from "@/upload/getQuickTimeHeaderFromBlob/getQuickTimeHeaderFromBlob";

import { getDeclaredContentTypeFromFile } from "@/upload/getManifestEntryFromFile/getDeclaredContentTypeFromFile";

import {
  makeMediaWorkerClientFromPort,
  type MediaWorkerClient,
} from "@/upload/mediaWorker/makeMediaWorkerClientFromPort";

import type { ImageDerivativesResult } from "@/upload/makeImageDerivativesFromFile/makeImageDerivativesFromFile.types";

import type {
  EngineContext,
  WorkerSlot,
  PrepareImageOptions,
  PreparedFile,
} from "./createUploadEngine.types";

/**
 * The slot's worker, started on first use.
 *
 * Never started once the run is cancelled: `cancel` ends the workers, and a
 * file still being prepared on the main thread (a header read, a video's
 * poster) would otherwise start a new one that nothing will ever end.
 */
function _getClient(
  functionOptions: Readonly<{ context: EngineContext; slot: WorkerSlot }>,
): MediaWorkerClient {
  const { context, slot } = functionOptions;

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
export function recycleMediaWorker(slot: WorkerSlot): void {
  slot.client?.terminate();
  slot.client = undefined;
  slot.wasmDecodeCount = 0;
}

/** An image's derivatives, made in the slot's worker, and its size. */
async function _prepareImage(
  options: PrepareImageOptions,
): Promise<Omit<PreparedFile, "contentHash">> {
  const { slot } = options;
  const header = await getImageHeaderFromFile(options.file);
  const size =
    header.width === undefined || header.height === undefined
      ? undefined
      : { width: header.width, height: header.height };
  const made = await _getClient({
    context: options.context,
    slot: slot,
  }).makeImageDerivativesFromFile({
    file: options.file,
    contentType: options.contentType,
    size,
  });
  if (made.usedWasmDecoder) {
    slot.wasmDecodeCount += 1;
  }
  if (
    slot.wasmDecodeCount >= appConfig.upload.heicWorkerRecycleCount ||
    ((
      sourceMade: Readonly<
        Pick<ImageDerivativesResult, "usedWasmDecoder" | "dropDetail">
      >,
    ): boolean => {
      return sourceMade.usedWasmDecoder && sourceMade.dropDetail !== undefined;
    })(made)
  ) {
    recycleMediaWorker(slot);
  }
  return {
    derivatives: made.derivatives,
    size: made.originalSize ?? size,
    durationMs: undefined,
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
  functionOptions: Readonly<{ context: EngineContext; file: File }>,
): Promise<Omit<PreparedFile, "contentHash">> {
  const { context, file } = functionOptions;

  const [made, movie] = await Promise.all([
    context.makeVideoDerivativesFromFile(file),
    getQuickTimeHeaderFromBlob(file),
  ]);
  const trackSize =
    movie.width === undefined || movie.height === undefined
      ? undefined
      : { width: movie.width, height: movie.height };
  return {
    derivatives: made.derivatives,
    size: made.size ?? trackSize,
    durationMs: movie.durationMs,
  };
}

/** Hash, then derivatives: decision 8's first two steps. */
export async function makePreparedUploadFileFromFile(
  functionOptions: Readonly<{
    context: EngineContext;
    slot: WorkerSlot;
    file: File;
  }>,
): Promise<PreparedFile> {
  const { context, slot, file } = functionOptions;

  const contentHash = await _getClient({ context: context, slot: slot }).hash(
    file,
  );
  const contentType = getDeclaredContentTypeFromFile(file);
  if (contentType.startsWith("image/")) {
    return {
      contentHash,
      ...(await _prepareImage({ context, slot, file, contentType })),
    };
  }
  return contentType.startsWith("video/")
    ? {
        contentHash,
        ...(await _prepareVideo({ context: context, file: file })),
      }
    : { contentHash, derivatives: [], size: undefined, durationMs: undefined };
}
