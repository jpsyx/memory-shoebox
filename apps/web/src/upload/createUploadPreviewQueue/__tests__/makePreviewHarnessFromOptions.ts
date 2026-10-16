import { vi } from "vitest";
import type {
  MediaWorkerPort,
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "../../mediaWorker/mediaWorkerProtocol.types.ts";
import { createUploadPreviewQueue } from "../createUploadPreviewQueue";
import type { CreateUploadPreviewQueueOptions } from "../createUploadPreviewQueue.types.ts";
type PreviewAnswerOptions = {
  index: number;
  empty?: boolean;
  wasm?: boolean;
  thumbBytes?: number;
};

type PreviewRequest = { request: MediaWorkerRequest; worker: MediaWorkerPort };
type PreviewHarness = {
  queue: import("../createUploadPreviewQueue.types.ts").UploadPreviewQueue;
  request: (fileId: string) => void;
  answer: (options: Readonly<PreviewAnswerOptions>) => void;
  requests: PreviewRequest[];
  workers: MediaWorkerPort[];
  createObjectUrl: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
  revokeObjectUrl: ReturnType<typeof vi.fn<(url: string) => void>>;
};
function _getPreviewResponseFromRequest({
  request,
  empty,
  wasm,
  thumbBytes,
}: Readonly<
  Pick<Required<PreviewAnswerOptions>, "empty" | "wasm" | "thumbBytes"> & {
    request: MediaWorkerRequest;
  }
>): MediaWorkerResponse {
  return {
    kind: "image-derivatives-made",
    requestId: request.requestId,
    usedWasmDecoder: wasm,
    originalSize: { width: 1200, height: 800 },
    derivatives: empty
      ? []
      : [
          {
            purpose: "display",
            blob: new Blob(["display"]),
            width: 1200,
            height: 800,
          },
          {
            purpose: "thumb",
            blob: new Blob([new Uint8Array(thumbBytes)]),
            width: 300,
            height: 200,
          },
        ],
  };
}
function _makeRecordingWorker({
  requests,
  workers,
}: Readonly<{
  requests: PreviewRequest[];
  workers: MediaWorkerPort[];
}>): MediaWorkerPort {
  const worker: MediaWorkerPort = {
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    postMessage: (request) => {
      requests.push({ request, worker });
    },
  };
  workers.push(worker);
  return worker;
}

function _answerPreviewRequest({
  requests,
  options: { index, empty = false, wasm = false, thumbBytes = 5 },
}: Readonly<{
  requests: readonly PreviewRequest[];
  options: PreviewAnswerOptions;
}>): void {
  const pending = requests[index]!;
  const response = _getPreviewResponseFromRequest({
    request: pending.request,
    empty,
    wasm,
    thumbBytes,
  });
  pending.worker.onmessage?.(new MessageEvent("message", { data: response }));
}

/** Makes a recording-worker preview queue with controllable cache limits. */
export function makePreviewHarnessFromOptions(
  options: Readonly<
    Pick<
      CreateUploadPreviewQueueOptions,
      "maxCachedEntries" | "maxCachedBytes" | "decodeCoordinator"
    >
  > = {},
): PreviewHarness {
  const requests: PreviewRequest[] = [];
  const workers: MediaWorkerPort[] = [];
  const createObjectUrl = vi.fn<(blob: Blob) => string>((): string => {
    return `blob:preview-${createObjectUrl.mock.calls.length}`;
  });
  const revokeObjectUrl = vi.fn<(url: string) => void>();
  const queue = createUploadPreviewQueue({
    ...options,
    createObjectUrl,
    revokeObjectUrl,
    createMediaWorker: () => {
      return _makeRecordingWorker({ requests, workers });
    },
  });
  const request = (fileId: string) => {
    return queue.requestPreview({
      fileId,
      file: new File(["photo"], `${fileId}.jpg`),
      contentType: "image/jpeg",
      size: { width: 1200, height: 800 },
    });
  };
  const answer: PreviewHarness["answer"] = (answerOptions) => {
    return _answerPreviewRequest({ requests, options: answerOptions });
  };
  return {
    queue,
    request,
    answer,
    requests,
    workers,
    createObjectUrl,
    revokeObjectUrl,
  };
}
