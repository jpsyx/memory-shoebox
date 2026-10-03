import {
  presignUploadFile,
  completeUploadFile,
  getUploadSession,
} from "@/api/uploadsHelpers/uploadsHelpers";

import { appConfig } from "../../../../../app.config";

import { makeVideoDerivativesFromFile } from "@/upload/makeVideoDerivativesFromFile/makeVideoDerivativesFromFile";

import type { MediaWorkerPort } from "@/upload/mediaWorker/mediaWorkerProtocol.types";

import { createXhrUploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

import type {
  CreateUploadEngineOptions,
  UploadEngineFile,
  EngineContext,
} from "./createUploadEngine.types";

/** Every option resolved to its default, and the batch's own state. */
export function makeContextFromOptions(
  input: Readonly<{
    options: Readonly<CreateUploadEngineOptions>;
    controller: AbortController;
    files: readonly UploadEngineFile[];
  }>,
): EngineContext {
  const { options } = input;
  const {
    concurrency = appConfig.upload.maxParallelTransfers,
    api = {
      presignUploadFile,
      completeUploadFile,
      getUploadSession,
    },
    createMediaWorker = (): MediaWorkerPort => {
      return new Worker(
        new URL("../mediaWorker/mediaWorker.ts", import.meta.url),
        {
          type: "module",
        },
      );
    },
    transport = createXhrUploadTransport(),
    makeVideoDerivativesFromFile:
      videoDerivativeMaker = makeVideoDerivativesFromFile,
  } = options;
  return {
    sessionId: options.sessionId,
    concurrency: concurrency,
    api: api,
    onEvent: options.onEvent,
    createMediaWorker: createMediaWorker,
    transport: transport,
    makeVideoDerivativesFromFile: videoDerivativeMaker,
    retry: options.retry,
    controller: input.controller,
    queue: [...input.files],
    answers: { latched: undefined, latest: undefined },
    hasSkippedFile: false,
    isBatchClosed: false,
  };
}
