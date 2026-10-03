import type {
  CompleteUploadFileResponse,
  PresignMultipart,
  UploadProblemCode,
} from "@memory-shoebox/shared";

import type {
  MadeDerivative,
  PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import {
  type PartRange,
  type RetryPolicy,
} from "@/upload/transferUploadFile/transferPlanningHelpers";

import type { UploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

/** Inputs for _withApiRetry. */
export type WithApiRetryOptions<T> = {
  state: RetryState;
  call: () => Promise<T>;
  isRetryable?: (error: unknown) => boolean;
  attempt?: number;
};

/** Inputs for failUploadFile. */
export type FailUploadFileOptions = {
  sessionId: string;
  fileId: string;
  api: TransferApi;
  signal: AbortSignal;
  problemCode: UploadProblemCode;
  detail: string;
  retry?: RetryPolicy;
};

/** The two routes a transfer calls. Injectable, so tests need no server. */
export type TransferApi = Pick<
  typeof import("@/api/uploadsHelpers/uploadsHelpers"),
  "presignUploadFile" | "completeUploadFile"
>;

/** Bytes sent so far for one file, of all it will send. */
export type TransferProgress = { sentBytes: number; totalBytes: number };

/** Everything one file's transfer needs. */
export type TransferUploadFileOptions = {
  sessionId: string;
  fileId: string;
  file: Blob;
  contentHash: string;
  derivatives: MadeDerivative[];
  /**
   * Post-orientation, as `complete` wants it. Undefined when nothing could say.
   */
  size: PixelSize | undefined;
  durationMs: number | undefined;
  api: TransferApi;
  transport: UploadTransport;
  signal: AbortSignal;
  onProgress: (progress: Readonly<TransferProgress>) => void;
  retry?: RetryPolicy;
  /** Milliseconds since the epoch. Injectable so expiry is testable. */
  now?: () => number;
};

/** How one file's transfer ended. */
export type TransferOutcome =
  | { outcome: "done"; response: CompleteUploadFileResponse }
  | {
      outcome: "failed";
      problemCode: UploadProblemCode;
      detail: string;
      /**
       * The failed `complete`'s answer, or undefined if even that did not land.
       */
      response: CompleteUploadFileResponse | undefined;
    }
  /**
   * Presign found these bytes in another row of the batch and cancelled this
   * one itself (design decision 15). Nothing else is sent for it.
   */
  | { outcome: "skipped"; reason: "duplicate"; holderFileId: string }
  /**
   * The batch itself is gone: closed ("send what did arrive") or cancelled
   * elsewhere, so nothing more of it can be sent. The file reports nothing,
   * and whoever runs the batch should stop.
   */
  | { outcome: "batch-closed" }
  /** Cancelled here. Nothing to report. */
  | { outcome: "aborted" };

/** One file's transfer state, threaded through every step. */
export type TransferContext = Omit<
  TransferUploadFileOptions,
  "retry" | "now"
> & {
  retry: RetryPolicy;
  now: () => number;
  /** Bytes of earlier PUTs that landed, for the progress figure. */
  landedBytes: number;
  /** All the file will send. Shrinks when a derivative is dropped. */
  totalBytes: number;
  /** The highest figure reported so far: progress never steps back. */
  reportedBytes: number;
  /** The `429`s waited out so far, against `RATE_LIMIT_MAX_WAITS`. */
  rateLimitWaitCount: number;
  /** What is left of `OFFLINE_WAIT_CEILING_MS` for this file. */
  offlineBudgetMs: number;
};

/** What the retries of one file share: the policy, and what it has spent. */
export type RetryState = Pick<
  TransferContext,
  "retry" | "signal" | "now" | "rateLimitWaitCount" | "offlineBudgetMs"
>;

/** One failed try, as the retry plan reads it. */
export type FailedTry = {
  error: unknown;
  attempt: number;
  isRetryable: boolean;
  /** No answer at all, the one failure being offline explains. */
  isUnanswered: boolean;
};

/** One part that landed, with the ETag `complete` hands to Backblaze. */
export type SentPart = { partNumber: number; etag: string };

/**
 * A presigned URL, and when this browser received it. The server's
 * `expiresAt` is deliberately not kept: it is on the server's clock, and a
 * lease's life is judged on this one (see `isLeaseLongEnoughForBytes`).
 */
export type UrlLease = { url: string; receivedAtMs: number };

/** A single-PUT presign: its URL, and the headers to send with it. */
export type SingleLease = UrlLease & { headers: Record<string, string> };

/** What one failed try is followed by. */
export type RetryPlan =
  | { kind: "rate-limited"; waitMs: number }
  | { kind: "offline" }
  | { kind: "backoff" }
  | { kind: "give-up" };

/**
 * What a PUT needs, and how to get a fresh URL for it: after a 401 or 403, or
 * before a retry its URL could not carry to the end.
 */
export type PutRequest = {
  context: TransferContext;
  lease: UrlLease;
  headers: Record<string, string>;
  body: Blob;
  /** A fresh URL for exactly this PUT: the same part, or the same file. */
  represign: () => Promise<UrlLease>;
};

/** The multipart state one file carries from part to part. */
export type MultipartState = {
  presigned: PresignMultipart;
  leases: Map<number, UrlLease>;
};

/** What sending one part needs to know about the parts around it. */
export type PartRequest = {
  context: TransferContext;
  state: MultipartState;
  range: PartRange;
  laterPartNumbers: number[];
};
