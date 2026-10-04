import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "../../../../../app.config";
import type {
  MediaWorkerPort,
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "../mediaWorker/mediaWorkerProtocol.types";
import { createUploadPreviewQueue } from "./createUploadPreviewQueue";

type PreviewRequest = { request: MediaWorkerRequest; worker: MediaWorkerPort };
type PreviewHarness = {
  queue: import("./createUploadPreviewQueue.types").UploadPreviewQueue;
  request: (fileId: string) => void;
  answer: (
    options: Readonly<{ index: number; empty?: boolean; wasm?: boolean }>,
  ) => void;
  requests: PreviewRequest[];
  workers: MediaWorkerPort[];
  createObjectUrl: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
  revokeObjectUrl: ReturnType<typeof vi.fn<(url: string) => void>>;
};
function _getPreviewResponseFromRequest({
  request,
  empty,
  wasm,
}: Readonly<{
  request: MediaWorkerRequest;
  empty: boolean;
  wasm: boolean;
}>): MediaWorkerResponse {
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
            blob: new Blob(["thumb"]),
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
function _makeHarness(): PreviewHarness {
  const requests: PreviewRequest[] = [];
  const workers: MediaWorkerPort[] = [];
  const createObjectUrl = vi.fn<(blob: Blob) => string>((): string => {
    return `blob:preview-${createObjectUrl.mock.calls.length}`;
  });
  const revokeObjectUrl = vi.fn<(url: string) => void>();
  const queue = createUploadPreviewQueue({
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
  const answer = ({
    index,
    empty = false,
    wasm = false,
  }: Readonly<{ index: number; empty?: boolean; wasm?: boolean }>) => {
    const pending = requests[index]!;
    const response = _getPreviewResponseFromRequest({
      request: pending.request,
      empty,
      wasm,
    });
    pending.worker.onmessage?.(new MessageEvent("message", { data: response }));
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

afterEach(() => {
  return vi.restoreAllMocks();
});
describe("upload preview ownership", () => {
  it("only one preview decode is active and creates only a thumbnail URL", async () => {
    const harness = _makeHarness();
    expect(harness.workers).toHaveLength(0);
    harness.request("first");
    harness.request("second");
    expect(harness.requests).toHaveLength(1);
    harness.answer({ index: 0 });
    await waitFor(() => {
      return expect(harness.requests).toHaveLength(2);
    });
    expect(harness.createObjectUrl).toHaveBeenCalledTimes(1);
    expect(harness.queue.getPreview("first")).toMatchObject({
      kind: "ready",
      width: 300,
      height: 200,
    });
    harness.answer({ index: 1 });
    harness.queue.destroy();
  });
  it("a resolved empty derivative list is unavailable and snapshots stay stable", async () => {
    const harness = _makeHarness();
    harness.request("empty");
    const preparing = harness.queue.getPreview("empty");
    expect(harness.queue.getPreview("empty")).toBe(preparing);
    harness.answer({ index: 0, empty: true });
    await waitFor(() => {
      return expect(harness.queue.getPreview("empty")?.kind).toBe(
        "unavailable",
      );
    });
    harness.queue.destroy();
  });
  it("release revokes its URL and an in-flight release cannot leak a late URL", async () => {
    const harness = _makeHarness();
    harness.request("ready");
    harness.answer({ index: 0 });
    await waitFor(() => {
      return expect(harness.queue.getPreview("ready")?.kind).toBe("ready");
    });
    harness.queue.release("ready");
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith("blob:preview-1");
    harness.request("late");
    harness.queue.release("late");
    harness.answer({ index: 1 });
    await waitFor(() => {
      return expect(harness.queue.getPreview("late")).toBeUndefined();
    });
    expect(harness.createObjectUrl).toHaveBeenCalledTimes(1);
    harness.queue.destroy();
  });
  it("HEIC recycling follows config", async () => {
    const harness = _makeHarness();
    await Array.from({
      length: appConfig.upload.heicWorkerRecycleCount,
    }).reduce(async (previous, _, index) => {
      await previous;
      harness.request(`${index}`);
      harness.answer({ index: index, empty: false, wasm: true });
      await waitFor(() => {
        return expect(harness.queue.getPreview(`${index}`)?.kind).toBe("ready");
      });
    }, Promise.resolve());
    expect(harness.workers[0]?.terminate).toHaveBeenCalledOnce();
    harness.request("after");
    expect(harness.workers).toHaveLength(2);
    harness.queue.destroy();
  });
  it("transfer pauses queued work until resumed", async () => {
    const harness = _makeHarness();
    harness.queue.setPaused(true);
    harness.request("paused");
    expect(harness.requests).toHaveLength(0);
    harness.queue.setPaused(false);
    expect(harness.requests).toHaveLength(1);
    harness.queue.destroy();
  });
  it("decode errors become unavailable and replace the broken worker", async () => {
    const harness = _makeHarness();
    harness.request("broken");
    harness.workers[0]?.onerror?.(
      new ErrorEvent("error", { message: "codec failed" }),
    );
    await waitFor(() => {
      return expect(harness.queue.getPreview("broken")?.kind).toBe(
        "unavailable",
      );
    });
    harness.request("after");
    expect(harness.workers).toHaveLength(2);
    harness.queue.destroy();
  });
  it("a released request cannot replace a newer request for the same file", async () => {
    const harness = _makeHarness();
    harness.request("same");
    harness.queue.release("same");
    harness.request("same");
    harness.answer({ index: 0 });
    await waitFor(() => {
      return expect(harness.requests).toHaveLength(2);
    });
    expect(harness.queue.getPreview("same")?.kind).toBe("preparing");
    harness.answer({ index: 1 });
    await waitFor(() => {
      return expect(harness.queue.getPreview("same")?.kind).toBe("ready");
    });
    expect(harness.createObjectUrl).toHaveBeenCalledTimes(1);
    harness.queue.destroy();
    expect(harness.revokeObjectUrl).toHaveBeenCalledOnce();
  });
  it("re-entering the viewport with the same input discards the cancelled answer", async () => {
    const harness = _makeHarness();
    const input = {
      fileId: "same-input",
      file: new File(["photo"], "photo.jpg"),
      contentType: "image/jpeg",
    };
    harness.queue.requestPreview(input);
    harness.queue.release(input.fileId);
    harness.queue.requestPreview(input);
    harness.answer({ index: 0 });
    await waitFor(() => {
      expect(harness.requests).toHaveLength(2);
    });
    expect(harness.createObjectUrl).not.toHaveBeenCalled();
    expect(harness.queue.getPreview(input.fileId)?.kind).toBe("preparing");
    harness.queue.destroy();
  });
  it("pausing during a decode holds the next preview and repeated requests do not publish", async () => {
    const harness = _makeHarness();
    const onChange = vi.fn();
    const unsubscribe = harness.queue.subscribe(onChange);
    harness.request("active");
    harness.request("waiting");
    harness.request("waiting");
    expect(onChange).toHaveBeenCalledTimes(2);
    harness.queue.setPaused(true);
    harness.answer({ index: 0 });
    await waitFor(() => {
      return expect(harness.queue.getPreview("active")?.kind).toBe("ready");
    });
    expect(harness.requests).toHaveLength(1);
    harness.queue.setPaused(false);
    expect(harness.requests).toHaveLength(2);
    unsubscribe();
    harness.queue.destroy();
    expect(onChange).toHaveBeenCalledTimes(3);
  });
  it("destroy returns immediately during a video decode and discards its late result", async () => {
    const deferred =
      Promise.withResolvers<
        import("../makeVideoDerivativesFromFile/makeVideoDerivativesFromFile.types").VideoDerivativesResult
      >();
    const createObjectUrl = vi.fn();
    const queue = createUploadPreviewQueue({
      makeVideoDerivativesFromFile: () => {
        return deferred.promise;
      },
      createObjectUrl,
    });
    queue.requestPreview({
      fileId: "video",
      file: new File(["video"], "video.mov"),
      contentType: "video/quicktime",
    });
    queue.destroy();
    deferred.resolve({
      derivatives: [
        {
          purpose: "thumb",
          width: 200,
          height: 300,
          blob: new Blob(["thumb"]),
        },
      ],
      size: { width: 200, height: 300 },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(queue.getPreview("video")).toBeUndefined();
  });
});
