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
    lastModified: new Date().toUTCString(),
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
    "Content-Type": stored.contentType,
    "Content-Length": String(stored.body.length),
    ETag: stored.etag,
    "Last-Modified": stored.lastModified,
    ...Object.fromEntries(overrides),
  };
}

/**
 * `HEAD`: size and type, or a bodiless 404, which the SDK reads as NotFound.
 */
export function answerFakeS3HeadObject(exchange: FakeS3Exchange): void {
  const stored = exchange.state.objects.get(exchange.key);
  if (stored === undefined) {
    exchange.response.writeHead(404).end();
    return;
  }
  exchange.response
    .writeHead(
      200,
      _getHeadersFromStoredObject({ stored, query: exchange.query }),
    )
    .end();
}

/** `GET`: the bytes with their type, or `NoSuchKey`. */
export function answerFakeS3GetObject(exchange: FakeS3Exchange): void {
  const stored = exchange.state.objects.get(exchange.key);
  if (stored === undefined) {
    sendFakeS3Error({
      response: exchange.response,
      status: 404,
      code: "NoSuchKey",
      message: "The specified key does not exist.",
    });
    return;
  }
  exchange.response
    .writeHead(
      200,
      _getHeadersFromStoredObject({ stored, query: exchange.query }),
    )
    .end(stored.body);
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
