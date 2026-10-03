import {
  SESSION_ID,
  makeFileIdFromIndex,
  makeUploadEngineFilesFromPhotoCount,
  makeCompleteResponseFromOptions,
  makeUploadApiFromScenario,
  createLandingUploadTransport,
  makeWorkerAnswerFromRequest,
  makeWorkerFactoryFromAnswer,
  isEndingEvent,
  makeVideoFileFromFields,
  createUploadEventRecorder,
} from "./createUploadEngineTestHelpers";

import { describe, expect, it, vi } from "vitest";

import { createUploadEngine } from "@/upload/createUploadEngine/createUploadEngine";

import type { UploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

describe("createUploadEngine", () => {
  it("skips a duplicate presign cancelled, then reads the batch for settled", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    // File 1 lands without the latch, because two were declared; file 2's
    // cancel at presign is what settles the batch, and says nothing of it.
    const api = makeUploadApiFromScenario({
      fileCount: 2,
      duplicateFileIds: [makeFileIdFromIndex(2)],
    });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api,
      onEvent,
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 2 }));

    expect(events.slice(-2)).toEqual([
      {
        kind: "file-skipped",
        fileId: makeFileIdFromIndex(2),
        reason: "duplicate",
      },
      { kind: "settled", sessionState: "settled" },
    ]);
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
    expect(api.getUploadSession).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      limit: 1,
    });
  });

  it("emits no settled for a run that was cancelled", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api: makeUploadApiFromScenario({ fileCount: 1 }),
      onEvent,
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport: {
        putBytes: async (options) => {
          engine.cancel();
          options.signal.throwIfAborted();
          return { status: 200, etag: undefined };
        },
      },
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 1 }));

    expect(
      events.some((event) => {
        return event.kind === "settled";
      }),
    ).toBe(false);
  });

  it("reports no ending for a file whose answer came back after the run was cancelled", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    const api = makeUploadApiFromScenario({ fileCount: 1 });
    api.completeUploadFile.mockImplementation(async (options) => {
      // The answer was already on its way back when the caller cancelled.
      engine.cancel();
      return makeCompleteResponseFromOptions({
        fileId: options.fileId,
        state: "done",
        didSettle: true,
      });
    });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent,
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 1 }));

    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
    expect(
      events.filter((event) => {
        return isEndingEvent(event) || event.kind === "settled";
      }),
    ).toEqual([]);
  });

  it("sends nothing for a file whose poster was being made when the run was cancelled", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    const api = makeUploadApiFromScenario({ fileCount: 1 });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent,
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport: createLandingUploadTransport(),
      makeVideoDerivativesFromFile: async () => {
        // The poster is drawn on the main thread, which a cancel cannot reach.
        engine.cancel();
        return { derivatives: [], size: { width: 1080, height: 1920 } };
      },
    });

    await engine.start([
      { fileId: makeFileIdFromIndex(1), file: makeVideoFileFromFields() },
    ]);

    expect(api.presignUploadFile).not.toHaveBeenCalled();
    expect(api.completeUploadFile).not.toHaveBeenCalled();
    expect(events).toEqual([
      { kind: "file-started", fileId: makeFileIdFromIndex(1) },
    ]);
  });

  it("starts no worker for a file whose header was being read when the run was cancelled", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    const { workers, createMediaWorker } = makeWorkerFactoryFromAnswer();
    const api = makeUploadApiFromScenario({ fileCount: 1 });
    const [photo] = makeUploadEngineFilesFromPhotoCount({ count: 1 });
    if (photo === undefined) {
      throw new Error("The photo was not made");
    }
    // The header read begins by slicing the file, on the main thread.
    const slice = photo.file.slice.bind(photo.file);
    vi.spyOn(photo.file, "slice").mockImplementation((...sliceArguments) => {
      engine.cancel();
      return slice(...sliceArguments);
    });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent,
      createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start([photo]);

    // The one worker that hashed the file, and none after the cancel.
    expect(workers).toHaveLength(1);
    expect(workers[0]?.isTerminated).toBe(true);
    expect(api.presignUploadFile).not.toHaveBeenCalled();
    expect(events).toEqual([
      { kind: "file-started", fileId: makeFileIdFromIndex(1) },
    ]);
  });

  it("stops the other lane and ends every worker when a lane throws", async () => {
    const hungSignals: AbortSignal[] = [];
    let onSecondPut: () => void = () => {};
    const secondPutStarted = new Promise<void>((settle) => {
      onSecondPut = settle;
    });
    const transport: UploadTransport = {
      putBytes: (options) => {
        if (options.url.includes(makeFileIdFromIndex(1))) {
          return Promise.resolve({ status: 200, etag: undefined });
        }
        // File 2's PUT never answers, unless the run is aborted.
        hungSignals.push(options.signal);
        onSecondPut();
        return new Promise((_settle, fail) => {
          options.signal.addEventListener("abort", () => {
            fail(new DOMException("The upload was cancelled", "AbortError"));
          });
        });
      },
    };
    const { events, onEvent } = createUploadEventRecorder();
    const { workers, createMediaWorker } = makeWorkerFactoryFromAnswer();
    const api = makeUploadApiFromScenario({ fileCount: 2 });
    // File 1 ends only once file 2's PUT is under way, so that there is
    // something in flight for the failure to cut off.
    api.completeUploadFile.mockImplementation(async (options) => {
      await secondPutStarted;
      return makeCompleteResponseFromOptions({
        fileId: options.fileId,
        state: "done",
        didSettle: false,
      });
    });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 2,
      api,
      onEvent: (event) => {
        onEvent(event);
        if (event.kind === "file-done") {
          throw new Error("The caller's handler broke");
        }
      },
      createMediaWorker,
      transport,
    });

    await expect(
      engine.start(makeUploadEngineFilesFromPhotoCount({ count: 2 })),
    ).rejects.toThrow("The caller's handler broke");
    // Let the other lane wind down, if it is going to.
    await new Promise((settle) => {
      setTimeout(settle, 0);
    });

    expect(hungSignals[0]?.aborted).toBe(true);
    expect(
      workers.every((worker) => {
        return worker.isTerminated;
      }),
    ).toBe(true);
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
    // Only file 1 ended: file 2 was cut off, and a cut-off file reports
    // nothing.
    expect(events.filter(isEndingEvent)).toEqual([
      expect.objectContaining({
        kind: "file-done",
        fileId: makeFileIdFromIndex(1),
      }),
    ]);
  });

  it("replaces a worker at once when libheif was tried and a derivative was dropped", async () => {
    const { workers, createMediaWorker } = makeWorkerFactoryFromAnswer(
      (request) => {
        return request.kind === "hash"
          ? makeWorkerAnswerFromRequest(request)
          : {
              kind: "image-derivatives-made",
              requestId: request.requestId,
              derivatives: [],
              usedWasmDecoder: true,
              originalSize: undefined,
              dropDetail: "The HEIC decode timed out",
            };
      },
    );
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: makeUploadApiFromScenario({ fileCount: 3 }),
      onEvent: () => {},
      createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start(
      makeUploadEngineFilesFromPhotoCount({ count: 3, type: "image/heic" }),
    );

    expect(workers).toHaveLength(3);
    expect(
      workers.every((worker) => {
        return worker.isTerminated;
      }),
    ).toBe(true);
  });

  it("keeps a worker whose dropped derivative never involved libheif", async () => {
    const { workers, createMediaWorker } = makeWorkerFactoryFromAnswer(
      (request) => {
        return request.kind === "hash"
          ? makeWorkerAnswerFromRequest(request)
          : {
              kind: "image-derivatives-made",
              requestId: request.requestId,
              derivatives: [],
              usedWasmDecoder: false,
              originalSize: undefined,
              dropDetail: "The browser could not decode the image",
            };
      },
    );
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: makeUploadApiFromScenario({ fileCount: 3 }),
      onEvent: () => {},
      createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 3 }));

    expect(workers).toHaveLength(1);
  });
});
