import {
  type TransferUploadFileOptions,
  type TransferApi,
} from "@/upload/transferUploadFile/transferUploadFile.types";
import type {
  CompleteUploadFileResponse,
  UploadProblemCode,
  UploadSessionState,
} from "@memory-shoebox/shared";

import type {
  MadeDerivative,
  PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import { type VideoDerivativesResult } from "@/upload/makeVideoDerivativesFromFile/makeVideoDerivativesFromFile.types";

import { type MediaWorkerClient } from "@/upload/mediaWorker/makeMediaWorkerClientFromPort";

import type { MediaWorkerPort } from "@/upload/mediaWorker/mediaWorkerProtocol.types";

import type { RetryPolicy } from "@/upload/transferUploadFile/transferPlanningHelpers";

import { type UploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

/** Inputs for _prepareImage. */
export type PrepareImageOptions = {
  context: EngineContext;
  slot: WorkerSlot;
  file: File;
  contentType: string;
};

/**
 * The routes the engine calls: the transfer's two, and the batch read that
 * tells `settled` the state after a skipped duplicate. Injectable for tests.
 */
export type UploadApi = TransferApi &
  Pick<
    typeof import("@/api/uploadsHelpers/uploadsHelpers"),
    "getUploadSession"
  >;

/** One committed file to send: its manifest row, and the `File` itself. */
export type UploadEngineFile = { fileId: string; file: File };

/** Upload engine events for presenting preparation and transfer progress. */
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
   * At most once per start, as its last event after every lane ends. Carries
   * the final session state, including settlement learned from the session read
   * after a duplicate skip.
   *
   * No event for empty input, cancellation, batch-closed, or when neither a
   * completion response nor the duplicate session read establishes the state.
   * start resolving, rather than this event, marks the end of the run.
   */
  | { kind: "settled"; sessionState: UploadSessionState }
  /**
   * The run stopped because the batch was closed or cancelled elsewhere ("send
   * what did arrive" on another device, say): a transfer was told the batch is
   * gone, so nothing more was hashed, decoded or sent, and the files still in
   * flight report no ending. At most once, and then the run's last event.
   */
  | { kind: "batch-closed" };

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
  onEvent: (event: Readonly<UploadEngineEvent>) => void;
  /** A fresh media worker. Defaults to the real one; injectable for tests. */
  createMediaWorker?: () => MediaWorkerPort;
  /** The PUT. Defaults to `XMLHttpRequest`; injectable for tests. */
  transport?: UploadTransport;
  /** The poster maker. Defaults to the real one; jsdom has no `<video>`. */
  makeVideoDerivativesFromFile?: (
    file: Blob,
  ) => Promise<VideoDerivativesResult>;
  retry?: RetryPolicy;
};

/** One of the `concurrency` lanes: its worker, and what that worker cost. */
export type WorkerSlot = {
  client: MediaWorkerClient | undefined;
  /** HEIC decodes through libheif since this worker started. */
  wasmDecodeCount: number;
};

/** What one file's preparation produced, ready to transfer. */
export type PreparedFile = {
  contentHash: string;
  derivatives: MadeDerivative[];
  size: PixelSize | undefined;
  durationMs: number | undefined;
};

/** The engine's state, shared by every slot of one batch. */
export type EngineContext = Required<
  Omit<CreateUploadEngineOptions, "concurrency" | "retry">
> & {
  concurrency: number;
  retry: RetryPolicy | undefined;
  controller: AbortController;
  queue: UploadEngineFile[];
  /** The `complete` answers this run has had: the latch's, and the last. */
  answers: {
    latched: CompleteUploadFileResponse | undefined;
    latest: CompleteUploadFileResponse | undefined;
  };
  /** Whether presign cancelled any file of this run as a duplicate. */
  hasSkippedFile: boolean;
  /** Whether a transfer found the batch gone, which stopped the run. */
  isBatchClosed: boolean;
};

/** Prepared payload and bound dependencies for dispatching one upload file. */
export type SendPreparedFileOptions = {
  context: EngineContext;
  item: UploadEngineFile;
  prepared: PreparedFile | string;
  common: Pick<
    TransferUploadFileOptions,
    "sessionId" | "fileId" | "api" | "signal" | "retry"
  >;
};
