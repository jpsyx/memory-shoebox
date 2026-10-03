import type {
  CompleteUploadFileResponse,
  ManifestEntry,
  PutUploadManifestResponse,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import { vi } from "vitest";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import type {
  CreateUploadEngineOptions,
  UploadEngineEvent,
} from "@/upload/createUploadEngine/createUploadEngine.types";
import { createUploadSessionController } from "../uploadSessionController";
import {
  makeUploadFileFromPosition,
  makeUploadRecoveryStorage,
} from "./uploadSurfaceFixtures";

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
): ReturnType<typeof _makeHarnessFromDetail> {
  return _makeHarnessFromDetail(structuredClone(detail));
}

function _makeHarnessFromDetail(detail: UploadSessionDetail) {
  const pickedFiles = Array.from({ length: 1001 }, (_, position) => {
    return new File([`photo-${position}`], `IMG_${position}.jpg`, {
      type: "image/jpeg",
    });
  });
  const completion = makeDeferredAnswer<CompleteUploadFileResponse>();
  const run = makeDeferredAnswer<void>();
  let engineOptions: CreateUploadEngineOptions | undefined;
  const engine = {
    start: vi.fn(() => {
      return run.promise;
    }),
    cancel: vi.fn(),
  };
  const api = _makeApi(detail, completion.promise);
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
    emitEvent: (event: UploadEngineEvent) => {
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

function _makeApi(
  detail: UploadSessionDetail,
  completion: Promise<CompleteUploadFileResponse>,
) {
  return {
    getCurrentUploadSession: vi.fn(
      async (): Promise<UploadSessionDetail | null> => {
        return null;
      },
    ),
    openUploadSession: vi.fn(async () => {
      return structuredClone(detail);
    }),
    getUploadSession: vi.fn(async () => {
      return structuredClone(detail);
    }),
    putUploadManifest: vi.fn(
      async (
        options: Readonly<{
          sessionId: string;
          files: readonly ManifestEntry[];
        }>,
      ) => {
        return _declareFiles({ detail, files: options.files });
      },
    ),
    cancelUploadSession: vi.fn(async (_sessionId: string) => {}),
    commitUploadSession: vi.fn(
      async (
        options: Readonly<{ sessionId: string; intent: "arm" | "close" }>,
      ) => {
        detail.state = options.intent === "arm" ? "uploading" : "settled";
        return structuredClone(detail);
      },
    ),
    presignUploadFile: vi.fn(),
    completeUploadFile: vi.fn(() => {
      return completion;
    }),
    retryUploadFile: vi.fn(),
    setUploadVisibility: vi.fn(),
    createUploadEdit: vi.fn(),
    undoUploadEdit: vi.fn(),
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
