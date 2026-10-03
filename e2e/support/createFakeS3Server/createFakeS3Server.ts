import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { fileURLToPath } from "node:url";

import { makeBucketCorsRuleFromOrigins } from "../../../apps/server/scripts/configureBucketCors/makeBucketCorsRuleFromOrigins.ts";
import { VITE_DEV_ORIGIN } from "../../../apps/server/scripts/configureBucketCors/printConsoleFallback/printConsoleFallback.constants.ts";

import {
  E2E_BASE_URL,
  E2E_FAKE_S3_PORT,
  E2E_SERVER_ENVIRONMENT,
} from "../e2eEnvironment.constants.ts";

import type {
  FakeS3Operation,
  FakeS3Exchange,
  FakeS3State,
  FakeS3Request,
} from "./createFakeS3Server.types.ts";

import {
  answerFakeS3Preflight,
  setFakeS3CorsHeaders,
} from "./fakeS3CorsHelpers.ts";

import {
  answerFakeS3PutObject,
  answerFakeS3HeadObject,
  answerFakeS3GetObject,
  answerUnsupportedFakeS3Request,
} from "./fakeS3ObjectHandlersHelpers.ts";

import {
  answerFakeS3CreateMultipartUpload,
  answerFakeS3UploadPart,
  answerFakeS3CompleteMultipartUpload,
  answerFakeS3AbortMultipartUpload,
} from "./fakeS3MultipartHandlersHelpers.ts";

import {
  getKeyFromPath,
  getBodyFromRequest,
  getOperationFromRequest,
} from "./fakeS3RequestHelpers.ts";

import { sendFakeS3Error } from "./fakeS3ProtocolHelpers.ts";

/** The path prefix of the stand-in's own endpoints. No bucket name has `_`. */
export const FAKE_S3_CONTROL_PREFIX = "/__fake-s3/";

/** One handler per operation. */
const HANDLERS: Record<FakeS3Operation, (exchange: FakeS3Exchange) => void> = {
  Preflight: answerFakeS3Preflight,
  PutObject: answerFakeS3PutObject,
  CreateMultipartUpload: answerFakeS3CreateMultipartUpload,
  UploadPart: answerFakeS3UploadPart,
  CompleteMultipartUpload: answerFakeS3CompleteMultipartUpload,
  AbortMultipartUpload: answerFakeS3AbortMultipartUpload,
  HeadObject: answerFakeS3HeadObject,
  GetObject: answerFakeS3GetObject,
  DeleteObject: (exchange: FakeS3Exchange): void => {
    exchange.state.objects.delete(exchange.key);
    exchange.response.writeHead(204).end();
  },
  Unsupported: answerUnsupportedFakeS3Request,
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
  const key = getKeyFromPath({
    pathname: url.pathname,
    bucketName: state.bucketName,
  });
  const query = url.searchParams;
  const body = await getBodyFromRequest(request);
  const exchange = { request, response, state, key: key ?? "", query, body };
  const operation = _registerFakeS3Exchange({
    exchange,
    pathname: url.pathname,
    hasBucketKey: key !== undefined,
  });
  if (key === undefined) {
    sendFakeS3Error({
      response,
      status: 404,
      code: "NoSuchBucket",
      message: "The specified bucket does not exist.",
    });
    return;
  }
  HANDLERS[operation](exchange);
}

/** Records one exchange and applies the bucket CORS response headers. */
function _registerFakeS3Exchange(
  options: Readonly<{
    exchange: FakeS3Exchange;
    pathname: string;
    hasBucketKey: boolean;
  }>,
): FakeS3Operation {
  const { exchange, pathname } = options;
  const { request, response, state, key, query } = exchange;
  const operation =
    !options.hasBucketKey || key === ""
      ? "Unsupported"
      : getOperationFromRequest({
          method: request.method ?? "GET",
          query,
          headers: request.headers,
        });
  const logged = _makeLoggedRequestFromExchange({
    exchange,
    operation,
    pathname,
  });
  state.requests.push(logged);
  response.once("finish", () => {
    logged.status = response.statusCode;
  });
  setFakeS3CorsHeaders(exchange);
  return operation;
}

/**
 * Makes the stand-in. It does not listen: the caller picks the port, which is
 * `E2E_FAKE_S3_PORT` for the run and an ephemeral one for its own tests.
 *
 * @param options.bucketName The one bucket it holds.
 * @param options.allowedOrigins The page origins its CORS rule allows.
 * @returns An unstarted `node:http` server.
 */
export function createFakeS3Server(
  options: Readonly<{
    bucketName: string;
    allowedOrigins: readonly string[];
  }>,
): Server {
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
      sendFakeS3Error({
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
