import {
  SESSION_ID,
  IN_AN_HOUR,
  INSTANT_RETRY,
  makeFileIdFromIndex,
  makeUploadEngineFilesFromPhotoCount,
  makeCompleteResponseFromOptions,
  makeUploadApiFromScenario,
  createLandingUploadTransport,
  makeWorkerFactoryFromAnswer,
  isEndingEvent,
  createUploadEventRecorder,
} from "./createUploadEngineTestHelpers";

import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

import { makeAtomBytesFromTypeAndBody } from "@/testing/mediaBytesHelpers/mediaAtomBytesHelpers";
import {
  makeMvhdAtomBytesFromFields,
  makeTkhdAtomBytesFromFields,
} from "@/testing/mediaBytesHelpers/mediaBytesHelpers";
import { createUploadEngine } from "@/upload/createUploadEngine/createUploadEngine";

import type { UploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

describe("createUploadEngine", () => {
  it("completes a video no browser could decode, on its track's size", async () => {
    const moov = makeAtomBytesFromTypeAndBody({
      type: "moov",
      body: [
        ...makeMvhdAtomBytesFromFields({
          version: 0,
          createdAt: new Date("2026-09-14T06:41:32.000Z"),
          timescale: 600,
          duration: 600 * 3,
        }),
        ...makeAtomBytesFromTypeAndBody({
          type: "trak",
          body: makeTkhdAtomBytesFromFields({
            version: 0,
            width: 1920,
            height: 1080,
            quarterTurns: 1,
          }),
        }),
      ],
    });
    const video = new File([new Uint8Array(moov)], "IMG_0003.MOV", {
      type: "video/quicktime",
    });
    const api = makeUploadApiFromScenario({ fileCount: 1 });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent: () => {},
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport: createLandingUploadTransport(),
      makeVideoDerivativesFromFile: async () => {
        return { derivatives: [], size: undefined };
      },
    });

    await engine.start([{ fileId: makeFileIdFromIndex(1), file: video }]);

    expect(api.completeUploadFile.mock.calls[0]?.[0].body).toMatchObject({
      outcome: "done",
      width: 1080,
      height: 1920,
      durationMs: 3000,
      renditions: [],
    });
  });

  it("stops new work, aborts the PUT in flight and reports no ending on cancel", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    let onFirstPut: () => void = () => {};
    const firstPut = new Promise<void>((settle) => {
      onFirstPut = settle;
    });
    const transport: UploadTransport = {
      putBytes: (options) => {
        onFirstPut();
        return new Promise((_settle, fail) => {
          options.signal.addEventListener("abort", () => {
            fail(new DOMException("The upload was cancelled", "AbortError"));
          });
        });
      },
    };
    const { workers, createMediaWorker } = makeWorkerFactoryFromAnswer();
    const api = makeUploadApiFromScenario({ fileCount: 3 });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api,
      onEvent,
      createMediaWorker,
      transport,
    });

    const running = engine.start(
      makeUploadEngineFilesFromPhotoCount({ count: 3 }),
    );
    await firstPut;
    engine.cancel();
    await running;

    expect(events).toEqual([
      { kind: "file-started", fileId: makeFileIdFromIndex(1) },
    ]);
    expect(api.presignUploadFile).toHaveBeenCalledTimes(1);
    expect(api.completeUploadFile).not.toHaveBeenCalled();
    expect(workers[0]?.isTerminated).toBe(true);
  });

  it.each([
    [
      "the session is gone",
      new ApiRequestError({
        status: 409,
        code: "upload_session_conflict",
        message: "This batch is not taking files.",
      }),
    ],
    [
      "the batch was closed under the file",
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "This file is cancelled.",
        details: { state: "cancelled" },
      }),
    ],
  ])(
    "stops the run when a transfer finds %s, hashing and starting nothing more",
    async (_name, closed) => {
      const { events, onEvent } = createUploadEventRecorder();
      const { workers, createMediaWorker } = makeWorkerFactoryFromAnswer();
      const api = makeUploadApiFromScenario({ fileCount: 3 });
      api.presignUploadFile.mockRejectedValueOnce(closed);
      const engine = createUploadEngine({
        sessionId: SESSION_ID,
        concurrency: 1,
        api,
        onEvent,
        createMediaWorker,
        transport: createLandingUploadTransport(),
        retry: INSTANT_RETRY,
      });

      await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 3 }));

      expect(events).toEqual([
        { kind: "file-started", fileId: makeFileIdFromIndex(1) },
        { kind: "batch-closed" },
      ]);
      expect(api.presignUploadFile).toHaveBeenCalledTimes(1);
      expect(api.completeUploadFile).not.toHaveBeenCalled();
      const hashedCount = workers.flatMap((worker) => {
        return worker.requests.filter((request) => {
          return request.kind === "hash";
        });
      }).length;
      expect(hashedCount).toBe(1);
    },
  );

  it("aborts the other lane's transfer when one lane finds the batch closed", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    let onSecondPut: () => void = () => {};
    const secondPut = new Promise<void>((settle) => {
      onSecondPut = settle;
    });
    const transport: UploadTransport = {
      putBytes: (options) => {
        onSecondPut();
        return new Promise((_settle, fail) => {
          options.signal.addEventListener("abort", () => {
            fail(new DOMException("The upload was cancelled", "AbortError"));
          });
        });
      },
    };
    const api = makeUploadApiFromScenario({ fileCount: 4 });
    api.presignUploadFile.mockImplementation(
      async (options: { fileId: string }) => {
        if (options.fileId === makeFileIdFromIndex(1)) {
          // File 1 is refused only once file 2 is mid-PUT in the other lane.
          await secondPut;
          throw new ApiRequestError({
            status: 409,
            code: "upload_session_conflict",
            message: "This batch is not taking files.",
          });
        }
        return {
          mode: "single" as const,
          fileId: options.fileId,
          method: "PUT" as const,
          url: `https://b2/${options.fileId}/original`,
          headers: { "Content-Type": "image/jpeg" },
          expiresAt: IN_AN_HOUR,
        };
      },
    );
    const { workers, createMediaWorker } = makeWorkerFactoryFromAnswer();
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 2,
      api,
      onEvent,
      createMediaWorker,
      transport,
      retry: INSTANT_RETRY,
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 4 }));

    expect(events.filter(isEndingEvent)).toEqual([]);
    expect(events.at(-1)).toEqual({ kind: "batch-closed" });
    expect(
      events.filter((event) => {
        return event.kind === "file-started";
      }),
    ).toHaveLength(2);
    expect(api.completeUploadFile).not.toHaveBeenCalled();
    expect(
      workers.every((worker) => {
        return worker.isTerminated;
      }),
    ).toBe(true);
  });

  it("ends with one settled, last, even when the latch's answer comes first", async () => {
    const { events, onEvent } = createUploadEventRecorder();
    let completed = 0;
    const api = makeUploadApiFromScenario({ fileCount: 2 });
    // File 1's answer is held until file 2's, the latch's, has arrived: the
    // order two lanes really can produce.
    let releaseFirst: () => void = () => {};
    const firstHeld = new Promise<void>((settle) => {
      releaseFirst = settle;
    });
    api.completeUploadFile.mockImplementation(async (options) => {
      completed += 1;
      if (options.fileId === makeFileIdFromIndex(1)) {
        await firstHeld;
        return makeCompleteResponseFromOptions({
          fileId: options.fileId,
          state: "done",
          didSettle: false,
        });
      }
      releaseFirst();
      return makeCompleteResponseFromOptions({
        fileId: options.fileId,
        state: "done",
        didSettle: true,
      });
    });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 2,
      api,
      onEvent,
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    await engine.start(makeUploadEngineFilesFromPhotoCount({ count: 2 }));

    const settled = events.filter((event) => {
      return event.kind === "settled";
    });
    expect(completed).toBe(2);
    expect(settled).toEqual([{ kind: "settled", sessionState: "settled" }]);
    expect(events.at(-1)).toEqual({ kind: "settled", sessionState: "settled" });
  });
});
