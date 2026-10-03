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
  headers: Readonly<Record<string, string>>;
  body: Blob;
  /** Bytes of `body` sent so far, as the browser reports them. */
  onProgress: (sentBytes: number) => void;
  signal: AbortSignal;
};

/**
 * Any HTTP answer at all, success or not, with the ETag when the bucket's
 * CORS rule lets the browser read it.
 */
export type PutBytesResult = { status: number; etag: string | null };

/** The transport the transfer PUTs through. */
export type UploadTransport = {
  /**
   * Resolves for every HTTP answer, whatever its status. Rejects only when
   * there was no answer: a network failure, or `signal` aborting it.
   */
  putBytes: (options: Readonly<PutBytesOptions>) => Promise<PutBytesResult>;
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
 * The browser's transport: `XMLHttpRequest`, because `fetch` still has no
 * upload progress, and a 533 MB video with no moving bar reads as stuck.
 *
 * The ETag is read with `getResponseHeader`, which answers null unless the
 * bucket's CORS rule exposes `ETag` (`pnpm b2:cors`); the transfer turns that
 * null into an error naming CORS rather than a multipart upload that can
 * never complete.
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
        request.upload.addEventListener("progress", (event) => {
          options.onProgress(event.loaded);
        });
        request.addEventListener("load", () => {
          settle({
            status: request.status,
            etag: request.getResponseHeader("ETag"),
          });
        });
        request.addEventListener("error", () => {
          fail(new UploadNetworkError("The PUT to storage got no answer"));
        });
        request.addEventListener("abort", () => {
          fail(new DOMException("The upload was cancelled", "AbortError"));
        });
        options.signal.addEventListener(
          "abort",
          () => {
            request.abort();
          },
          { once: true },
        );
        request.send(options.body);
      });
    },
  };
}
