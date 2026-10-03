import type { CompleteUploadFileResponse } from "@memory-shoebox/shared";
import { vi } from "vitest";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import { makeAtomBytesFromTypeAndBody } from "@/testing/mediaBytesHelpers/mediaAtomBytesHelpers";
import {
  makeJpegBytesFromExif,
  makeMvhdAtomBytesFromFields,
} from "@/testing/mediaBytesHelpers/mediaBytesHelpers";

import {
  type UploadApi,
  type UploadEngineEvent,
  type UploadEngineFile,
} from "@/upload/createUploadEngine/createUploadEngine.types";
import type {
  MediaWorkerPort,
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "@/upload/mediaWorker/mediaWorkerProtocol.types";
import type { UploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

/**
 * Stable upload-session id used by the fixtures.
 */
export const SESSION_ID = "018f0000-0000-7000-8000-00000000c001";

/**
 * Deterministic SHA-256 checksum used by the fixtures.
 */
export const HASH = "d".repeat(64);

/**
 * Future expiry timestamp used by the presigned URL fixtures.
 */
export const IN_AN_HOUR = new Date(Date.now() + 3_600_000).toISOString();

/** Never sleeps, so a retry costs a test nothing. */
export const INSTANT_RETRY = {
  maxAttempts: 2,
  baseDelayMs: 1,
  maxDelayMs: 1,
  sleep: async (): Promise<void> => {},
};

/** A file id for the nth test file. */
export function makeFileIdFromIndex(index: number): string {
  return `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`;
}

/** n photographs whose headers say 4032 x 3024. */
export function makeUploadEngineFilesFromPhotoCount(
  functionOptions: Readonly<{ count: number; type?: string }>,
): UploadEngineFile[] {
  const { count, type = "image/jpeg" } = functionOptions;

  const bytes = makeJpegBytesFromExif({ pixelWidth: 4032, pixelHeight: 3024 });
  return Array.from({ length: count }, (_unused, index) => {
    return {
      fileId: makeFileIdFromIndex(index + 1),
      file: new File([bytes], `IMG_${index + 1}.JPG`, { type }),
    };
  });
}

/** What `complete` answers for one file. */
export function makeCompleteResponseFromOptions(
  options: Readonly<{
    fileId: string;
    state: "done" | "failed";
    didSettle: boolean;
  }>,
): CompleteUploadFileResponse {
  return {
    file: {
      fileId: options.fileId,
      position: 0,
      originalFilename: "x",
      declaredContentType: "image/jpeg",
      declaredBytes: 1,
      contentHash: HASH,
      state: options.state,
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
      doneCount: 0,
      failedCount: 0,
      refusedCount: 0,
      cancelledCount: 0,
      doneBytes: 0,
    },
    sessionState: options.didSettle ? "settled" : "uploading",
    didSettle: options.didSettle,
  };
}

/**
 * An API that presigns a single PUT for anything and settles on the last of
 * `fileCount` completions. A file in `duplicateFileIds` is cancelled, naming
 * file 1 as the holder.
 */
export function makeUploadApiFromScenario(
  functionOptions: Readonly<{
    fileCount: number;
    duplicateFileIds?: readonly string[];
  }>,
): UploadApi & {
  presignUploadFile: ReturnType<typeof vi.fn>;
  completeUploadFile: ReturnType<typeof vi.fn>;
  getUploadSession: ReturnType<typeof vi.fn>;
} {
  const { fileCount, duplicateFileIds = [] } = functionOptions;

  let completed = 0;
  return {
    presignUploadFile: vi.fn(async (options) => {
      if (duplicateFileIds.includes(options.fileId)) {
        throw new ApiRequestError({
          status: 409,
          code: "upload_file_conflict",
          message: "These bytes are already in this batch.",
          details: { fileId: makeFileIdFromIndex(1), state: "cancelled" },
        });
      }
      return {
        mode: "single" as const,
        fileId: options.fileId,
        method: "PUT" as const,
        url: `https://b2/${options.fileId}/${options.body.purpose ?? "original"}`,
        headers: { "Content-Type": "image/jpeg" },
        expiresAt: IN_AN_HOUR,
      };
    }),
    completeUploadFile: vi.fn(async (options) => {
      completed += 1;
      return makeCompleteResponseFromOptions({
        fileId: options.fileId,
        state: options.body.outcome,
        didSettle: completed === fileCount,
      });
    }),
    getUploadSession: vi.fn(async () => {
      return makeUploadSessionDetail({
        sessionId: SESSION_ID,
        state: "settled",
      });
    }),
  };
}

/** A transport whose every PUT lands, reporting its size as progress. */
export function createLandingUploadTransport(): UploadTransport {
  return {
    putBytes: async (options) => {
      options.onProgress(options.body.size);
      return { status: 200, etag: undefined };
    },
  };
}

/** One fake worker: what it was asked, and whether it was ended. */
export type FakeWorker = {
  requests: MediaWorkerRequest[];
  isTerminated: boolean;
};

/** The default answer: the fixed hash, and no derivatives. */
export function makeWorkerAnswerFromRequest(
  request: Readonly<MediaWorkerRequest>,
): MediaWorkerResponse {
  return request.kind === "hash"
    ? { kind: "hashed", requestId: request.requestId, contentHash: HASH }
    : {
        kind: "image-derivatives-made",
        requestId: request.requestId,
        derivatives: [],
        usedWasmDecoder: false,
        originalSize: request.size,
      };
}

/** A worker factory whose workers answer with `answer`, a tick later. */
export function makeWorkerFactoryFromAnswer(
  answer: (
    request: MediaWorkerRequest,
  ) =>
    | MediaWorkerResponse
    | Promise<MediaWorkerResponse> = makeWorkerAnswerFromRequest,
): { workers: FakeWorker[]; createMediaWorker: () => MediaWorkerPort } {
  const workers: FakeWorker[] = [];
  const createMediaWorker = (): MediaWorkerPort => {
    const worker: FakeWorker = { requests: [], isTerminated: false };
    workers.push(worker);
    const port: MediaWorkerPort = {
      onmessage: null,
      onerror: null,
      postMessage: (request) => {
        worker.requests.push(request);
        void Promise.resolve(answer(request)).then((data) => {
          port.onmessage?.(
            new MessageEvent<MediaWorkerResponse>("message", { data }),
          );
        });
      },
      terminate: () => {
        worker.isTerminated = true;
      },
    };
    return port;
  };
  return { workers, createMediaWorker };
}

/** Whether `event` is the one ending a file: done, failed or skipped. */
export function isEndingEvent(event: UploadEngineEvent): boolean {
  return (
    event.kind === "file-done" ||
    event.kind === "file-failed" ||
    event.kind === "file-skipped"
  );
}

/** A QuickTime movie whose header is readable, so only its poster is faked. */
export function makeVideoFileFromFields(): File {
  const mvhd = makeMvhdAtomBytesFromFields({
    version: 0,
    createdAt: new Date("2026-09-14T06:41:32.000Z"),
    timescale: 600,
    duration: 600 * 12,
  });
  return new File(
    [
      new Uint8Array(
        makeAtomBytesFromTypeAndBody({ type: "moov", body: mvhd }),
      ),
    ],
    "IMG_0002.MOV",
    {
      type: "video/quicktime",
    },
  );
}

/** Collects every event an engine emits. */
export function createUploadEventRecorder(): {
  events: UploadEngineEvent[];
  onEvent: (event: UploadEngineEvent) => void;
} {
  const events: UploadEngineEvent[] = [];
  return {
    events,
    onEvent: (event) => {
      events.push(event);
    },
  };
}
