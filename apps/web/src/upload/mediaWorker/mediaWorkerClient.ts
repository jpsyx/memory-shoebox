import type {
  MediaWorkerPort,
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "@/upload/mediaWorker/mediaWorkerProtocol";

/** The engine's side of one media worker: one method per request kind. */
export type MediaWorkerClient = {
  /** The file's lowercase hex SHA-256. Rejects if the worker could not. */
  hash: (file: Blob) => Promise<string>;
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

/**
 * The request side of one port.
 *
 * Numbers each request and pairs each answer back to it by `requestId`, so
 * answers may arrive in any order. A worker-level error (the script failed to
 * load, or something escaped `answerMediaWorkerRequest`) fails every request
 * in flight.
 */
function _makeRequestChannel(port: MediaWorkerPort): RequestChannel {
  const pending = new Map<number, PendingRequest>();
  let lastRequestId = 0;
  const failEverything = (error: Error): void => {
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
    failEverything(new Error(`Media worker failed: ${event.message}`));
  };
  return {
    send: (request) => {
      lastRequestId += 1;
      const requestId = lastRequestId;
      return new Promise((settle, fail) => {
        pending.set(requestId, { settle, fail });
        port.postMessage({ ...request, requestId });
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
    terminate: () => {
      port.terminate();
      channel.failEverything(new Error("Media worker terminated"));
    },
  };
}
