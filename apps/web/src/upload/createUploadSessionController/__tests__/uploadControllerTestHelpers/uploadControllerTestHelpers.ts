import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import type {
  CreateUploadEngineOptions,
  UploadEngine,
} from "@/upload/createUploadEngine/createUploadEngine.types";
import type {
  MediaWorkerPort,
  MediaWorkerRequest,
} from "@/upload/mediaWorker/mediaWorkerProtocol.types";
import type {
  CompleteUploadFileResponse,
  ManifestEntry,
  PutUploadManifestResponse,
  UploadFileDto,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import type { Mocked } from "vitest";
import { vi } from "vitest";
import { createUploadSessionController } from "../../createUploadSessionController";
import type { UploadSessionApi } from "../../createUploadSessionController.types";
import {
  makeUploadFileFromPosition,
  makeUploadRecoveryStorage,
  makeUploadSurfaceDetail,
} from "../uploadSurfaceFixtureHelpers";
import type {
  UploadControllerHarness,
  UploadRecoveryControllerHarness,
} from "./uploadControllerTestHelpers.types";

/** An externally controlled dependency answer for lifecycle/race tests. */
export function makeDeferredAnswer<T>(): {
  promise: Promise<T>;
  answer: (value: T) => void;
  reject: (error: Error) => void;
} {
  const deferred = Promise.withResolvers<T>();
  return {
    promise: deferred.promise,
    answer: deferred.resolve,
    reject: deferred.reject,
  };
}

/** Applies one manifest call to the fake server's catalog. */
function _declareFiles(
  options: Readonly<{
    detail: UploadSessionDetail;
    files: readonly ManifestEntry[];
  }>,
): PutUploadManifestResponse {
  const outcomes = options.files.map((entry) => {
    const row = {
      ...makeUploadFileFromPosition(options.detail.files.length),
      originalFilename: entry.originalFilename,
      declaredBytes: entry.declaredBytes,
    };
    options.detail.files.push(row);
    return {
      clientRef: entry.clientRef,
      fileId: row.fileId,
      disposition: "created" as const,
      state: row.state,
      capturedOn: row.capturedOn,
      captureSource: row.captureSource,
      problemCode: row.problemCode,
    };
  });
  options.detail.fileCount = options.detail.files.length;
  options.detail.totalBytes = options.detail.files.reduce((total, file) => {
    return total + file.declaredBytes;
  }, 0);
  options.detail.progress.waitingCount = options.detail.files.length;
  return {
    sessionId: options.detail.sessionId,
    fileCount: options.detail.fileCount,
    totalBytes: options.detail.files.reduce((total, file) => {
      return total + file.declaredBytes;
    }, 0),
    outcomes,
  };
}

/** Real controller with a catalog API double and deferred engine boundary. */
export function makeUploadControllerHarness(
  detail: Readonly<UploadSessionDetail> = makeUploadSessionDetail(),
): UploadControllerHarness {
  return _makeHarnessFromDetail(structuredClone(detail));
}

function _makePickedFilesFromFileCount(fileCount: number): File[] {
  return Array.from({ length: fileCount }, (_, position) => {
    return new File([`photo-${position}`], `IMG_${position}.jpg`, {
      type: "image/jpeg",
    });
  });
}
function _makeHarnessFromDetail(
  detail: Readonly<UploadSessionDetail>,
): UploadControllerHarness {
  const pickedFiles = _makePickedFilesFromFileCount(1001);
  const completion = makeDeferredAnswer<CompleteUploadFileResponse>();
  const run = makeDeferredAnswer<void>();
  let engineOptions: CreateUploadEngineOptions | undefined;
  const engine = {
    start: vi.fn<UploadEngine["start"]>(() => {
      return run.promise;
    }),
    cancel: vi.fn<UploadEngine["cancel"]>(),
  };
  const api = _makeApi({ detail: detail, completion: completion.promise });
  const headerReader = vi.fn(_getTestManifestEntryFromFile);
  const storage = makeUploadRecoveryStorage();
  const controller = createUploadSessionController({
    memberId: detail.uploadedBy.memberId,
    api,
    storage,
    getManifestEntryFromFile: headerReader,
    createUploadEngine: (options) => {
      engineOptions = options;
      return engine;
    },
  });
  return {
    controller,
    api,
    engine,
    pickedFiles,
    headerReader,
    storage,
    emitEvent: (event) => {
      engineOptions?.onEvent(event);
    },
    serverDetail: detail,
    getEngineOptions: () => {
      return engineOptions;
    },
    answerCompletion: completion.answer,
    answerRun: run.answer,
  };
}

function _makeApi({
  detail,
  completion,
}: Readonly<{
  detail: UploadSessionDetail;
  completion: Promise<CompleteUploadFileResponse>;
}>): Mocked<UploadSessionApi> {
  return {
    getCurrentUploadSession: vi.fn<UploadSessionApi["getCurrentUploadSession"]>(
      async () => {
        return null;
      },
    ),
    removeUploadFiles: vi.fn<UploadSessionApi["removeUploadFiles"]>(
      async ({ fileIds }) => {
        detail.files = detail.files.filter((file) => {
          return !fileIds.includes(file.fileId);
        });
        detail.fileCount = detail.files.length;
        detail.totalBytes = detail.files.reduce((total, file) => {
          return total + (file.state === "refused" ? 0 : file.declaredBytes);
        }, 0);
        detail.days = detail.days.flatMap((day) => {
          const fileCount = detail.files.filter((file) => {
            return file.capturedOn === day.capturedOn;
          }).length;
          return fileCount > 0 ? [{ ...day, fileCount }] : [];
        });
      },
    ),
    openUploadSession: vi.fn<UploadSessionApi["openUploadSession"]>(
      async () => {
        return structuredClone(detail);
      },
    ),
    getUploadSession: vi.fn<UploadSessionApi["getUploadSession"]>(async () => {
      return structuredClone(detail);
    }),
    putUploadManifest: vi.fn<UploadSessionApi["putUploadManifest"]>(
      async (options) => {
        return _declareFiles({ detail, files: options.files });
      },
    ),
    cancelUploadSession: vi.fn<UploadSessionApi["cancelUploadSession"]>(
      async () => {},
    ),
    commitUploadSession: vi.fn<UploadSessionApi["commitUploadSession"]>(
      async (options) => {
        detail.state = options.intent === "arm" ? "uploading" : "settled";
        return structuredClone(detail);
      },
    ),
    presignUploadFile: vi.fn<UploadSessionApi["presignUploadFile"]>(),
    completeUploadFile: vi.fn<UploadSessionApi["completeUploadFile"]>(() => {
      return completion;
    }),
    retryUploadFile: vi.fn<UploadSessionApi["retryUploadFile"]>(),
    setUploadVisibility: vi.fn<UploadSessionApi["setUploadVisibility"]>(),
    createUploadEdit: vi.fn<UploadSessionApi["createUploadEdit"]>(),
    undoUploadEdit: vi.fn<UploadSessionApi["undoUploadEdit"]>(),
  };
}

async function _getTestManifestEntryFromFile(
  options: Readonly<{ file: File; clientRef: string }>,
): Promise<ManifestEntry> {
  return {
    clientRef: options.clientRef,
    originalFilename: options.file.name,
    declaredContentType: options.file.type,
    declaredBytes: options.file.size,
  };
}

/**
 * Real controller with worker hashing and addressed recovery catalog doubles.
 */
export function makeUploadRecoveryControllerHarness({
  rows,
  state = "uploading",
}: Readonly<{
  rows: readonly UploadFileDto[];
  state?: UploadSessionDetail["state"];
}>): UploadRecoveryControllerHarness {
  return _makeRecoveryHarness(
    makeUploadSurfaceDetail({
      files: [...rows],
      fileCount: rows.length,
      state,
    }),
  );
}

function _makeRecoveryHarness(
  inputDetail: Readonly<UploadSessionDetail>,
): UploadRecoveryControllerHarness {
  const harness = makeUploadControllerHarness(inputDetail);
  const detail = harness.serverDetail;
  const run = makeDeferredAnswer<void>();
  const engine = {
    start: vi.fn<UploadEngine["start"]>((_files) => {
      return run.promise;
    }),
    cancel: vi.fn<UploadEngine["cancel"]>(),
  };
  let engineOptions: CreateUploadEngineOptions | undefined;
  const worker = _makeRecoveryWorker();
  _setRecoveryCatalogApi(harness);
  const controller = createUploadSessionController({
    memberId: detail.uploadedBy.memberId,
    api: harness.api,
    storage: harness.storage,
    createMediaWorker: () => {
      return worker;
    },
    createUploadEngine: (options) => {
      engineOptions = options;
      return engine;
    },
    getManifestEntryFromFile: harness.headerReader,
  });
  const files = detail.files.map((row) => {
    return new File([new Uint8Array(row.declaredBytes)], row.originalFilename, {
      type: row.declaredContentType,
    });
  });
  return {
    ...harness,
    controller,
    engine,
    files,
    worker,
    answerRun: run.answer,
    getEngineOptions: () => {
      return engineOptions;
    },
  };
}

function _makeRecoveryWorker(): MediaWorkerPort {
  const worker: MediaWorkerPort = {
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    postMessage: vi.fn((request: MediaWorkerRequest) => {
      if (request.kind === "hash") {
        const hash = (request.file as File).name.startsWith("extra")
          ? "f".repeat(64)
          : Number((request.file as File).name.match(/\d+/)?.[0] ?? 0)
              .toString(16)
              .padStart(64, "0");
        queueMicrotask(() => {
          return worker.onmessage?.(
            new MessageEvent("message", {
              data: {
                kind: "hashed",
                requestId: request.requestId,
                contentHash: hash,
              },
            }),
          );
        });
      }
    }),
  };
  return worker;
}

function _setRecoveryCatalogApi(
  harness: Readonly<ReturnType<typeof makeUploadControllerHarness>>,
): void {
  const detail = harness.serverDetail;
  const declare = harness.api.putUploadManifest.getMockImplementation()!;
  harness.api.putUploadManifest.mockImplementation(async (options) => {
    if (
      options.files.every((entry) => {
        return !entry.fileId;
      })
    ) {
      return declare(options);
    }
    const outcomes = options.files.map((entry) => {
      const row = detail.files.find((file) => {
        return file.fileId === entry.fileId;
      })!;
      row.contentHash = entry.contentHash ?? null;
      return {
        clientRef: entry.clientRef,
        fileId: row.fileId,
        disposition: "matched" as const,
        state: row.state,
        capturedOn: row.capturedOn,
        captureSource: row.captureSource,
        problemCode: row.problemCode,
      };
    });
    return {
      sessionId: detail.sessionId,
      fileCount: detail.fileCount,
      totalBytes: detail.totalBytes,
      outcomes,
    };
  });
  harness.api.retryUploadFile.mockImplementation(async ({ fileId }) => {
    const row = detail.files.find((file) => {
      return file.fileId === fileId;
    })!;
    row.state = "waiting";
    return {
      file: structuredClone(row),
      isIncludedInEmail: detail.state !== "settled",
    };
  });
}
