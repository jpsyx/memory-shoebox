import { createHash, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { fileURLToPath } from "node:url";
import type { BucketCorsRule } from "../../../apps/server/src/b2/client/client.ts";
import {
  makeBucketCorsRuleFromOrigins,
  VITE_DEV_ORIGIN,
} from "../../../apps/server/scripts/configureBucketCors.ts";
import {
  E2E_BASE_URL,
  E2E_FAKE_S3_PORT,
  E2E_SERVER_ENVIRONMENT,
} from "../e2eEnvironment.ts";

/**
 * A local stand-in for the bucket, so an end-to-end run needs no Backblaze key
 * and costs no storage (the step design's decision 13).
 *
 * **It answers the handful of S3 calls the upload flow makes and nothing
 * else**, path-style, because the B2 client already sets `forcePathStyle`:
 * a presigned PUT, the four multipart calls, `HEAD`, `GET`, `DELETE`, and the
 * CORS preflight. Anything else is a `501`, so a call the server starts making
 * fails loudly here rather than passing against a fake that guessed.
 *
 * **It checks no signature and reads no `X-Amz-*` parameter.** What it does
 * check is what Backblaze would refuse and a signature cannot see: a part list
 * out of order, an ETag that names no part, a part under 5 MiB that is not the
 * last, and a CORS request the bucket's rule does not allow. Each is a mistake
 * the browser engine could make that only a real bucket would otherwise catch.
 * Its **`501`** covers a query parameter the flow never sends, and a copy.
 *
 * **The CORS rule is the one `pnpm b2:cors` writes**, made by the same
 * function from the allowed origins rather than copied here, so the two
 * cannot drift apart.
 *
 * Everything lives in memory and dies with the process. Playwright starts it
 * as a `webServer` and stops it at the end of the run.
 */

/** The operations the stand-in tells apart. */
export type FakeS3Operation =
  | "Preflight"
  | "PutObject"
  | "CreateMultipartUpload"
  | "UploadPart"
  | "CompleteMultipartUpload"
  | "AbortMultipartUpload"
  | "HeadObject"
  | "GetObject"
  | "DeleteObject"
  | "Unsupported";

/**
 * One request the stand-in answered, as `GET /__fake-s3/requests` lists it.
 *
 * `null` rather than an absent field, because this is JSON on the wire.
 * `status` is the response's, written when the response finishes, so a
 * refused `CompleteMultipartUpload` reads differently from one that joined the
 * parts. It is `null` only for a request still being answered, or one whose
 * client went away before the answer was sent.
 */
export type FakeS3Request = {
  operation: FakeS3Operation;
  method: string;
  key: string;
  partNumber: number | null;
  uploadId: string | null;
  contentType: string | null;
  byteLength: number;
  origin: string | null;
  status: number | null;
};

/** The path prefix of the stand-in's own endpoints. No bucket name has `_`. */
export const FAKE_S3_CONTROL_PREFIX = "/__fake-s3/";

/**
 * The query parameters the upload flow's calls carry, besides the `X-Amz-*`
 * ones a presigned URL and the SDK add: the multipart calls' own, and the
 * SDK's `x-id`. Any other one names a feature the flow never uses
 * (`tagging`, `acl`, `versionId`, a listing), which is a `501`.
 */
const KNOWN_QUERY_PARAMETERS: readonly string[] = [
  "uploads",
  "uploadId",
  "partNumber",
  "x-id",
];

/** S3's floor for every part but the last. */
const MINIMUM_PART_BYTES = 5 * 1024 * 1024;

/** The namespace every S3 XML document carries. */
const S3_NAMESPACE = "http://s3.amazonaws.com/doc/2006-03-01/";

type StoredObject = {
  body: Buffer;
  contentType: string;
  etag: string;
  lastModified: string;
};

type StoredPart = { body: Buffer; etag: string };

type OpenUpload = {
  key: string;
  contentType: string;
  parts: Map<number, StoredPart>;
};

type FakeS3State = {
  bucketName: string;
  corsRule: BucketCorsRule;
  objects: Map<string, StoredObject>;
  uploads: Map<string, OpenUpload>;
  requests: FakeS3Request[];
};

/** One request, with everything a handler needs to answer it. */
type FakeS3Exchange = {
  request: IncomingMessage;
  response: ServerResponse;
  state: FakeS3State;
  key: string;
  query: URLSearchParams;
  body: Buffer;
};

/** One `<Part>` of a `CompleteMultipartUpload` body. */
type CompletedPart = { partNumber: number; etag: string };

/** Reads the whole request body. Every body here is small, or one part. */
function _readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolvePromise(Buffer.concat(chunks));
    });
    request.on("error", rejectPromise);
  });
}

/** Text safe inside an XML element. */
function _makeXmlTextFromPlainText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** The five named entities and numeric references, decoded. */
function _makePlainTextFromXmlText(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    const reference = String(name);
    if (reference.startsWith("#x") || reference.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(reference.slice(2), 16));
    }
    if (reference.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(reference.slice(1), 10));
    }
    return named[reference] ?? entity;
  });
}

/** An S3-style ETag: the MD5 of the bytes, quoted. */
function _makeEtagFromBytes(bytes: Buffer): string {
  return `"${createHash("md5").update(bytes).digest("hex")}"`;
}

/** A multipart ETag: the MD5 of the parts' binary MD5s, then `-<count>`. */
function _makeEtagFromParts(parts: readonly StoredPart[]): string {
  const digests = parts.map((part) => {
    return createHash("md5").update(part.body).digest();
  });
  const combined = createHash("md5").update(Buffer.concat(digests));
  return `"${combined.digest("hex")}-${parts.length}"`;
}

/** Whether two ETags name the same bytes, quoted or not. */
function _isSameEtag(first: string, second: string): boolean {
  return first.replace(/^"|"$/g, "") === second.replace(/^"|"$/g, "");
}

/** Every `<Part>` in the order the body lists them. */
function _getCompletedPartsFromXml(xml: string): CompletedPart[] {
  return Array.from(xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)).map((match) => {
    const partXml = match[1] ?? "";
    const partNumber = /<PartNumber>\s*(\d+)\s*<\/PartNumber>/.exec(partXml);
    const etag = /<ETag>([\s\S]*?)<\/ETag>/.exec(partXml);
    return {
      partNumber: Number(partNumber?.[1] ?? Number.NaN),
      etag: _makePlainTextFromXmlText(etag?.[1] ?? ""),
    };
  });
}

/**
 * The object key from a path-style URL: `""` for the bucket itself, and
 * undefined for a path naming some other bucket.
 */
function _getKeyFromPath(options: {
  pathname: string;
  bucketName: string;
}): string | undefined {
  const prefix = `/${options.bucketName}`;
  const isThisBucket =
    options.pathname === prefix || options.pathname.startsWith(`${prefix}/`);
  if (!isThisBucket) {
    return undefined;
  }
  return decodeURIComponent(options.pathname.slice(prefix.length + 1));
}

/** Whether every query parameter is one the upload flow's calls carry. */
function _hasOnlyKnownQueryParameters(query: URLSearchParams): boolean {
  return Array.from(query.keys()).every((name) => {
    return (
      KNOWN_QUERY_PARAMETERS.includes(name) ||
      name.toLowerCase().startsWith("x-amz-")
    );
  });
}

/**
 * Which S3 call this is, from the method and the query alone, as S3 does.
 *
 * A parameter the flow never sends, or an `x-amz-copy-source` header (a copy,
 * which the flow never makes), is `Unsupported` whatever the method.
 */
function _getOperationFromRequest(options: {
  method: string;
  query: URLSearchParams;
  headers: IncomingMessage["headers"];
}): FakeS3Operation {
  const { method, query, headers } = options;
  if (
    !_hasOnlyKnownQueryParameters(query) ||
    headers["x-amz-copy-source"] !== undefined
  ) {
    return "Unsupported";
  }
  const isMultipart = query.has("uploadId");
  const byMethod: Record<string, FakeS3Operation> = {
    OPTIONS: "Preflight",
    PUT: isMultipart && query.has("partNumber") ? "UploadPart" : "PutObject",
    POST: query.has("uploads")
      ? "CreateMultipartUpload"
      : isMultipart
        ? "CompleteMultipartUpload"
        : "Unsupported",
    DELETE: isMultipart ? "AbortMultipartUpload" : "DeleteObject",
    HEAD: "HeadObject",
    GET: "GetObject",
  };
  return byMethod[method] ?? "Unsupported";
}

/** Writes an XML document, declaration first, as S3 does. */
function _sendXml(options: {
  response: ServerResponse;
  status: number;
  xml: string;
}): void {
  options.response
    .writeHead(options.status, { "Content-Type": "application/xml" })
    .end(`<?xml version="1.0" encoding="UTF-8"?>${options.xml}`);
}

/** Writes S3's error document. */
function _sendS3Error(options: {
  response: ServerResponse;
  status: number;
  code: string;
  message: string;
}): void {
  _sendXml({
    response: options.response,
    status: options.status,
    xml:
      `<Error><Code>${options.code}</Code>` +
      `<Message>${_makeXmlTextFromPlainText(options.message)}</Message></Error>`,
  });
}

/**
 * The CORS headers every response carries for an allowed origin.
 *
 * `ETag` is exposed on every response rather than only on a PUT, because the
 * header decides whether the browser may read a part's ETag at all, and
 * without that multipart cannot complete.
 */
function _setCorsHeaders(exchange: FakeS3Exchange): void {
  const { request, response, state } = exchange;
  response.setHeader(
    "Access-Control-Expose-Headers",
    state.corsRule.exposeHeaders.join(", "),
  );
  const origin = request.headers.origin;
  if (origin !== undefined && state.corsRule.allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
}

/** Answers a preflight with what was asked for, or refuses it as S3 does. */
function _answerPreflight(exchange: FakeS3Exchange): void {
  const { request, response, state } = exchange;
  const origin = request.headers.origin ?? "";
  const method = String(request.headers["access-control-request-method"]);
  const headers = String(
    request.headers["access-control-request-headers"] ?? "",
  )
    .split(",")
    .map((header) => {
      return header.trim().toLowerCase();
    })
    .filter((header) => {
      return header !== "";
    });
  const { corsRule } = state;
  const allowedHeaders = corsRule.allowedHeaders.map((header) => {
    return header.toLowerCase();
  });
  const isAllowed =
    corsRule.allowedOrigins.includes(origin) &&
    corsRule.allowedMethods.includes(method) &&
    headers.every((header) => {
      return allowedHeaders.includes(header);
    });
  if (!isAllowed) {
    response.removeHeader("Access-Control-Allow-Origin");
    _sendS3Error({
      response,
      status: 403,
      code: "AccessForbidden",
      message: "CORSResponse: This CORS request is not allowed.",
    });
    return;
  }
  response.setHeader("Access-Control-Allow-Methods", method);
  if (headers.length > 0) {
    response.setHeader("Access-Control-Allow-Headers", headers.join(", "));
  }
  response.setHeader("Access-Control-Max-Age", String(corsRule.maxAgeSeconds));
  response.writeHead(200).end();
}

/** A single PUT, browser or server: stores the bytes and their type. */
function _answerPutObject(exchange: FakeS3Exchange): void {
  const { request, response, state, key, body } = exchange;
  const etag = _makeEtagFromBytes(body);
  state.objects.set(key, {
    body,
    contentType: request.headers["content-type"] ?? "binary/octet-stream",
    etag,
    lastModified: new Date().toUTCString(),
  });
  response.writeHead(200, { ETag: etag }).end();
}

/** `POST ?uploads`: opens an upload and names it. */
function _answerCreateMultipartUpload(exchange: FakeS3Exchange): void {
  const { request, response, state, key } = exchange;
  const uploadId = randomUUID();
  state.uploads.set(uploadId, {
    key,
    contentType: request.headers["content-type"] ?? "binary/octet-stream",
    parts: new Map(),
  });
  _sendXml({
    response,
    status: 200,
    xml:
      `<InitiateMultipartUploadResult xmlns="${S3_NAMESPACE}">` +
      `<Bucket>${_makeXmlTextFromPlainText(state.bucketName)}</Bucket>` +
      `<Key>${_makeXmlTextFromPlainText(key)}</Key>` +
      `<UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
  });
}

/** The open upload this request names, or undefined once it has said 404. */
function _getOpenUploadOr404(exchange: FakeS3Exchange): OpenUpload | undefined {
  const uploadId = exchange.query.get("uploadId") ?? "";
  const upload = exchange.state.uploads.get(uploadId);
  if (upload === undefined || upload.key !== exchange.key) {
    _sendS3Error({
      response: exchange.response,
      status: 404,
      code: "NoSuchUpload",
      message: "The specified multipart upload does not exist.",
    });
    return undefined;
  }
  return upload;
}

/** `PUT ?partNumber&uploadId`: stores one part and returns its ETag. */
function _answerUploadPart(exchange: FakeS3Exchange): void {
  const upload = _getOpenUploadOr404(exchange);
  if (upload === undefined) {
    return;
  }
  const partNumber = Number(exchange.query.get("partNumber"));
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    _sendS3Error({
      response: exchange.response,
      status: 400,
      code: "InvalidArgument",
      message: "Part number must be an integer between 1 and 10000.",
    });
    return;
  }
  const etag = _makeEtagFromBytes(exchange.body);
  upload.parts.set(partNumber, { body: exchange.body, etag });
  exchange.response.writeHead(200, { ETag: etag }).end();
}

/** What S3 would refuse about a completion, or undefined when nothing. */
function _getCompletionRefusal(options: {
  upload: OpenUpload;
  completed: readonly CompletedPart[];
}): { code: string; message: string } | undefined {
  const { upload, completed } = options;
  if (completed.length === 0) {
    return { code: "MalformedXML", message: "No parts were listed." };
  }
  const isAscending = completed.every((part, index) => {
    const previous = completed[index - 1];
    return previous === undefined || part.partNumber > previous.partNumber;
  });
  if (!isAscending) {
    return { code: "InvalidPartOrder", message: "Parts are not ascending." };
  }
  const unknownPart = completed.find((part) => {
    const stored = upload.parts.get(part.partNumber);
    return stored === undefined || !_isSameEtag(stored.etag, part.etag);
  });
  if (unknownPart !== undefined) {
    return {
      code: "InvalidPart",
      message: `Part ${unknownPart.partNumber} has no upload with ETag ${unknownPart.etag}.`,
    };
  }
  const smallPart = completed.slice(0, -1).find((part) => {
    const size = upload.parts.get(part.partNumber)?.body.length ?? 0;
    return size < MINIMUM_PART_BYTES;
  });
  return smallPart === undefined
    ? undefined
    : {
        code: "EntityTooSmall",
        message: `Part ${smallPart.partNumber} is under 5 MiB and is not the last.`,
      };
}

/** `POST ?uploadId`: joins the listed parts, in the body's order. */
function _answerCompleteMultipartUpload(exchange: FakeS3Exchange): void {
  const { response, state, key, body } = exchange;
  const upload = _getOpenUploadOr404(exchange);
  if (upload === undefined) {
    return;
  }
  const completed = _getCompletedPartsFromXml(body.toString("utf8"));
  const refusal = _getCompletionRefusal({ upload, completed });
  if (refusal !== undefined) {
    _sendS3Error({ response, status: 400, ...refusal });
    return;
  }
  const parts = completed.flatMap((part) => {
    const stored = upload.parts.get(part.partNumber);
    return stored === undefined ? [] : [stored];
  });
  const etag = _makeEtagFromParts(parts);
  const joined = Buffer.concat(
    parts.map((part) => {
      return part.body;
    }),
  );
  state.objects.set(key, {
    body: joined,
    contentType: upload.contentType,
    etag,
    lastModified: new Date().toUTCString(),
  });
  state.uploads.delete(exchange.query.get("uploadId") ?? "");
  _sendXml({
    response,
    status: 200,
    xml:
      `<CompleteMultipartUploadResult xmlns="${S3_NAMESPACE}">` +
      `<Bucket>${_makeXmlTextFromPlainText(state.bucketName)}</Bucket>` +
      `<Key>${_makeXmlTextFromPlainText(key)}</Key>` +
      `<ETag>${_makeXmlTextFromPlainText(etag)}</ETag>` +
      `</CompleteMultipartUploadResult>`,
  });
}

/** `DELETE ?uploadId`: drops the parts. An unknown upload is S3's 404. */
function _answerAbortMultipartUpload(exchange: FakeS3Exchange): void {
  const upload = _getOpenUploadOr404(exchange);
  if (upload === undefined) {
    return;
  }
  exchange.state.uploads.delete(exchange.query.get("uploadId") ?? "");
  exchange.response.writeHead(204).end();
}

/** The headers `HEAD` and `GET` share for a stored object. */
function _getHeadersFromStoredObject(
  stored: Readonly<StoredObject>,
): Record<string, string> {
  return {
    "Content-Type": stored.contentType,
    "Content-Length": String(stored.body.length),
    ETag: stored.etag,
    "Last-Modified": stored.lastModified,
  };
}

/** `HEAD`: size and type, or a bodiless 404, which the SDK reads as NotFound. */
function _answerHeadObject(exchange: FakeS3Exchange): void {
  const stored = exchange.state.objects.get(exchange.key);
  if (stored === undefined) {
    exchange.response.writeHead(404).end();
    return;
  }
  exchange.response.writeHead(200, _getHeadersFromStoredObject(stored)).end();
}

/** `GET`: the bytes with their type, or `NoSuchKey`. */
function _answerGetObject(exchange: FakeS3Exchange): void {
  const stored = exchange.state.objects.get(exchange.key);
  if (stored === undefined) {
    _sendS3Error({
      response: exchange.response,
      status: 404,
      code: "NoSuchKey",
      message: "The specified key does not exist.",
    });
    return;
  }
  exchange.response
    .writeHead(200, _getHeadersFromStoredObject(stored))
    .end(stored.body);
}

/** `DELETE`: S3 answers 204 whether or not the key existed. */
function _answerDeleteObject(exchange: FakeS3Exchange): void {
  exchange.state.objects.delete(exchange.key);
  exchange.response.writeHead(204).end();
}

/** Anything the upload flow does not make, including every bucket-level call. */
function _answerUnsupported(exchange: FakeS3Exchange): void {
  const { method, url } = exchange.request;
  _sendS3Error({
    response: exchange.response,
    status: 501,
    code: "NotImplemented",
    message: `The stand-in does not answer ${method} ${url}.`,
  });
}

/** One handler per operation. */
const HANDLERS: Record<FakeS3Operation, (exchange: FakeS3Exchange) => void> = {
  Preflight: _answerPreflight,
  PutObject: _answerPutObject,
  CreateMultipartUpload: _answerCreateMultipartUpload,
  UploadPart: _answerUploadPart,
  CompleteMultipartUpload: _answerCompleteMultipartUpload,
  AbortMultipartUpload: _answerAbortMultipartUpload,
  HeadObject: _answerHeadObject,
  GetObject: _answerGetObject,
  DeleteObject: _answerDeleteObject,
  Unsupported: _answerUnsupported,
};

/** The stand-in's own endpoints: a health check and the request log. */
function _answerControlRequest(options: {
  pathname: string;
  response: ServerResponse;
  state: FakeS3State;
}): void {
  const { pathname, response, state } = options;
  const bodyByPath: Record<string, unknown> = {
    [`${FAKE_S3_CONTROL_PREFIX}health`]: { status: "ok" },
    [`${FAKE_S3_CONTROL_PREFIX}requests`]: { requests: state.requests },
  };
  const body = bodyByPath[pathname];
  response
    .writeHead(body === undefined ? 404 : 200, {
      "Content-Type": "application/json",
    })
    .end(JSON.stringify(body ?? { error: "not_found" }));
}

/** One line of the request log. */
function _makeLoggedRequestFromExchange(options: {
  exchange: Readonly<FakeS3Exchange>;
  operation: FakeS3Operation;
  pathname: string;
}): FakeS3Request {
  const { request, query, key, body } = options.exchange;
  const partNumber = query.get("partNumber");
  return {
    operation: options.operation,
    method: request.method ?? "GET",
    key: key === "" ? options.pathname : key,
    partNumber: partNumber === null ? null : Number(partNumber),
    uploadId: query.get("uploadId"),
    contentType: request.headers["content-type"] ?? null,
    byteLength: body.length,
    origin: request.headers.origin ?? null,
    status: null,
  };
}

/** Records the request, sets CORS, and hands it to its operation. */
async function _answerRequest(options: {
  request: IncomingMessage;
  response: ServerResponse;
  state: FakeS3State;
}): Promise<void> {
  const { request, response, state } = options;
  const url = new URL(request.url ?? "/", "http://fake-s3.invalid");
  if (url.pathname.startsWith(FAKE_S3_CONTROL_PREFIX)) {
    _answerControlRequest({ pathname: url.pathname, response, state });
    return;
  }
  const key = _getKeyFromPath({
    pathname: url.pathname,
    bucketName: state.bucketName,
  });
  const query = url.searchParams;
  const body = await _readRequestBody(request);
  const exchange = { request, response, state, key: key ?? "", query, body };
  // A bucket-level call, a listing or a CORS read, is nothing the flow makes.
  const operation =
    key === undefined || key === ""
      ? "Unsupported"
      : _getOperationFromRequest({
          method: request.method ?? "GET",
          query,
          headers: request.headers,
        });
  const logged = _makeLoggedRequestFromExchange({
    exchange,
    operation,
    pathname: url.pathname,
  });
  state.requests.push(logged);
  response.once("finish", () => {
    logged.status = response.statusCode;
  });
  _setCorsHeaders(exchange);
  if (key === undefined) {
    _sendS3Error({
      response,
      status: 404,
      code: "NoSuchBucket",
      message: "The specified bucket does not exist.",
    });
    return;
  }
  HANDLERS[operation](exchange);
}

/**
 * Makes the stand-in. It does not listen: the caller picks the port, which is
 * `E2E_FAKE_S3_PORT` for the run and an ephemeral one for its own tests.
 *
 * @param options.bucketName The one bucket it holds.
 * @param options.allowedOrigins The page origins its CORS rule allows.
 * @returns An unstarted `node:http` server.
 */
export function createFakeS3Server(options: {
  bucketName: string;
  allowedOrigins: readonly string[];
}): Server {
  const state: FakeS3State = {
    bucketName: options.bucketName,
    corsRule: makeBucketCorsRuleFromOrigins(options.allowedOrigins),
    objects: new Map(),
    uploads: new Map(),
    requests: [],
  };
  return createServer((request, response) => {
    _answerRequest({ request, response, state }).catch((error: unknown) => {
      process.stderr.write(`fake S3: ${String(error)}\n`);
      _sendS3Error({
        response,
        status: 500,
        code: "InternalError",
        message: String(error),
      });
    });
  });
}

// Only when Node was pointed at this file, which is how Playwright's
// `webServer` runs it. Its tests import it and must not start a second one.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createFakeS3Server({
    bucketName: E2E_SERVER_ENVIRONMENT.B2_BUCKET,
    allowedOrigins: [E2E_BASE_URL, VITE_DEV_ORIGIN],
  }).listen(E2E_FAKE_S3_PORT, "127.0.0.1", () => {
    process.stdout.write(`fake S3 on 127.0.0.1:${E2E_FAKE_S3_PORT}\n`);
  });
}
