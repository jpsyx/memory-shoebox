import type { PixelSize } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";
import type { MediaWorkerClient } from "@/upload/mediaWorker/makeMediaWorkerClientFromPort";
import type { MediaWorkerPort } from "@/upload/mediaWorker/mediaWorkerProtocol.types";

/** A local picked file; dimensions, when known, are post-orientation. */
export type UploadPreviewInput = {
  fileId: string;
  file: File;
  contentType: string;
  size?: PixelSize;
};

/** Stable per-file value until its preparation state actually changes. */
export type UploadPreview =
  | { kind: "preparing"; size?: PixelSize }
  | { kind: "unavailable"; size?: PixelSize }
  | ({ kind: "ready"; url: string } & PixelSize);

/** Dependencies default to the same worker and video helper as transfer. */
export type CreateUploadPreviewQueueOptions = {
  createMediaWorker?: () => MediaWorkerPort;
  makeVideoDerivativesFromFile?: typeof import("@/upload/makeVideoDerivativesFromFile/makeVideoDerivativesFromFile").makeVideoDerivativesFromFile;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
};

/** One provider owns this queue and destroys it on replacement or teardown. */
export type UploadPreviewQueue = {
  /** Undefined before request or after release; suitable for external stores. */
  getPreview: (fileId: string) => UploadPreview | undefined;
  /** Publishes only changed preview values, never for a repeated request. */
  subscribe: (listener: () => void) => () => void;
  /** Retains the handle only until its single sequential decode finishes. */
  requestPreview: (input: Readonly<UploadPreviewInput>) => void;
  /** Drops queued work and revokes a ready URL; late results are discarded. */
  release: (fileId: string) => void;
  /** Stops new decodes while transfer owns its preparation lanes. */
  setPaused: (isPaused: boolean) => void;
  /** Synchronously releases URLs and workers; video cleanup uses its timeout. */
  destroy: () => void;
};

/** Internal queue resources; each request object is its cancellation token. */
export type UploadPreviewContext = {
  options: Required<CreateUploadPreviewQueueOptions>;
  values: Map<string, UploadPreview>;
  requests: Map<string, Readonly<UploadPreviewInput>>;
  listeners: Set<() => void>;
  worker?: MediaWorkerClient;
  wasmDecodeCount: number;
  isActive: boolean;
  isPaused: boolean;
  isDestroyed: boolean;
};
