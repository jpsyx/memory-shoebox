import type { PixelSize } from "@/upload/jpegDerivatives/jpegDerivatives";
import type { ImageDerivativesResult } from "@/upload/makeImageDerivatives/makeImageDerivatives";
import type {
  MediaWorkerPort,
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "@/upload/mediaWorker/mediaWorkerProtocol";

/** The engine's side of one media worker: one method per request kind. */
export type MediaWorkerClient = {
  /** The file's lowercase hex SHA-256. Rejects if the worker could not. */
  hash: (file: Blob) => Promise<string>;
  /** The image's derivatives, possibly none. Rejects only on a read error. */
  makeImageDerivatives: (
    options: Readonly<{
      file: Blob;
      contentType: string;
      size: PixelSize | null;
    }>,
  ) => Promise<ImageDerivativesResult>;
  /** Ends the worker. Every request still in flight rejects. */
  terminate: () => void;
};

/** `Omit`, applied to each member of a union rather than to the union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A request before the channel numbers it. */
type UnnumberedRequest = DistributiveOmit<MediaWorkerRequest, "requestId">;

/** The two halves of one request's promise, kept until its answer arrives. */
type PendingRequest = {
  settle: (response: MediaWorkerResponse) => void;
  fail: (error: Error) => void;
};

/** Numbered requests out, answers paired back in, or everything failed. */
type RequestChannel = {
  send: (request: UnnumberedRequest) => Promise<MediaWorkerResponse>;
  failEverything: (error: Error) => void;
};

/** What a worker-level error says when the event carries no message. */
const SCRIPT_FAILED_TO_LOAD = "the worker script could not load";

/**
 * The request side of one port.
 *
 * Numbers each request and pairs each answer back to it by `requestId`, so
 * answers may arrive in any order. A worker-level error (the script failed to
 * load, or something escaped `answerMediaWorkerRequest`) fails every request
 * in flight, and closes the channel: a request sent after that rejects at
 * once with the same error, because nothing is left to answer it.
 */
function _makeRequestChannel(port: MediaWorkerPort): RequestChannel {
  const pending = new Map<number, PendingRequest>();
  let lastRequestId = 0;
  let closedError: Error | null = null;
  const failEverything = (error: Error): void => {
    closedError ??= error;
    pending.forEach((request) => {
      request.fail(error);
    });
    pending.clear();
  };
  port.onmessage = (event) => {
    const request = pending.get(event.data.requestId);
    pending.delete(event.data.requestId);
    request?.settle(event.data);
  };
  port.onerror = (event) => {
    // A module worker whose script fails to load fires a plain `Event`, so
    // `message` can be missing rather than empty.
    const reason = event.message || SCRIPT_FAILED_TO_LOAD;
    failEverything(new Error(`Media worker failed: ${reason}`));
  };
  return {
    send: (request) => {
      if (closedError !== null) {
        return Promise.reject(closedError);
      }
      lastRequestId += 1;
      const requestId = lastRequestId;
      return new Promise((settle, fail) => {
        pending.set(requestId, { settle, fail });
        try {
          port.postMessage({ ...request, requestId });
        } catch (error: unknown) {
          // A request that never left (a `DataCloneError`, say) has no
          // answer coming, so it must not sit in the map.
          pending.delete(requestId);
          throw error;
        }
      });
    },
    failEverything,
  };
}

/** The error a request rejects with when its answer is not the one wanted. */
function _makeErrorFromResponse(response: MediaWorkerResponse): Error {
  return new Error(
    response.kind === "failed"
      ? response.detail
      : `Unexpected media worker answer: ${response.kind}`,
  );
}

/**
 * A promise-per-request client over one worker's message port.
 *
 * A worker that errors fails every request in flight, which is what lets the
 * engine fail those files instead of waiting on them forever.
 *
 * @param port A `Worker`, or anything shaped like the part of one used here.
 */
export function makeMediaWorkerClientFromPort(
  port: MediaWorkerPort,
): MediaWorkerClient {
  const channel = _makeRequestChannel(port);
  return {
    hash: async (file) => {
      const response = await channel.send({ kind: "hash", file });
      if (response.kind === "hashed") {
        return response.contentHash;
      }
      throw _makeErrorFromResponse(response);
    },
    makeImageDerivatives: async (options) => {
      const response = await channel.send({
        kind: "image-derivatives",
        ...options,
      });
      if (response.kind === "image-derivatives-made") {
        return {
          derivatives: response.derivatives,
          usedWasmDecoder: response.usedWasmDecoder,
          originalSize: response.originalSize,
          dropDetail: response.dropDetail,
        };
      }
      throw _makeErrorFromResponse(response);
    },
    terminate: () => {
      port.terminate();
      channel.failEverything(new Error("Media worker terminated"));
    },
  };
}
