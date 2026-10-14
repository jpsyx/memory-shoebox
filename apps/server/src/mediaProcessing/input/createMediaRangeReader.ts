import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";

const SEGMENT_BYTES = 8 * 1024 ** 2;
const READ_IDLE_MS = 15_000;
const MAX_REQUESTS = 1024;
const FAILURE_CODES = [
  "input_byte_limit",
  "input_request_limit",
  "phase_byte_limit",
  "source_changed",
  "source_range_invalid",
  "source_truncated",
  "upstream_timeout",
  "upstream_unavailable",
  "concurrent_read_limit",
] as const;
const TERMINAL_FAILURES = new Set<MediaRangeReaderFailure>([
  "input_byte_limit",
  "input_request_limit",
  "phase_byte_limit",
  "source_changed",
  "source_range_invalid",
]);

/** Sanitized transfer diagnostics; retry policy belongs to the worker. */
export type MediaRangeReaderFailure = (typeof FAILURE_CODES)[number];

/** One object and its aggregate job budget, optionally beginning in probe mode. */
type ReaderOptions = {
  b2: B2Client;
  key: string;
  sourceBytes: number;
  signal: AbortSignal;
  phaseByteLimit?: number;
};

/** A credential-free child URL backed by one persistent per-job meter. */
export type MediaRangeReader = {
  url: string;
  getBytesRead: () => number;
  /** Terminal failures take precedence over later transient failures. */
  getFailure: () => MediaRangeReaderFailure | undefined;
  /** Requires idle readers; a new phase cannot reset aggregate accounting. */
  setPhaseByteLimit: (limit: number | undefined) => void;
  close: () => Promise<void>;
};

type ReaderState = {
  sourceBytes: number;
  upstreamUrl: string;
  bytesRead: number;
  reservedBytes: number;
  requests: number;
  byteLimit: number;
  phaseByteLimit: number | undefined;
  active: Set<AbortController>;
  capacityChanges: EventEmitter;
  etag: string | undefined;
  failure: MediaRangeReaderFailure | undefined;
};

type Transfer = {
  state: ReaderState;
  response: ServerResponse;
  controller: AbortController;
  start: number;
  end: number;
};

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

function _getFailureFromError(
  error: unknown,
  controller: AbortController,
): MediaRangeReaderFailure | undefined {
  if (controller.signal.aborted) {
    return controller.signal.reason instanceof Error &&
      controller.signal.reason.message === "processing_upstream_timeout"
      ? "upstream_timeout"
      : undefined;
  }
  return (
    FAILURE_CODES.find((code) => {
      return error instanceof Error && error.message === `processing_${code}`;
    }) ?? "upstream_unavailable"
  );
}

function _getRangeFromRequest(
  request: IncomingMessage,
  sourceBytes: number,
): { start: number; end: number } | undefined {
  if (request.headers.range === undefined) {
    return { start: 0, end: sourceBytes - 1 };
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
  if (match === null || (match[1] === "" && match[2] === "")) {
    return undefined;
  }
  const start =
    match[1] === ""
      ? Math.max(0, sourceBytes - Number(match[2]))
      : Number(match[1]);
  const end =
    match[1] === "" || match[2] === ""
      ? sourceBytes - 1
      : Math.min(Number(match[2]), sourceBytes - 1);
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end >= start &&
    start < sourceBytes
    ? { start, end }
    : undefined;
}

async function _withIdleTimeout<Result>(
  operation: () => Promise<Result>,
  controller: AbortController,
): Promise<Result> {
  const timeout = setTimeout(() => {
    controller.abort(new Error("processing_upstream_timeout"));
  }, READ_IDLE_MS);
  try {
    return await operation();
  } finally {
    clearTimeout(timeout);
  }
}

function _validateResponse(
  response: Response,
  transfer: Readonly<Transfer>,
): void {
  const { state, start, end } = transfer;
  if ([408, 429].includes(response.status) || response.status >= 500) {
    throw new Error("processing_upstream_unavailable");
  }
  const expected = `bytes ${start}-${end}/${state.sourceBytes}`;
  const encoding = response.headers.get("content-encoding");
  const total = /^bytes \d+-\d+\/(\d+)$/.exec(
    response.headers.get("content-range") ?? "",
  )?.[1];
  if (total !== undefined && Number(total) !== state.sourceBytes) {
    throw new Error("processing_source_changed");
  }
  if (
    response.status !== 206 ||
    response.headers.get("content-range") !== expected ||
    response.headers.get("content-length") !== String(end - start + 1) ||
    (encoding !== null && encoding !== "identity") ||
    response.body === null
  ) {
    throw new Error("processing_source_range_invalid");
  }
  const etag = response.headers.get("etag") ?? undefined;
  if (state.etag !== undefined && state.etag !== etag) {
    throw new Error("processing_source_changed");
  }
  state.etag = etag;
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
      const { value, done } = await _withIdleTimeout(() => {
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
    const upstream = await _withIdleTimeout(() => {
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
      _validateResponse(upstream, segment);
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
    _recordFailure(state, _getFailureFromError(error, transfer.controller));
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
  const range = _getRangeFromRequest(request, state.sourceBytes);
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
        resolve();
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
