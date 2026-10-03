import type { FakeS3Exchange } from "./createFakeS3Server.types.ts";

import { sendFakeS3Error } from "./fakeS3ProtocolHelpers.ts";

/**
 * The CORS headers every response carries for an allowed origin.
 *
 * `ETag` is exposed on every response rather than only on a PUT, because the
 * header decides whether the browser may read a part's ETag at all, and
 * without that multipart cannot complete.
 */
export function setFakeS3CorsHeaders(exchange: FakeS3Exchange): void {
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
export function answerFakeS3Preflight(exchange: FakeS3Exchange): void {
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
    sendFakeS3Error({
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
