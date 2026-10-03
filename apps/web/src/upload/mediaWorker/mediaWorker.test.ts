import { afterEach, describe, expect, it, vi } from "vitest";
import { answerMediaWorkerRequest } from "@/upload/mediaWorker/answerMediaWorkerRequest";
import { makeMediaWorkerClientFromPort } from "@/upload/mediaWorker/mediaWorkerClient";
import type {
  MediaWorkerPort,
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "@/upload/mediaWorker/mediaWorkerProtocol";

const ABC_SHA256 =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** A port that runs the worker's own code here, and answers when told to. */
type HeldPort = MediaWorkerPort & {
  requests: MediaWorkerRequest[];
  /** Answers the requests at these indexes, in this order. */
  deliver: (order: readonly number[]) => Promise<void>;
  wasTerminated: () => boolean;
};

/**
 * The worker without the worker: requests are kept, and `deliver` runs
 * `answerMediaWorkerRequest` on them and hands the answers to `onmessage` in
 * whatever order the test chooses.
 */
function _makeHeldPort(): HeldPort {
  let isTerminated = false;
  const port: HeldPort = {
    requests: [],
    onmessage: null,
    onerror: null,
    postMessage: (request) => {
      port.requests.push(request);
    },
    terminate: () => {
      isTerminated = true;
    },
    wasTerminated: () => {
      return isTerminated;
    },
    deliver: async (order) => {
      const answers = await Promise.all(
        order.map((index) => {
          const request = port.requests[index];
          if (request === undefined) {
            throw new Error(`No request ${index} was posted`);
          }
          return answerMediaWorkerRequest(request);
        }),
      );
      answers.forEach((data) => {
        port.onmessage?.(
          new MessageEvent<MediaWorkerResponse>("message", { data }),
        );
      });
    },
  };
  return port;
}

/** The read error a moved or deleted file gives. */
function _failNextRead(): void {
  vi.spyOn(Blob.prototype, "arrayBuffer").mockRejectedValueOnce(
    new DOMException("The file is gone.", "NotReadableError"),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("answerMediaWorkerRequest", () => {
  it("answers a hash request with the digest, echoing its id", async () => {
    await expect(
      answerMediaWorkerRequest({
        kind: "hash",
        requestId: 7,
        file: new Blob(["abc"]),
      }),
    ).resolves.toEqual({
      kind: "hashed",
      requestId: 7,
      contentHash: ABC_SHA256,
    });
  });

  it("answers failed, never rejects, when the file cannot be read", async () => {
    _failNextRead();

    await expect(
      answerMediaWorkerRequest({
        kind: "hash",
        requestId: 8,
        file: new Blob(["abc"]),
      }),
    ).resolves.toEqual({
      kind: "failed",
      requestId: 8,
      detail: "NotReadableError: The file is gone.",
    });
  });
});

describe("makeMediaWorkerClientFromPort", () => {
  it("pairs answers to requests by id, whatever order they arrive in", async () => {
    const port = _makeHeldPort();
    const client = makeMediaWorkerClientFromPort(port);

    const first = client.hash(new Blob(["abc"]));
    const second = client.hash(new Blob([]));
    await port.deliver([1, 0]);

    await expect(first).resolves.toBe(ABC_SHA256);
    await expect(second).resolves.toBe(EMPTY_SHA256);
  });

  it("rejects with the worker's own words when it could not hash", async () => {
    _failNextRead();
    const port = _makeHeldPort();
    const client = makeMediaWorkerClientFromPort(port);

    const hashed = client.hash(new Blob(["abc"]));
    await port.deliver([0]);

    await expect(hashed).rejects.toThrow("NotReadableError: The file is gone.");
  });

  it("fails every request in flight when the worker itself errors", async () => {
    const port = _makeHeldPort();
    const client = makeMediaWorkerClientFromPort(port);

    const first = client.hash(new Blob(["a"]));
    const second = client.hash(new Blob(["b"]));
    port.onerror?.(new ErrorEvent("error", { message: "script failed" }));

    await expect(first).rejects.toThrow("script failed");
    await expect(second).rejects.toThrow("script failed");
  });

  it("terminates the worker and fails what was still in flight", async () => {
    const port = _makeHeldPort();
    const client = makeMediaWorkerClientFromPort(port);

    const hashed = client.hash(new Blob(["abc"]));
    client.terminate();

    expect(port.wasTerminated()).toBe(true);
    await expect(hashed).rejects.toThrow("terminated");
  });
});
