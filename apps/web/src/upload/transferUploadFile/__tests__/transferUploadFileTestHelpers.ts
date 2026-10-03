import type { MadeDerivative } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";
import type {
  CompleteUploadFileResponse,
  PresignUploadFileResponse,
} from "@memory-shoebox/shared";
import { vi } from "vitest";

import { type RetryPolicy } from "@/upload/transferUploadFile/transferPlanningHelpers";

import {
  type TransferApi,
  type TransferUploadFileOptions,
} from "@/upload/transferUploadFile/transferUploadFile.types";
import {
  type PutBytesOptions,
  type PutBytesResult,
  type UploadTransport,
} from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

/** Inputs for _multipart. */
export type MultipartOptions = {
  partNumbers: number[];
  prefix: string;
  expiresAt?: string;
  uploadId?: string;
};

/**
 * Stable upload-session id used by the fixtures.
 */
export const SESSION_ID = "018f0000-0000-7000-8000-00000000c001";

/**
 * Stable upload-file id used by the fixtures.
 */
export const FILE_ID = "018f0000-0000-7000-8000-00000000f001";

/**
 * Deterministic SHA-256 checksum used by the fixtures.
 */
export const HASH = "b".repeat(64);

/**
 * Transfer start timestamp used by these fixtures.
 */
export const T0 = Date.parse("2026-10-02T10:00:00.000Z");

/**
 * Future expiry timestamp used by the presigned URL fixtures.
 */
export const IN_AN_HOUR = new Date(T0 + 3_600_000).toISOString();

/** A single-PUT presign for one URL. */
export function makeSinglePresignFromOverrides(
  url: string,
): PresignUploadFileResponse {
  return {
    mode: "single",
    fileId: FILE_ID,
    method: "PUT",
    url,
    headers: { "Content-Type": "image/jpeg" },
    expiresAt: IN_AN_HOUR,
  };
}

/** A multipart presign for a 10-byte file, part URLs `<prefix>-<n>`. */
export function makeMultipartPresignFromOverrides(
  options: Readonly<Omit<MultipartOptions, "partNumbers">> &
    Readonly<{ partNumbers: readonly number[] }>,
): PresignUploadFileResponse {
  const { expiresAt = IN_AN_HOUR, uploadId = "upload-1" } = options;

  return {
    mode: "multipart",
    fileId: FILE_ID,
    multipartUploadId: uploadId,
    partSizeBytes: 4,
    partCount: 3,
    parts: options.partNumbers.map((partNumber) => {
      return { partNumber, url: `${options.prefix}-${partNumber}`, expiresAt };
    }),
    method: "PUT",
    headers: { "Content-Type": "video/quicktime" },
    expiresAt,
  };
}

/** What `complete` answers, for the state it ended in. */
export function makeCompleteResponseFromOverrides(
  state: "done" | "failed",
): CompleteUploadFileResponse {
  return {
    file: {
      fileId: FILE_ID,
      position: 0,
      originalFilename: "IMG_0001.MOV",
      declaredContentType: "video/quicktime",
      declaredBytes: 10,
      contentHash: HASH,
      state,
      attemptCount: 1,
      problemCode: null,
      problemDetail: null,
      capturedAt: null,
      capturedOn: null,
      captureOffsetMinutes: null,
      captureSource: null,
      itemId: null,
      media: null,
    },
    progress: {
      waitingCount: 0,
      sendingCount: 0,
      doneCount: state === "done" ? 1 : 0,
      failedCount: state === "failed" ? 1 : 0,
      refusedCount: 0,
      cancelledCount: 0,
      doneBytes: 0,
    },
    sessionState: "settled",
    didSettle: true,
  };
}

/** A transport that answers each PUT with the next scripted answer. */
export function makeUploadTransportFromAnswers(
  answers: ReadonlyArray<PutBytesResult | Error>,
): UploadTransport & { calls: PutBytesOptions[] } {
  const calls: PutBytesOptions[] = [];
  return {
    calls,
    putBytes: async (options) => {
      calls.push(options);
      options.onProgress(options.body.size);
      const answer = answers[calls.length - 1] ?? {
        status: 200,
        etag: undefined,
      };
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  };
}

/** An API whose presign answers in order, and whose complete succeeds. */
export function makeUploadApiFromAnswers(
  presigns: ReadonlyArray<PresignUploadFileResponse | Error>,
): TransferApi & {
  presignUploadFile: ReturnType<typeof vi.fn>;
  completeUploadFile: ReturnType<typeof vi.fn>;
} {
  let presignCount = 0;
  return {
    presignUploadFile: vi.fn(async () => {
      presignCount += 1;
      const answer = presigns[presignCount - 1];
      if (answer === undefined) {
        throw new Error(`No presign answer ${presignCount}`);
      }
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    }),
    completeUploadFile: vi.fn(async (options) => {
      return makeCompleteResponseFromOverrides(options.body.outcome);
    }),
  };
}

/** A retry policy with a recorded, instant sleep. */
export function makeInstantRetryPolicyFromAttempts(
  maxAttempts = 3,
): RetryPolicy & {
  sleep: ReturnType<typeof vi.fn>;
} {
  return {
    maxAttempts,
    baseDelayMs: 1000,
    maxDelayMs: 16_000,
    sleep: vi.fn(async () => {}),
  };
}

/** The waits a recorded retry policy was asked for, in milliseconds. */
export function getSleptMsFromRetryPolicy(
  retry: Readonly<{
    sleep: ReturnType<typeof vi.fn>;
  }>,
): number[] {
  return retry.sleep.mock.calls.map(([options]) => {
    return options.delayMs;
  });
}

/** Options for one 10-byte file, with whatever the test overrides. */
export function makeTransferOptionsFromOverrides(
  overrides: Partial<
    Omit<TransferUploadFileOptions, "derivatives"> & {
      derivatives: readonly MadeDerivative[];
    }
  > &
    Pick<
      Omit<TransferUploadFileOptions, "derivatives"> & {
        derivatives: readonly MadeDerivative[];
      },
      "api" | "transport"
    >,
): TransferUploadFileOptions {
  return {
    sessionId: SESSION_ID,
    fileId: FILE_ID,
    file: new Blob([new Uint8Array(10).fill(1)]),
    contentHash: HASH,
    size: { width: 1080, height: 1920 },
    durationMs: 12_000,
    signal: new AbortController().signal,
    onProgress: () => {},
    retry: makeInstantRetryPolicyFromAttempts(),
    now: () => {
      return T0;
    },
    ...overrides,
    derivatives: [...(overrides.derivatives ?? [])],
  };
}

/** The URLs a transport was asked to PUT to, in order. */
export function getUrlsFromTransport(
  transport: Readonly<{
    calls: Array<
      Omit<PutBytesOptions, "headers"> & {
        headers: Readonly<Record<string, string>>;
      }
    >;
  }>,
): string[] {
  return transport.calls.map((call) => {
    return call.url;
  });
}
