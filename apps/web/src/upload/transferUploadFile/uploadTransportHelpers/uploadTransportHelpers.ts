import { appConfig } from "../../../../../../app.config";

/** Inputs for _wireRequest. */
type WireRequestOptions = {
  request: XMLHttpRequest;
  put: PutBytesOptions;
  settle: (result: PutBytesResult) => void;
  fail: (reason: unknown) => void;
};

/**
 * One PUT of some bytes to a presigned URL: the only network operation the
 * transfer makes against Backblaze.
 *
 * Behind an interface so the transfer's retry, re-presign and part logic is
 * tested against a fake, and so the browser half is the one small function
 * below.
 */
export type PutBytesOptions = {
  url: string;
  /** Exactly what presign returned, `Content-Type` included. */
  headers: Record<string, string>;
  body: Blob;
  /** Bytes of `body` sent so far, as the browser reports them. */
  onProgress: (sentBytes: number) => void;
  signal: AbortSignal;
};

/**
 * Any HTTP answer at all, success or not, with the ETag when the bucket's
 * CORS rule lets the browser read it.
 */
export type PutBytesResult = { status: number; etag: string | undefined };

/** The transport the transfer PUTs through. */
export type UploadTransport = {
  /**
   * Resolves for every HTTP answer, whatever its status. Rejects only when
   * there was no answer: a network failure, or `signal` aborting it.
   */
  putBytes: (
    options: Readonly<Omit<PutBytesOptions, "headers">> &
      Readonly<{
        headers: Readonly<Record<string, string>>;
      }>,
  ) => Promise<PutBytesResult>;
};

/**
 * Raised when a PUT never got an HTTP answer.
 *
 * A class, against the house preference, for the reason `ApiRequestError`
 * is one: a rejection should be an `Error` with a name a log can show.
 */
export class UploadNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadNetworkError";
  }
}

/**
 * How long a PUT may go without one upload progress event before it is given
 * up on: `appConfig.upload.stalledPutTimeoutSeconds`, ninety seconds.
 *
 * A link that drops without closing (a phone handed between cell towers, a
 * Wi-Fi that stays associated and passes nothing) leaves a request that never
 * errors and never finishes, and a lane that waits on it forever. Even the
 * floor rate, `appConfig.upload.transferFloorBytesPerSecond`, moves a packet
 * many times a second, so ninety seconds of no progress is a dead
 * connection. A stalled PUT is aborted and reported as `UploadNetworkError`,
 * so the transfer's ordinary retry sends that part, or that file, again.
 */
export const STALLED_PUT_TIMEOUT_MS =
  appConfig.upload.stalledPutTimeoutSeconds * 1000;

/** Starts the countdown; `onStall` runs if it ever reaches zero. */
function _startStallTimer(onStall: () => void): {
  restart: () => void;
  stop: () => void;
  hasFired: () => boolean;
} {
  let hasFired = false;
  const fire = () => {
    hasFired = true;
    onStall();
  };
  let timer = setTimeout(fire, STALLED_PUT_TIMEOUT_MS);
  return {
    restart: () => {
      clearTimeout(timer);
      timer = setTimeout(fire, STALLED_PUT_TIMEOUT_MS);
    },
    stop: () => {
      clearTimeout(timer);
    },
    hasFired: () => {
      return hasFired;
    },
  };
}

/**
 * Wires progress, completion, cancellation and stall handling for one PUT.
 *
 * No progress for STALLED_PUT_TIMEOUT_MS aborts the request and reports a
 * network error, so the transfer can retry it. Cancellation remains a separate
 * outcome.
 *
 * The signal listener and stall timer are released on loadend. The returned
 * release function also handles send throwing before loadend, so a batch signal
 * never retains a finished request or its body.
 *
 * @returns The function that lets go of the signal and the timer, for a `send`
 *   that throws and so never reaches `loadend`.
 */
function _wireRequest(
  options: Readonly<Omit<WireRequestOptions, "put">> &
    Readonly<{ put: Readonly<PutBytesOptions> }>,
): () => void {
  // Connect load, error and abort to the outcome callbacks, and connect the
  // batch
  // signal to request.abort().

  const { request, put } = options;
  const abortRequest = () => {
    request.abort();
  };
  const stall = _startStallTimer(abortRequest);
  const release = () => {
    stall.stop();
    put.signal.removeEventListener("abort", abortRequest);
  };
  request.upload.addEventListener("progress", (event) => {
    stall.restart();
    put.onProgress(event.loaded);
  });
  request.addEventListener("load", () => {
    options.settle({
      status: request.status,
      etag: request.getResponseHeader("ETag") ?? undefined,
    });
  });
  request.addEventListener("error", () => {
    options.fail(new UploadNetworkError("The PUT to storage got no answer"));
  });
  request.addEventListener("abort", () => {
    options.fail(
      stall.hasFired()
        ? new UploadNetworkError(
            `The PUT to storage made no progress for ${STALLED_PUT_TIMEOUT_MS / 1000} seconds`,
          )
        : new DOMException("The upload was cancelled", "AbortError"),
    );
  });
  request.addEventListener("loadend", release);
  put.signal.addEventListener("abort", abortRequest, { once: true });
  return release;
}

/**
 * The browser's transport: `XMLHttpRequest`, because `fetch` still has no
 * upload progress, and a 533 MB video with no moving bar reads as stuck.
 *
 * The ETag is read with `getResponseHeader`, which answers null unless the
 * bucket's CORS rule exposes `ETag` (`pnpm b2:cors`); the transfer turns that
 * null into an error naming CORS rather than a multipart upload that can
 * never complete. A PUT that makes no progress for `STALLED_PUT_TIMEOUT_MS`
 * is aborted and rejected as `UploadNetworkError`, which the transfer
 * retries.
 */
export function createXhrUploadTransport(): UploadTransport {
  return {
    putBytes: (options) => {
      return new Promise((settle, fail) => {
        if (options.signal.aborted) {
          fail(new DOMException("The upload was cancelled", "AbortError"));
          return;
        }
        const request = new XMLHttpRequest();
        request.open("PUT", options.url);
        Object.entries(options.headers).forEach(([name, value]) => {
          request.setRequestHeader(name, value);
        });
        const release = _wireRequest({
          request,
          put: options,
          settle,
          fail,
        });
        try {
          request.send(options.body);
        } catch (error: unknown) {
          release();
          throw error;
        }
      });
    },
  };
}
