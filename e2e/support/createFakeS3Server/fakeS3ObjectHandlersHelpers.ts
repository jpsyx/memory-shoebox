import type {
  FakeS3Exchange,
  StoredObject,
} from "./createFakeS3Server.types.ts";

import { makeEtagFromBytes, sendFakeS3Error } from "./fakeS3ProtocolHelpers.ts";

import { RESPONSE_HEADER_BY_PARAMETER } from "./createFakeS3Server.constants.ts";

/** A single PUT, browser or server: stores the bytes and their type. */
export function answerFakeS3PutObject(exchange: FakeS3Exchange): void {
  const { request, response, state, key, body } = exchange;
  const etag = makeEtagFromBytes(body);
  state.objects.set(key, {
    body,
    contentType: request.headers["content-type"] ?? "binary/octet-stream",
    etag,
    lastModified: state.clock().toUTCString(),
  });
  response.writeHead(200, { ETag: etag }).end();
}

/**
 * The headers `HEAD` and `GET` share for a stored object, with any response
 * header the signed URL overrides.
 */
function _getHeadersFromStoredObject(options: {
  stored: Readonly<StoredObject>;
  query: URLSearchParams;
}): Record<string, string> {
  const { stored, query } = options;
  const overrides = Object.entries(RESPONSE_HEADER_BY_PARAMETER).flatMap(
    ([parameter, header]) => {
      const value = query.get(parameter);
      return value === null ? [] : [[header, value] as const];
    },
  );
  return {
    "Accept-Ranges": "bytes",
    "Content-Type": stored.contentType,
    "Content-Length": String(stored.body.length),
    ETag: stored.etag,
    "Last-Modified": stored.lastModified,
    ...Object.fromEntries(overrides),
  };
}

/** Refuse missing, malformed, future or expired signature dates when enabled. */
function _isSignatureCurrent(exchange: Readonly<FakeS3Exchange>): boolean {
  if (!exchange.state.enforceSignatureExpiry) {
    return true;
  }
  const stamp = exchange.query.get("X-Amz-Date") ?? "";
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  const expiry = Number(exchange.query.get("X-Amz-Expires"));
  const signedAt =
    match === null
      ? Number.NaN
      : Date.parse(
          `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`,
        );
  const now = exchange.state.clock().getTime();
  return (
    Number.isFinite(signedAt) &&
    new Date(signedAt)
      .toISOString()
      .replaceAll(/[-:]/g, "")
      .replace(".000", "") === stamp &&
    Number.isInteger(expiry) &&
    expiry > 0 &&
    expiry <= 604800 &&
    signedAt <= now &&
    now < signedAt + expiry * 1000
  );
}

/** The stored object after date enforcement, or the already-sent refusal. */
function _getStoredObjectOrRefusal(
  exchange: FakeS3Exchange,
): StoredObject | undefined {
  if (!_isSignatureCurrent(exchange)) {
    sendFakeS3Error({
      response: exchange.response,
      status: 403,
      code: "AccessDenied",
      message: "The presigned request date or expiry is invalid.",
    });
    return undefined;
  }
  const stored = exchange.state.objects.get(exchange.key);
  if (stored === undefined) {
    sendFakeS3Error({
      response: exchange.response,
      status: 404,
      code: "NoSuchKey",
      message: "The specified key does not exist.",
    });
  }
  return stored;
}

/** Whether a GET/HEAD validator identifies the current representation. */
function _isNotModified(options: {
  exchange: Readonly<FakeS3Exchange>;
  stored: Readonly<StoredObject>;
}): boolean {
  const { exchange, stored } = options;
  const etags = exchange.request.headers["if-none-match"];
  if (etags !== undefined) {
    return etags.split(",").some((etag) => {
      return (
        etag.trim() === "*" || etag.trim().replace(/^W\//, "") === stored.etag
      );
    });
  }
  const since = exchange.request.headers["if-modified-since"];
  return (
    since !== undefined && Date.parse(since) >= Date.parse(stored.lastModified)
  );
}

/** Convert one byte range into inclusive offsets, or flag it unsatisfiable. */
function _getOffsetsFromRange(options: {
  range: string;
  size: number;
}): { start: number; end: number } | undefined {
  const { range, size } = options;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (match === null || size === 0 || (match[1] === "" && match[2] === "")) {
    return undefined;
  }
  const isSuffix = match[1] === "";
  const start = isSuffix
    ? Math.max(0, size - Number(match[2]))
    : Number(match[1]);
  const end =
    isSuffix || match[2] === ""
      ? size - 1
      : Math.min(size - 1, Number(match[2]));
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start < size &&
    end >= start
    ? { start, end }
    : undefined;
}

/** A range is usable only against a matching strong ETag or current date. */
function _canUseRange(options: {
  exchange: Readonly<FakeS3Exchange>;
  stored: Readonly<StoredObject>;
}): boolean {
  const validator = options.exchange.request.headers["if-range"];
  return (
    validator === undefined ||
    validator === options.stored.etag ||
    (typeof validator === "string" &&
      Date.parse(validator) >= Date.parse(options.stored.lastModified))
  );
}

/** Stream local throttled chunks; count only payloads handed to the socket. */
function _sendObjectBody(options: {
  exchange: FakeS3Exchange;
  body: Buffer;
}): void {
  const {
    exchange: { response, state },
    body,
  } = options;
  const chunkSize =
    state.bytesPerSecond === undefined
      ? body.length || 1
      : Math.max(1, Math.floor(state.bytesPerSecond / 20));
  let offset = 0;
  let timer: ReturnType<typeof setTimeout>;
  const sendChunk = (): void => {
    if (response.destroyed) {
      return;
    }
    const chunk = body.subarray(offset, offset + chunkSize);
    offset += chunk.length;
    if (offset >= body.length) {
      response.end(chunk);
      return;
    }
    response.write(chunk);
    timer = setTimeout(sendChunk, 50);
  };
  timer = setTimeout(sendChunk, state.latencyMs);
  response.once("close", () => {
    clearTimeout(timer);
  });
}

/** Send a bodiless conditional response with the same cache policy. */
function _answerNotModified(options: {
  exchange: FakeS3Exchange;
  headers: Record<string, string>;
}): void {
  const headers = { ...options.headers };
  delete headers["Content-Length"];
  options.exchange.response.writeHead(304, headers).end();
}

/** HEAD: validators and complete size, without range or payload bytes. */
export function answerFakeS3HeadObject(exchange: FakeS3Exchange): void {
  const stored = _getStoredObjectOrRefusal(exchange);
  if (stored === undefined) {
    return;
  }
  const headers = _getHeadersFromStoredObject({
    stored,
    query: exchange.query,
  });
  if (_isNotModified({ exchange, stored })) {
    _answerNotModified({ exchange, headers });
    return;
  }
  exchange.response.writeHead(200, headers).end();
}

/** GET: conditional validation precedes bounded byte-range delivery. */
export function answerFakeS3GetObject(exchange: FakeS3Exchange): void {
  const stored = _getStoredObjectOrRefusal(exchange);
  if (stored === undefined) {
    return;
  }
  const headers = _getHeadersFromStoredObject({
    stored,
    query: exchange.query,
  });
  if (_isNotModified({ exchange, stored })) {
    _answerNotModified({ exchange, headers });
    return;
  }
  const range = exchange.request.headers.range;
  if (range === undefined || !_canUseRange({ exchange, stored })) {
    exchange.response.writeHead(200, headers);
    _sendObjectBody({ exchange, body: stored.body });
    return;
  }
  const offsets = _getOffsetsFromRange({ range, size: stored.body.length });
  if (offsets === undefined) {
    exchange.response
      .writeHead(416, {
        ...headers,
        "Content-Length": "0",
        "Content-Range": `bytes */${stored.body.length}`,
      })
      .end();
    return;
  }
  const body = stored.body.subarray(offsets.start, offsets.end + 1);
  exchange.response.writeHead(206, {
    ...headers,
    "Content-Length": String(body.length),
    "Content-Range": `bytes ${offsets.start}-${offsets.end}/${stored.body.length}`,
  });
  _sendObjectBody({ exchange, body });
}

/**
 * Anything the upload flow does not make, including every bucket-level call.
 */
export function answerUnsupportedFakeS3Request(exchange: FakeS3Exchange): void {
  const { method, url } = exchange.request;
  sendFakeS3Error({
    response: exchange.response,
    status: 501,
    code: "NotImplemented",
    message: `The stand-in does not answer ${method} ${url}.`,
  });
}
