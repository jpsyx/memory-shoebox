import {
  completeUploadFile,
  getUploadSession,
  presignUploadFile,
} from "@/api/uploadsHelpers/uploadsHelpers";
import { createUploadDecodeCoordinator } from "@/upload/createUploadDecodeCoordinator/createUploadDecodeCoordinator";

import { APP_CONFIG } from "../../../../../app.config";

import { makeVideoDerivativesFromFile } from "@/upload/makeVideoDerivativesFromFile/makeVideoDerivativesFromFile";

import type { MediaWorkerPort } from "@/upload/mediaWorker/mediaWorkerProtocol.types";

import { createXhrUploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

import type {
  CreateUploadEngineOptions,
  EngineContext,
  UploadEngineFile,
} from "./createUploadEngine.types";

/** Every option resolved to its default, and the batch's own state. */
export function makeContextFromOptions(
  options: Readonly<{
    options: Readonly<CreateUploadEngineOptions>;
    controller: AbortController;
    files: readonly UploadEngineFile[];
  }>,
): EngineContext {
  const { options: engineOptions } = options;
  const {
    decodeCoordinator = createUploadDecodeCoordinator(),
    concurrency = APP_CONFIG.upload.maxParallelTransfers,
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
    makeVideoDerivativesFromFile: videoDerivativeMaker = (file) => {
      return makeVideoDerivativesFromFile({ file });
    },
  } = engineOptions;
  return {
    sessionId: engineOptions.sessionId,
    decodeCoordinator,
    concurrency: concurrency,
    api: api,
    onEvent: engineOptions.onEvent,
    createMediaWorker: createMediaWorker,
    transport: transport,
    makeVideoDerivativesFromFile: videoDerivativeMaker,
    retry: engineOptions.retry,
    controller: options.controller,
    queue: [...options.files],
    answers: { latched: undefined, latest: undefined },
    hasSkippedFile: false,
    isBatchClosed: false,
  };
}
