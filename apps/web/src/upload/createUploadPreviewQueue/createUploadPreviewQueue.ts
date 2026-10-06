import type {
  MadeDerivative,
  PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";
import { makeVideoDerivativesFromFile } from "@/upload/makeVideoDerivativesFromFile/makeVideoDerivativesFromFile";
import { makeMediaWorkerClientFromPort } from "@/upload/mediaWorker/makeMediaWorkerClientFromPort";
import type { ImageDerivativesResult } from "@/upload/makeImageDerivativesFromFile/makeImageDerivativesFromFile.types";
import { getDerivativePlanFromSize } from "@/upload/makeImageDerivativesFromFile/getDerivativePlanFromSize";
import { appConfig } from "../../../../../app.config";
import type {
  CreateUploadPreviewQueueOptions,
  UploadPreviewContext,
  UploadPreviewInput,
  UploadPreviewQueue,
} from "./createUploadPreviewQueue.types";

function _getDependenciesFromOptions({
  createMediaWorker = () => {
    return new Worker(
      new URL("../mediaWorker/mediaWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );
  },
  makeVideoDerivativesFromFile:
    makeVideoDerivativesFromFileDependency = makeVideoDerivativesFromFile,
  createObjectUrl = (blob) => {
    return URL.createObjectURL(blob);
  },
  revokeObjectUrl = (url) => {
    return URL.revokeObjectURL(url);
  },
  maxCachedEntries = 100,
  maxCachedBytes = 24 * 1024 * 1024,
}: Readonly<CreateUploadPreviewQueueOptions>): Required<CreateUploadPreviewQueueOptions> {
  return {
    createMediaWorker: createMediaWorker,
    makeVideoDerivativesFromFile: makeVideoDerivativesFromFileDependency,
    createObjectUrl: createObjectUrl,
    revokeObjectUrl: revokeObjectUrl,
    maxCachedEntries,
    maxCachedBytes,
  };
}

function _requestPreview({
  context,
  input,
}: Readonly<{
  context: UploadPreviewContext;
  input: Readonly<UploadPreviewInput>;
}>): void {
  if (context.isDestroyed) {
    return;
  }
  context.activeFileIds.add(input.fileId);
  if (context.values.has(input.fileId)) {
    _touchCachedPreview({ context, fileId: input.fileId });
    return;
  }
  // Each viewport re-entry owns a distinct token, even with the same input.
  context.requests.set(input.fileId, { ...input });
  context.values.set(input.fileId, { kind: "preparing", size: input.size });
  _notify(context);
  _startQueuedPreview(context);
}

function _disposePreview({
  context,
  fileId,
}: Readonly<{ context: UploadPreviewContext; fileId: string }>): boolean {
  const preview = context.values.get(fileId);
  if (preview?.kind === "ready") {
    context.options.revokeObjectUrl(preview.url);
  }
  context.requests.delete(fileId);
  context.activeFileIds.delete(fileId);
  context.cachedBytes -= context.cachedByteSizes.get(fileId) ?? 0;
  context.cachedByteSizes.delete(fileId);
  return context.values.delete(fileId);
}

function _touchCachedPreview({
  context,
  fileId,
}: Readonly<{ context: UploadPreviewContext; fileId: string }>): void {
  const bytes = context.cachedByteSizes.get(fileId);
  if (bytes !== undefined) {
    context.cachedByteSizes.delete(fileId);
    context.cachedByteSizes.set(fileId, bytes);
  }
}

function _trimCachedPreviews(context: UploadPreviewContext): boolean {
  let hasChanged = false;
  context.cachedByteSizes.forEach((_, fileId) => {
    const isOverBudget =
      context.cachedByteSizes.size > context.options.maxCachedEntries ||
      context.cachedBytes > context.options.maxCachedBytes;
    if (isOverBudget && !context.activeFileIds.has(fileId)) {
      hasChanged = _disposePreview({ context, fileId }) || hasChanged;
    }
  });
  return hasChanged;
}

function _deactivate({
  context,
  fileId,
}: Readonly<{ context: UploadPreviewContext; fileId: string }>): void {
  context.activeFileIds.delete(fileId);
  context.requests.delete(fileId);
  const hasCancelled =
    context.values.get(fileId)?.kind === "preparing" &&
    context.values.delete(fileId);
  const hasEvicted = _trimCachedPreviews(context);
  if (hasCancelled || hasEvicted) {
    _notify(context);
  }
}

function _release({
  context,
  fileId,
}: Readonly<{ context: UploadPreviewContext; fileId: string }>): void {
  if (_disposePreview({ context, fileId })) {
    _notify(context);
  }
}

function _notify(context: UploadPreviewContext): void {
  context.listeners.forEach((listener) => {
    return listener();
  });
}

function _recycleWorker(context: UploadPreviewContext): void {
  context.worker?.terminate();
  context.worker = undefined;
  context.wasmDecodeCount = 0;
}

function _startQueuedPreview(context: UploadPreviewContext): void {
  if (context.isActive || context.isPaused || context.isDestroyed) {
    return;
  }
  const input = context.requests.values().next().value;
  if (!input) {
    return;
  }
  context.isActive = true;
  void _preparePreview({ context: context, input: input }).finally(() => {
    context.isActive = false;
    _startQueuedPreview(context);
  });
}

function _getPreviewDerivativesFromImage({
  made,
  input,
}: Readonly<{
  made: ImageDerivativesResult;
  input: UploadPreviewInput;
}>): MadeDerivative[] {
  const size = made.originalSize;
  if (
    input.contentType !== "image/jpeg" ||
    !size ||
    made.dropDetail !== undefined
  ) {
    return made.derivatives;
  }
  const plan = getDerivativePlanFromSize({
    contentType: input.contentType,
    size,
  });
  const needsThumbnail = plan.some((target) => {
    return target.purpose === "thumb";
  });
  return needsThumbnail
    ? made.derivatives
    : [{ purpose: "thumb", blob: input.file, ...size }];
}

async function _getDerivativesFromInput({
  context,
  input,
}: Readonly<{
  context: UploadPreviewContext;
  input: Readonly<UploadPreviewInput>;
}>): Promise<{ derivatives: MadeDerivative[]; size?: PixelSize }> {
  if (input.contentType.startsWith("video/")) {
    return context.options.makeVideoDerivativesFromFile(input.file);
  }
  if (!input.contentType.startsWith("image/")) {
    return { derivatives: [] };
  }
  context.worker ??= makeMediaWorkerClientFromPort(
    context.options.createMediaWorker(),
  );
  const made = await context.worker.makeImageDerivativesFromFile({
    file: input.file,
    contentType: input.contentType,
    size: input.size,
  });
  if (made.usedWasmDecoder) {
    context.wasmDecodeCount += 1;
  }
  if (
    context.wasmDecodeCount >= appConfig.upload.heicWorkerRecycleCount ||
    (made.usedWasmDecoder && made.dropDetail !== undefined)
  ) {
    _recycleWorker(context);
  }
  return {
    derivatives: _getPreviewDerivativesFromImage({ made, input }),
    size: made.originalSize ?? input.size,
  };
}

async function _preparePreview({
  context,
  input,
}: Readonly<{
  context: UploadPreviewContext;
  input: Readonly<UploadPreviewInput>;
}>): Promise<void> {
  try {
    const made = await _getDerivativesFromInput({
      context: context,
      input: input,
    });
    if (context.isDestroyed || context.requests.get(input.fileId) !== input) {
      return;
    }
    _cacheCompletedPreview({ context, input, made });
  } catch {
    _recycleWorker(context);
    if (context.isDestroyed || context.requests.get(input.fileId) !== input) {
      return;
    }
    context.values.set(input.fileId, { kind: "unavailable", size: input.size });
    context.cachedByteSizes.set(input.fileId, 0);
    _trimCachedPreviews(context);
  } finally {
    if (context.requests.get(input.fileId) === input) {
      context.requests.delete(input.fileId);
      _notify(context);
    }
  }
}

function _cacheCompletedPreview({
  context,
  input,
  made,
}: Readonly<{
  context: UploadPreviewContext;
  input: Readonly<UploadPreviewInput>;
  made: { derivatives: MadeDerivative[]; size?: PixelSize };
}>): void {
  const thumb = made.derivatives.find((derivative) => {
    return derivative.purpose === "thumb";
  });
  context.values.set(
    input.fileId,
    thumb
      ? {
          kind: "ready",
          url: context.options.createObjectUrl(thumb.blob),
          width: thumb.width,
          height: thumb.height,
        }
      : { kind: "unavailable", size: made.size ?? input.size },
  );
  const bytes = thumb?.blob.size ?? 0;
  context.cachedByteSizes.set(input.fileId, bytes);
  context.cachedBytes += bytes;
  _trimCachedPreviews(context);
}

function _makeQueueFromContext(
  context: UploadPreviewContext,
): UploadPreviewQueue {
  return {
    getPreview: (fileId) => {
      return context.values.get(fileId);
    },
    subscribe: (listener) => {
      context.listeners.add(listener);
      return () => {
        context.listeners.delete(listener);
      };
    },
    requestPreview: (input) => {
      return _requestPreview({ context: context, input: input });
    },
    deactivate: (fileId) => {
      return _deactivate({ context, fileId });
    },
    release: (fileId) => {
      return _release({ context: context, fileId: fileId });
    },
    setPaused: (isPaused) => {
      context.isPaused = isPaused;
      _startQueuedPreview(context);
    },
    destroy: () => {
      context.isDestroyed = true;
      _recycleWorker(context);
      [...context.values.keys()].forEach((fileId) => {
        return _release({ context: context, fileId: fileId });
      });
      context.listeners.clear();
    },
  };
}

/** Sequential thumbnail preparation with a bounded, inactive LRU cache. */
export function createUploadPreviewQueue(
  options: Readonly<CreateUploadPreviewQueueOptions> = {},
): UploadPreviewQueue {
  return _makeQueueFromContext({
    options: _getDependenciesFromOptions(options),
    values: new Map(),
    requests: new Map(),
    activeFileIds: new Set(),
    cachedByteSizes: new Map(),
    cachedBytes: 0,
    listeners: new Set(),
    wasmDecodeCount: 0,
    isActive: false,
    isPaused: false,
    isDestroyed: false,
  });
}
