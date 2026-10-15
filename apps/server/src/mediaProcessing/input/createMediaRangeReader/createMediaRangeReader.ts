import { randomUUID } from "node:crypto";

import { EventEmitter, once } from "node:events";

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { AddressInfo } from "node:net";

import {
  type MediaRangeReader,
  type MediaRangeReaderFailure,
  type ReaderOptions,
  type ReaderState,
  type Transfer,
} from "./createMediaRangeReader.types.ts";

export type { MediaRangeReaderFailure } from "./createMediaRangeReader.types.ts";

export type { MediaRangeReader } from "./createMediaRangeReader.types.ts";

import {
  MAX_REQUESTS,
  SEGMENT_BYTES,
  TERMINAL_FAILURES,
} from "./createMediaRangeReader.constants.ts";

import {
  getRangeFailureFromError,
  getRangeFromRequest,
  runWithReadIdleTimeout,
  validateMediaRangeResponse,
} from "./mediaRangeProtocolHelpers.ts";

function _getBudgetFailureFromRead(
  state: Readonly<ReaderState>,
): MediaRangeReaderFailure | undefined {
  if (state.requests >= MAX_REQUESTS) {
    return "input_request_limit";
  }
  if (state.bytesRead >= state.byteLimit) {
    return "input_byte_limit";
  }
  if (state.bytesRead >= (state.phaseByteLimit ?? Infinity)) {
    return "phase_byte_limit";
  }
  return undefined;
}

function _releaseReservation(state: ReaderState, bytes: number): void {
  state.reservedBytes -= bytes;
  state.capacityChanges.emit("change");
}

async function _reserveSegment(transfer: Readonly<Transfer>): Promise<number> {
  const { state, controller, start, end } = transfer;
  while (true) {
    controller.signal.throwIfAborted();
    const failure = _getBudgetFailureFromRead(state);
    if (failure !== undefined) {
      throw new Error(`processing_${failure}`);
    }
    const availableBytes =
      Math.min(state.byteLimit, state.phaseByteLimit ?? Infinity) -
      state.bytesRead -
      state.reservedBytes;
    if (availableBytes > 0) {
      const length = Math.min(SEGMENT_BYTES, end - start + 1, availableBytes);
      state.requests += 1;
      state.reservedBytes += length;
      return length;
    }
    // Another read owns the remaining allowance; cancellation may release it.
    await once(state.capacityChanges, "change", { signal: controller.signal });
  }
}

function _recordFailure(
  state: ReaderState,
  failure: MediaRangeReaderFailure | undefined,
): void {
  if (
    failure !== undefined &&
    (state.failure === undefined || !TERMINAL_FAILURES.has(state.failure))
  ) {
    state.failure = failure;
  }
}

async function _writeChunk(
  response: ServerResponse,
  chunk: Uint8Array,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (!response.write(chunk)) {
    await once(response, "drain", { signal });
  }
}

async function _copySegmentBody(
  upstream: Response,
  transfer: Readonly<Transfer>,
): Promise<void> {
  const { state, response, controller, start, end } = transfer;
  const body = upstream.body!.getReader();
  let receivedBytes = 0;
  try {
    while (true) {
      const { value, done } = await runWithReadIdleTimeout(() => {
        return body.read();
      }, controller);
      if (done) {
        break;
      }
      // Charge real payload before downstream writes, including a disconnected child.
      state.bytesRead += value.byteLength;
      _releaseReservation(state, value.byteLength);
      receivedBytes += value.byteLength;
      if (receivedBytes > end - start + 1) {
        throw new Error("processing_source_range_invalid");
      }
      await _writeChunk(response, value, controller.signal);
    }
    if (receivedBytes !== end - start + 1) {
      throw new Error("processing_source_truncated");
    }
  } catch (error) {
    if (!controller.signal.aborted && receivedBytes < end - start + 1) {
      throw new Error("processing_source_truncated");
    }
    throw error;
  } finally {
    await body.cancel().catch(() => {});
    _releaseReservation(state, end - start + 1 - receivedBytes);
  }
}

async function _transferSegment(transfer: Readonly<Transfer>): Promise<number> {
  const { state, controller, start } = transfer;
  const length = await _reserveSegment(transfer);
  const end = start + length - 1;
  const segment = { ...transfer, end };
  let isBodyMetered = false;
  try {
    const upstream = await runWithReadIdleTimeout(() => {
      return fetch(state.upstreamUrl, {
        headers: {
          Range: `bytes=${start}-${end}`,
          "Accept-Encoding": "identity",
          ...(state.etag === undefined ? {} : { "If-Match": state.etag }),
        },
        signal: controller.signal,
        redirect: "error",
      });
    }, controller);
    try {
      validateMediaRangeResponse(upstream, segment);
    } catch (error) {
      await upstream.body?.cancel();
      throw error;
    }
    isBodyMetered = true;
    await _copySegmentBody(upstream, segment);
    return end + 1;
  } finally {
    if (!isBodyMetered) {
      _releaseReservation(state, length);
    }
  }
}

async function _serveRange(transfer: Readonly<Transfer>): Promise<void> {
  const { state, response, start, end } = transfer;
  response.statusCode = response.req.headers.range === undefined ? 200 : 206;
  response.setHeader("content-type", "application/octet-stream");
  response.setHeader("content-length", end - start + 1);
  response.setHeader("accept-ranges", "bytes");
  if (response.statusCode === 206) {
    response.setHeader(
      "content-range",
      `bytes ${start}-${end}/${state.sourceBytes}`,
    );
  }
  try {
    let segmentStart = start;
    while (segmentStart <= end) {
      segmentStart = await _transferSegment({
        ...transfer,
        start: segmentStart,
      });
    }
    response.end();
  } catch (error) {
    _recordFailure(state, getRangeFailureFromError(error, transfer.controller));
    if (response.headersSent) {
      response.destroy();
    } else {
      response.removeHeader("content-length");
      response.removeHeader("content-range");
      response.writeHead(502).end("processing_source_unavailable");
    }
  } finally {
    transfer.controller.abort();
    state.active.delete(transfer.controller);
    state.capacityChanges.emit("settled");
  }
}

function _answerRequest(options: {
  request: IncomingMessage;
  response: ServerResponse;
  path: string;
  state: ReaderState;
}): void {
  const { request, response, path, state } = options;
  if (request.url !== path) {
    response.writeHead(404).end();
    return;
  }
  if (request.method === "HEAD") {
    response
      .writeHead(200, {
        "content-length": state.sourceBytes,
        "accept-ranges": "bytes",
      })
      .end();
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405).end();
    return;
  }
  const range = getRangeFromRequest(request, state.sourceBytes);
  if (range === undefined) {
    response
      .writeHead(416, { "content-range": `bytes */${state.sourceBytes}` })
      .end();
    return;
  }
  const failure =
    state.active.size >= 2
      ? "concurrent_read_limit"
      : _getBudgetFailureFromRead(state);
  if (failure !== undefined) {
    _recordFailure(state, failure);
    response.writeHead(429).end("processing_input_budget");
    return;
  }
  const controller = new AbortController();
  state.active.add(controller);
  response.once("close", () => {
    controller.abort();
  });
  void _serveRange({ state, response, controller, ...range });
}

function _validateLimit(limit: number | undefined): void {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) {
    throw new Error("processing_phase_limit_invalid");
  }
}

async function _awaitIdle(
  state: ReaderState,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  while (state.active.size > 0) {
    await once(state.capacityChanges, "settled", { signal });
  }
}

function _makeCloseFromReader(
  options: Readonly<{
    server: Server;
    signal: AbortSignal;
    state: ReaderState;
  }>,
): () => Promise<void> {
  const { server, signal, state } = options;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= new Promise<void>((resolve) => {
      signal.removeEventListener("abort", onAbort);
      for (const controller of state.active) {
        controller.abort();
      }
      server.closeAllConnections();
      server.close(() => {
        void _awaitIdle(state).then(resolve);
      });
    });
    return closing;
  };
  const onAbort = (): void => {
    void close();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return close;
}

function _makeReaderFromServer(options: {
  server: Server;
  signal: AbortSignal;
  state: ReaderState;
  path: string;
}): MediaRangeReader {
  const { server, signal, state, path } = options;
  const close = _makeCloseFromReader({ server, signal, state });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
    getBytesRead: () => {
      return state.bytesRead;
    },
    getFailure: () => {
      return state.failure;
    },
    close,
    awaitIdle: (waitSignal) => {
      return _awaitIdle(state, waitSignal);
    },
    setPhaseByteLimit: (limit) => {
      if (state.active.size > 0) {
        throw new Error("processing_reads_active");
      }
      _validateLimit(limit);
      state.phaseByteLimit = limit;
      if (state.failure === "phase_byte_limit") {
        state.failure = undefined;
      }
    },
  };
}

/** Serves one private object on loopback, with shared byte/request caps and backpressure. */
export async function createMediaRangeReader(
  options: Readonly<ReaderOptions>,
): Promise<MediaRangeReader> {
  const { b2, key, sourceBytes, signal, phaseByteLimit } = options;
  signal.throwIfAborted();
  _validateLimit(phaseByteLimit);
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0) {
    throw new Error("processing_source_size_invalid");
  }
  const state: ReaderState = {
    sourceBytes,
    upstreamUrl: await b2.presignGet({ key }),
    bytesRead: 0,
    reservedBytes: 0,
    requests: 0,
    byteLimit: Math.min(
      2 * sourceBytes + 16 * 1024 ** 2,
      16 * 1024 ** 3 + 16 * 1024 ** 2,
    ),
    phaseByteLimit,
    active: new Set(),
    capacityChanges: new EventEmitter(),
    etag: undefined,
    failure: undefined,
  };
  signal.throwIfAborted();
  const path = `/${randomUUID()}`;
  const server = createServer((request, response) => {
    _answerRequest({ request, response, path, state });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const reader = _makeReaderFromServer({ server, signal, state, path });
  if (signal.aborted) {
    await reader.close();
    signal.throwIfAborted();
  }
  return reader;
}
