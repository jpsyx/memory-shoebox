/**
 * The messages between the upload engine and its media workers.
 *
 * One module both halves import, so a request the engine can post and a
 * response the worker can send are the same types on both sides. Every
 * request carries a `requestId` the response echoes, because one worker
 * answers several requests over its life and a response must find its own.
 *
 * A `File` crosses by structured clone, which copies the handle and not the
 * bytes: a 533 MB video costs nothing to post.
 */

/** Hash one file. Answered by `hashed`, or `failed`. */
export type HashRequest = { kind: "hash"; requestId: number; file: Blob };

/** What the engine posts to a media worker. */
export type MediaWorkerRequest = HashRequest;

/** What a media worker posts back, one per request. */
export type MediaWorkerResponse =
  | { kind: "hashed"; requestId: number; contentHash: string }
  | { kind: "failed"; requestId: number; detail: string };

/**
 * The part of a `Worker` the engine uses.
 *
 * Narrow on purpose: a real `Worker` satisfies it as it stands, and so does
 * the in-process fake the tests run the worker's own code through.
 */
export type MediaWorkerPort = {
  postMessage: (request: MediaWorkerRequest) => void;
  onmessage: ((event: MessageEvent<MediaWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate: () => void;
};
