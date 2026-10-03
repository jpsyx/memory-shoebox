import type { CompleteUploadFileResponse } from "@memory-shoebox/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/api/client/client";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import {
  makeAtomBytes,
  makeJpegBytesFromExif,
  makeMvhdAtomBytes,
  makeTkhdAtomBytes,
} from "@/testing/mediaBytes";
import {
  createUploadEngine,
  type UploadApi,
  type UploadEngineEvent,
  type UploadEngineFile,
} from "@/upload/createUploadEngine/createUploadEngine";
import type {
  MediaWorkerPort,
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "@/upload/mediaWorker/mediaWorkerProtocol";
import type { UploadTransport } from "@/upload/transferUploadFile/uploadTransport";

const SESSION_ID = "018f0000-0000-7000-8000-00000000c001";
const HASH = "d".repeat(64);
const IN_AN_HOUR = new Date(Date.now() + 3_600_000).toISOString();

/** Never sleeps, so a retry costs a test nothing. */
const INSTANT_RETRY = {
  maxAttempts: 2,
  baseDelayMs: 1,
  maxDelayMs: 1,
  sleep: async () => {},
};

/** A file id for the nth test file. */
function _fileId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`;
}

/** n photographs whose headers say 4032 x 3024. */
function _photos(count: number, type = "image/jpeg"): UploadEngineFile[] {
  const bytes = makeJpegBytesFromExif({ pixelWidth: 4032, pixelHeight: 3024 });
  return Array.from({ length: count }, (_unused, index) => {
    return {
      fileId: _fileId(index + 1),
      file: new File([bytes], `IMG_${index + 1}.JPG`, { type }),
    };
  });
}

/** What `complete` answers for one file. */
function _completeResponse(options: {
  fileId: string;
  state: "done" | "failed";
  didSettle: boolean;
}): CompleteUploadFileResponse {
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
 * `fileCount` completions. A file in `duplicateFileIds` is answered the way
 * Task 14 answers a duplicate: cancelled, naming file 1 as the holder.
 */
function _fakeApi(
  fileCount: number,
  duplicateFileIds: readonly string[] = [],
): UploadApi & {
  presignUploadFile: ReturnType<typeof vi.fn>;
  completeUploadFile: ReturnType<typeof vi.fn>;
  getUploadSession: ReturnType<typeof vi.fn>;
} {
  let completed = 0;
  return {
    presignUploadFile: vi.fn(async (options) => {
      if (duplicateFileIds.includes(options.fileId)) {
        throw new ApiRequestError({
          status: 409,
          code: "upload_file_conflict",
          message: "These bytes are already in this batch.",
          details: { fileId: _fileId(1), state: "cancelled" },
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
      return _completeResponse({
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
function _landingTransport(): UploadTransport {
  return {
    putBytes: async (options) => {
      options.onProgress(options.body.size);
      return { status: 200, etag: null };
    },
  };
}

/** One fake worker: what it was asked, and whether it was ended. */
type FakeWorker = { requests: MediaWorkerRequest[]; isTerminated: boolean };

/** The default answer: the fixed hash, and no derivatives. */
function _defaultAnswer(request: MediaWorkerRequest): MediaWorkerResponse {
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
function _fakeWorkers(
  answer: (
    request: MediaWorkerRequest,
  ) => MediaWorkerResponse | Promise<MediaWorkerResponse> = _defaultAnswer,
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
function _isEndingEvent(event: UploadEngineEvent): boolean {
  return (
    event.kind === "file-done" ||
    event.kind === "file-failed" ||
    event.kind === "file-skipped"
  );
}

/** A QuickTime movie whose header is readable, so only its poster is faked. */
function _videoFile(): File {
  const mvhd = makeMvhdAtomBytes({
    version: 0,
    createdAt: new Date("2026-09-14T06:41:32.000Z"),
    timescale: 600,
    duration: 600 * 12,
  });
  return new File(
    [new Uint8Array(makeAtomBytes("moov", mvhd))],
    "IMG_0002.MOV",
    {
      type: "video/quicktime",
    },
  );
}

/** Collects every event an engine emits. */
function _recorder(): {
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

describe("createUploadEngine", () => {
  it("never has more than `concurrency` files in flight", async () => {
    let inFlight = 0;
    let mostInFlight = 0;
    // A slow worker, so that the lanes overlap for as long as they can.
    const { createMediaWorker } = _fakeWorkers(async (request) => {
      await new Promise((settle) => {
        setTimeout(settle, 5);
      });
      return _defaultAnswer(request);
    });
    const api = _fakeApi(5);
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 2,
      api,
      onEvent: (event) => {
        if (event.kind === "file-started") {
          inFlight += 1;
          mostInFlight = Math.max(mostInFlight, inFlight);
        } else if (_isEndingEvent(event)) {
          inFlight -= 1;
        }
      },
      createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start(_photos(5));

    expect(mostInFlight).toBe(2);
    expect(inFlight).toBe(0);
    expect(api.completeUploadFile).toHaveBeenCalledTimes(5);
  });

  it("starts nothing and says nothing for an empty input", async () => {
    const { events, onEvent } = _recorder();
    const { workers, createMediaWorker } = _fakeWorkers();
    const api = _fakeApi(0);
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent,
      createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start([]);

    expect(events).toEqual([]);
    expect(workers).toHaveLength(0);
    expect(api.getUploadSession).not.toHaveBeenCalled();
  });

  it("emits each file's start, progress and end, and settled once at the end", async () => {
    const { events, onEvent } = _recorder();
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: _fakeApi(2),
      onEvent,
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start(_photos(2));

    expect(
      events.map((event) => {
        return "fileId" in event ? `${event.kind} ${event.fileId}` : event.kind;
      }),
    ).toEqual([
      `file-started ${_fileId(1)}`,
      `file-progress ${_fileId(1)}`,
      `file-done ${_fileId(1)}`,
      `file-started ${_fileId(2)}`,
      `file-progress ${_fileId(2)}`,
      `file-done ${_fileId(2)}`,
      "settled",
    ]);
    expect(events.at(-1)).toEqual({ kind: "settled", sessionState: "settled" });
  });

  it("does not let one failed file stop the rest", async () => {
    const { events, onEvent } = _recorder();
    const transport: UploadTransport = {
      putBytes: async (options) => {
        return {
          status: options.url.includes(_fileId(1)) ? 400 : 200,
          etag: null,
        };
      },
    };
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: _fakeApi(2),
      onEvent,
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport,
      retry: INSTANT_RETRY,
    });

    await engine.start(_photos(2));

    expect(events).toContainEqual({
      kind: "file-failed",
      fileId: _fileId(1),
      problemCode: "storage_rejected",
      detail: "Storage answered 400",
    });
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "file-done", fileId: _fileId(2) }),
    );
  });

  it("replaces a worker once it has decoded the recycle count of HEICs", async () => {
    const { workers, createMediaWorker } = _fakeWorkers((request) => {
      return request.kind === "hash"
        ? _defaultAnswer(request)
        : {
            kind: "image-derivatives-made",
            requestId: request.requestId,
            derivatives: [],
            usedWasmDecoder: true,
            originalSize: null,
          };
    });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: _fakeApi(10),
      onEvent: () => {},
      createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start(_photos(10, "image/heic"));

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
    const { events, onEvent } = _recorder();
    const { workers, createMediaWorker } = _fakeWorkers((request) => {
      return request.kind === "hash" && workers.length === 1
        ? {
            kind: "failed",
            requestId: request.requestId,
            detail: "NotReadableError: The file is gone.",
          }
        : _defaultAnswer(request);
    });
    const api = _fakeApi(2);
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api,
      onEvent,
      createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start(_photos(2));

    expect(events[1]).toEqual({
      kind: "file-failed",
      fileId: _fileId(1),
      problemCode: "connection_lost",
      detail: "NotReadableError: The file is gone.",
    });
    expect(api.completeUploadFile).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      fileId: _fileId(1),
      body: {
        outcome: "failed",
        problemCode: "connection_lost",
        problemDetail: "NotReadableError: The file is gone.",
      },
    });
    expect(workers).toHaveLength(2);
  });

  it("sends a video's poster and thumb with its size and its mvhd duration", async () => {
    const mvhd = makeMvhdAtomBytes({
      version: 0,
      createdAt: new Date("2026-09-14T06:41:32.000Z"),
      timescale: 600,
      duration: 600 * 12,
    });
    const video = new File(
      [new Uint8Array(makeAtomBytes("moov", mvhd))],
      "IMG_0002.MOV",
      { type: "video/quicktime" },
    );
    const api = _fakeApi(1);
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent: () => {},
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport: _landingTransport(),
      makeVideoDerivatives: async () => {
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

    await engine.start([{ fileId: _fileId(1), file: video }]);

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

  it("completes a video no browser could decode, on its track's size", async () => {
    const moov = makeAtomBytes("moov", [
      ...makeMvhdAtomBytes({
        version: 0,
        createdAt: new Date("2026-09-14T06:41:32.000Z"),
        timescale: 600,
        duration: 600 * 3,
      }),
      ...makeAtomBytes(
        "trak",
        makeTkhdAtomBytes({
          version: 0,
          width: 1920,
          height: 1080,
          quarterTurns: 1,
        }),
      ),
    ]);
    const video = new File([new Uint8Array(moov)], "IMG_0003.MOV", {
      type: "video/quicktime",
    });
    const api = _fakeApi(1);
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent: () => {},
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport: _landingTransport(),
      makeVideoDerivatives: async () => {
        return { derivatives: [], size: null };
      },
    });

    await engine.start([{ fileId: _fileId(1), file: video }]);

    expect(api.completeUploadFile.mock.calls[0]?.[0].body).toMatchObject({
      outcome: "done",
      width: 1080,
      height: 1920,
      durationMs: 3000,
      renditions: [],
    });
  });

  it("stops new work, aborts the PUT in flight and reports no ending on cancel", async () => {
    const { events, onEvent } = _recorder();
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
    const { workers, createMediaWorker } = _fakeWorkers();
    const api = _fakeApi(3);
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api,
      onEvent,
      createMediaWorker,
      transport,
    });

    const running = engine.start(_photos(3));
    await firstPut;
    engine.cancel();
    await running;

    expect(events).toEqual([{ kind: "file-started", fileId: _fileId(1) }]);
    expect(api.presignUploadFile).toHaveBeenCalledTimes(1);
    expect(api.completeUploadFile).not.toHaveBeenCalled();
    expect(workers[0]?.isTerminated).toBe(true);
  });

  it("ends with one settled, last, even when the latch's answer comes first", async () => {
    const { events, onEvent } = _recorder();
    let completed = 0;
    const api = _fakeApi(2);
    // File 1's answer is held until file 2's, the latch's, has arrived: the
    // order two lanes really can produce.
    let releaseFirst: () => void = () => {};
    const firstHeld = new Promise<void>((settle) => {
      releaseFirst = settle;
    });
    api.completeUploadFile.mockImplementation(async (options) => {
      completed += 1;
      if (options.fileId === _fileId(1)) {
        await firstHeld;
        return _completeResponse({
          fileId: options.fileId,
          state: "done",
          didSettle: false,
        });
      }
      releaseFirst();
      return _completeResponse({
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
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start(_photos(2));

    const settled = events.filter((event) => {
      return event.kind === "settled";
    });
    expect(completed).toBe(2);
    expect(settled).toEqual([{ kind: "settled", sessionState: "settled" }]);
    expect(events.at(-1)).toEqual({ kind: "settled", sessionState: "settled" });
  });

  it("skips a duplicate presign cancelled, then reads the batch for settled", async () => {
    const { events, onEvent } = _recorder();
    // File 1 lands without the latch, because two were declared; file 2's
    // cancel at presign is what settles the batch, and says nothing of it.
    const api = _fakeApi(2, [_fileId(2)]);
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api,
      onEvent,
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start(_photos(2));

    expect(events.slice(-2)).toEqual([
      { kind: "file-skipped", fileId: _fileId(2), reason: "duplicate" },
      { kind: "settled", sessionState: "settled" },
    ]);
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
    expect(api.getUploadSession).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      limit: 1,
    });
  });

  it("emits no settled for a run that was cancelled", async () => {
    const { events, onEvent } = _recorder();
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api: _fakeApi(1),
      onEvent,
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport: {
        putBytes: async (options) => {
          engine.cancel();
          options.signal.throwIfAborted();
          return { status: 200, etag: null };
        },
      },
    });

    await engine.start(_photos(1));

    expect(
      events.some((event) => {
        return event.kind === "settled";
      }),
    ).toBe(false);
  });

  it("reports no ending for a file whose answer came back after the run was cancelled", async () => {
    const { events, onEvent } = _recorder();
    const api = _fakeApi(1);
    api.completeUploadFile.mockImplementation(async (options) => {
      // The answer was already on its way back when the caller cancelled.
      engine.cancel();
      return _completeResponse({
        fileId: options.fileId,
        state: "done",
        didSettle: true,
      });
    });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent,
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start(_photos(1));

    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
    expect(
      events.filter((event) => {
        return _isEndingEvent(event) || event.kind === "settled";
      }),
    ).toEqual([]);
  });

  it("sends nothing for a file whose poster was being made when the run was cancelled", async () => {
    const { events, onEvent } = _recorder();
    const api = _fakeApi(1);
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api,
      onEvent,
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport: _landingTransport(),
      makeVideoDerivatives: async () => {
        // The poster is drawn on the main thread, which a cancel cannot reach.
        engine.cancel();
        return { derivatives: [], size: { width: 1080, height: 1920 } };
      },
    });

    await engine.start([{ fileId: _fileId(1), file: _videoFile() }]);

    expect(api.presignUploadFile).not.toHaveBeenCalled();
    expect(api.completeUploadFile).not.toHaveBeenCalled();
    expect(events).toEqual([{ kind: "file-started", fileId: _fileId(1) }]);
  });

  it("starts no worker for a file whose header was being read when the run was cancelled", async () => {
    const { events, onEvent } = _recorder();
    const { workers, createMediaWorker } = _fakeWorkers();
    const api = _fakeApi(1);
    const [photo] = _photos(1);
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
      transport: _landingTransport(),
    });

    await engine.start([photo]);

    // The one worker that hashed the file, and none after the cancel.
    expect(workers).toHaveLength(1);
    expect(workers[0]?.isTerminated).toBe(true);
    expect(api.presignUploadFile).not.toHaveBeenCalled();
    expect(events).toEqual([{ kind: "file-started", fileId: _fileId(1) }]);
  });

  it("stops the other lane and ends every worker when a lane throws", async () => {
    const hungSignals: AbortSignal[] = [];
    let onSecondPut: () => void = () => {};
    const secondPutStarted = new Promise<void>((settle) => {
      onSecondPut = settle;
    });
    const transport: UploadTransport = {
      putBytes: (options) => {
        if (options.url.includes(_fileId(1))) {
          return Promise.resolve({ status: 200, etag: null });
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
    const { events, onEvent } = _recorder();
    const { workers, createMediaWorker } = _fakeWorkers();
    const api = _fakeApi(2);
    // File 1 ends only once file 2's PUT is under way, so that there is
    // something in flight for the failure to cut off.
    api.completeUploadFile.mockImplementation(async (options) => {
      await secondPutStarted;
      return _completeResponse({
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

    await expect(engine.start(_photos(2))).rejects.toThrow(
      "The caller's handler broke",
    );
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
    // Only file 1 ended: file 2 was cut off, and a cut-off file reports nothing.
    expect(events.filter(_isEndingEvent)).toEqual([
      expect.objectContaining({ kind: "file-done", fileId: _fileId(1) }),
    ]);
  });

  it("replaces a worker at once when libheif was tried and a derivative was dropped", async () => {
    const { workers, createMediaWorker } = _fakeWorkers((request) => {
      return request.kind === "hash"
        ? _defaultAnswer(request)
        : {
            kind: "image-derivatives-made",
            requestId: request.requestId,
            derivatives: [],
            usedWasmDecoder: true,
            originalSize: null,
            dropDetail: "The HEIC decode timed out",
          };
    });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: _fakeApi(3),
      onEvent: () => {},
      createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start(_photos(3, "image/heic"));

    expect(workers).toHaveLength(3);
    expect(
      workers.every((worker) => {
        return worker.isTerminated;
      }),
    ).toBe(true);
  });

  it("keeps a worker whose dropped derivative never involved libheif", async () => {
    const { workers, createMediaWorker } = _fakeWorkers((request) => {
      return request.kind === "hash"
        ? _defaultAnswer(request)
        : {
            kind: "image-derivatives-made",
            requestId: request.requestId,
            derivatives: [],
            usedWasmDecoder: false,
            originalSize: null,
            dropDetail: "The browser could not decode the image",
          };
    });
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      concurrency: 1,
      api: _fakeApi(3),
      onEvent: () => {},
      createMediaWorker,
      transport: _landingTransport(),
    });

    await engine.start(_photos(3));

    expect(workers).toHaveLength(1);
  });

  it("refuses a second start while the first is running", async () => {
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api: _fakeApi(1),
      onEvent: () => {},
      createMediaWorker: _fakeWorkers().createMediaWorker,
      transport: _landingTransport(),
    });

    const running = engine.start(_photos(1));

    await expect(engine.start(_photos(1))).rejects.toThrow("already running");
    await running;
  });
});
