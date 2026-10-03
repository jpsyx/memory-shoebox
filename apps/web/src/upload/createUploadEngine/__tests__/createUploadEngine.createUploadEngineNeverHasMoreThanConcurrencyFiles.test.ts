import {
  SESSION_ID,
  INSTANT_RETRY,
  makeFileIdFromIndex,
  makeUploadEngineFilesFromPhotoCount,
  makeUploadApiFromScenario,
  createLandingUploadTransport,
  makeWorkerAnswerFromRequest,
  makeWorkerFactoryFromAnswer,
  isEndingEvent,
  createUploadEventRecorder,
} from "./createUploadEngineTestHelpers";

import { describe, expect, it } from "vitest";

import { makeAtomBytesFromTypeAndBody } from "@/testing/mediaBytesHelpers/mediaAtomBytesHelpers";
import { makeMvhdAtomBytesFromFields } from "@/testing/mediaBytesHelpers/mediaBytesHelpers";
import { createUploadEngine } from "@/upload/createUploadEngine/createUploadEngine";

import type { UploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

describe("createUploadEngine", () => {
  it("never has more than `concurrency` files in flight", async () => {
    let inFlight = 0;
    let mostInFlight = 0;
    // A slow worker, so that the lanes overlap for as long as they can.
    const { createMediaWorker } = makeWorkerFactoryFromAnswer(
      async (request) => {
        await new Promise((settle) => {
          setTimeout(settle, 5);
        });
        return makeWorkerAnswerFromRequest(request);
      },
    );
    const api = makeUploadApiFromScenario({ fileCount: 5 });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 2,
      api,
      onEvent: (event) => {
        if (event.kind === "file-started") {
          inFlight += 1;
          mostInFlight = Math.max(mostInFlight, inFlight);
        } else if (isEndingEvent(event)) {
          inFlight -= 1;
        }
      },
      createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 5 }));

    expect(mostInFlight).toBe(2);
    expect(inFlight).toBe(0);
    expect(api.completeUploadFile).toHaveBeenCalledTimes(5);
  });

  it("starts nothing and says nothing for an empty input", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    const { workers, createMediaWorker } = makeWorkerFactoryFromAnswer();
    const api = makeUploadApiFromScenario({ fileCount: 0 });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent,
      createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start([]);

    expect(events).toEqual([]);
    expect(workers).toHaveLength(0);
    expect(api.getUploadSession).not.toHaveBeenCalled();
  });

  it("emits each file's start, progress and end, and settled once at the end", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: makeUploadApiFromScenario({ fileCount: 2 }),
      onEvent,
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 2 }));

    expect(
      events.map((event) => {
        return "fileId" in event ? `${event.kind} ${event.fileId}` : event.kind;
      }),
    ).toEqual([
      `file-started ${makeFileIdFromIndex(1)}`,
      `file-progress ${makeFileIdFromIndex(1)}`,
      `file-done ${makeFileIdFromIndex(1)}`,
      `file-started ${makeFileIdFromIndex(2)}`,
      `file-progress ${makeFileIdFromIndex(2)}`,
      `file-done ${makeFileIdFromIndex(2)}`,
      "settled",
    ]);
    expect(events.at(-1)).toEqual({ kind: "settled", sessionState: "settled" });
  });

  it("does not let one failed file stop the rest", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    const transport: UploadTransport = {
      putBytes: async (options) => {
        return {
          status: options.url.includes(makeFileIdFromIndex(1)) ? 400 : 200,
          etag: undefined,
        };
      },
    };
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: makeUploadApiFromScenario({ fileCount: 2 }),
      onEvent,
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport,
      retry: INSTANT_RETRY,
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 2 }));

    expect(events).toContainEqual({
      kind: "file-failed",
      fileId: makeFileIdFromIndex(1),
      problemCode: "storage_rejected",
      detail: "Storage answered 400",
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "file-done",
        fileId: makeFileIdFromIndex(2),
      }),
    );
  });

  it("replaces a worker once it has decoded the recycle count of HEICs", async () => {
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
            };
      },
    );
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: makeUploadApiFromScenario({ fileCount: 10 }),
      onEvent: () => {},
      createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start(
      makeUploadEngineFilesFromPhotoCount({ count: 10, type: "image/heic" }),
    );

    // Eight files of two requests each, then a fresh worker for the last two.
    expect(workers).toHaveLength(2);
    expect(workers[0]?.requests).toHaveLength(16);
    expect(workers[1]?.requests).toHaveLength(4);
    expect(
      workers.every((worker) => {
        return worker.isTerminated;
      }),
    ).toBe(true);
  });

  it("fails a file the browser cannot read, rather than waiting on it", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    const { workers, createMediaWorker } = makeWorkerFactoryFromAnswer(
      (request) => {
        return request.kind === "hash" && workers.length === 1
          ? {
              kind: "failed",
              requestId: request.requestId,
              detail: "NotReadableError: The file is gone.",
            }
          : makeWorkerAnswerFromRequest(request);
      },
    );
    const api = makeUploadApiFromScenario({ fileCount: 2 });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api,
      onEvent,
      createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 2 }));

    expect(events[1]).toEqual({
      kind: "file-failed",
      fileId: makeFileIdFromIndex(1),
      problemCode: "connection_lost",
      detail: "NotReadableError: The file is gone.",
    });
    expect(api.completeUploadFile).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      fileId: makeFileIdFromIndex(1),
      body: {
        outcome: "failed",
        problemCode: "connection_lost",
        problemDetail: "NotReadableError: The file is gone.",
      },
    });
    expect(workers).toHaveLength(2);
  });

  it("sends a video's poster and thumb with its size and its mvhd duration", async () => {
    const mvhd = makeMvhdAtomBytesFromFields({
      version: 0,
      createdAt: new Date("2026-09-14T06:41:32.000Z"),
      timescale: 600,
      duration: 600 * 12,
    });
    const video = new File(
      [
        new Uint8Array(
          makeAtomBytesFromTypeAndBody({ type: "moov", body: mvhd }),
        ),
      ],
      "IMG_0002.MOV",
      { type: "video/quicktime" },
    );
    const api = makeUploadApiFromScenario({ fileCount: 1 });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent: () => {},
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport: createLandingUploadTransport(),
      makeVideoDerivativesFromFile: async () => {
        return {
          derivatives: [
            {
              purpose: "poster",
              blob: new Blob([new Uint8Array(3)]),
              width: 1152,
              height: 2048,
            },
            {
              purpose: "thumb",
              blob: new Blob([new Uint8Array(2)]),
              width: 270,
              height: 480,
            },
          ],
          size: { width: 1080, height: 1920 },
        };
      },
    });

    await engine.start([{ fileId: makeFileIdFromIndex(1), file: video }]);

    expect(api.completeUploadFile.mock.calls[0]?.[0].body).toMatchObject({
      outcome: "done",
      width: 1080,
      height: 1920,
      durationMs: 12_000,
      renditions: [
        { purpose: "poster", byteSize: 3, width: 1152, height: 2048 },
        { purpose: "thumb", byteSize: 2, width: 270, height: 480 },
      ],
    });
  });
});
