import { appConfig } from "../../../../../app.config";
import { makeMediaWorkerClientFromPort } from "@/upload/mediaWorker/makeMediaWorkerClientFromPort";
import { makeVideoDerivativesFromFile } from "@/upload/makeVideoDerivativesFromFile/makeVideoDerivativesFromFile";
import type {
  MadeDerivative,
  PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";
import type {
  CreateUploadPreviewQueueOptions,
  UploadPreviewContext,
  UploadPreviewInput,
  UploadPreviewQueue,
} from "./uploadPreviewHelpers.types";

/** Sequential, viewport-owned thumbnail preparation independent of ingest. */
export function createUploadPreviewQueue(
  options: Readonly<CreateUploadPreviewQueueOptions> = {},
): UploadPreviewQueue {
  const context: UploadPreviewContext = {
    options: _getDependenciesFromOptions(options),
    values: new Map(),
    requests: new Map(),
    listeners: new Set(),
    wasmDecodeCount: 0,
    isActive: false,
    isPaused: false,
    isDestroyed: false,
  };
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
      return _requestPreview(context, input);
    },
    release: (fileId) => {
      return _release(context, fileId);
    },
    setPaused: (isPaused) => {
      context.isPaused = isPaused;
      _startQueuedPreview(context);
    },
    destroy: () => {
      context.isDestroyed = true;
      _recycleWorker(context);
      [...context.values.keys()].forEach((fileId) => {
        return _release(context, fileId);
      });
      context.listeners.clear();
    },
  };
}

function _getDependenciesFromOptions(
  options: Readonly<CreateUploadPreviewQueueOptions>,
): Required<CreateUploadPreviewQueueOptions> {
  return {
    createMediaWorker:
      options.createMediaWorker ??
      (() => {
        return new Worker(
          new URL("../mediaWorker/mediaWorker.ts", import.meta.url),
          {
            type: "module",
          },
        );
      }),
    makeVideoDerivativesFromFile:
      options.makeVideoDerivativesFromFile ?? makeVideoDerivativesFromFile,
    createObjectUrl:
      options.createObjectUrl ??
      ((blob) => {
        return URL.createObjectURL(blob);
      }),
    revokeObjectUrl:
      options.revokeObjectUrl ??
      ((url) => {
        return URL.revokeObjectURL(url);
      }),
  };
}

function _requestPreview(
  context: UploadPreviewContext,
  input: Readonly<UploadPreviewInput>,
): void {
  if (context.isDestroyed || context.values.has(input.fileId)) {
    return;
  }
  // Each viewport re-entry owns a distinct token, even with the same input.
  context.requests.set(input.fileId, { ...input });
  context.values.set(input.fileId, { kind: "preparing", size: input.size });
  _notify(context);
  _startQueuedPreview(context);
}

function _release(context: UploadPreviewContext, fileId: string): void {
  const preview = context.values.get(fileId);
  if (preview?.kind === "ready") {
    context.options.revokeObjectUrl(preview.url);
  }
  context.requests.delete(fileId);
  if (context.values.delete(fileId)) {
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
  void _preparePreview(context, input).finally(() => {
    context.isActive = false;
    _startQueuedPreview(context);
  });
}

async function _getDerivativesFromInput(
  context: UploadPreviewContext,
  input: Readonly<UploadPreviewInput>,
): Promise<{ derivatives: MadeDerivative[]; size?: PixelSize }> {
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
    derivatives: made.derivatives,
    size: made.originalSize ?? input.size,
  };
}

async function _preparePreview(
  context: UploadPreviewContext,
  input: Readonly<UploadPreviewInput>,
): Promise<void> {
  try {
    const made = await _getDerivativesFromInput(context, input);
    if (context.isDestroyed || context.requests.get(input.fileId) !== input) {
      return;
    }
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
  } catch {
    _recycleWorker(context);
    if (context.isDestroyed || context.requests.get(input.fileId) !== input) {
      return;
    }
    context.values.set(input.fileId, { kind: "unavailable", size: input.size });
  } finally {
    if (context.requests.get(input.fileId) === input) {
      context.requests.delete(input.fileId);
      _notify(context);
    }
  }
}
