import type { FastifyRequest } from "fastify";
import { ApiError } from "../http/ApiError.ts";

function _isSameServingOrigin(
  options: Readonly<{
    request: Readonly<FastifyRequest>;
    origin: string;
  }>,
): boolean {
  try {
    const supplied = new URL(options.origin);
    const serving = new URL(
      `${options.request.protocol}://${options.request.host}`,
    );
    return (
      (supplied.protocol === "http:" || supplied.protocol === "https:") &&
      supplied.origin === options.origin &&
      supplied.origin === serving.origin
    );
  } catch {
    return false;
  }
}

/**
 * Requires JSON and compares browser Origin to Fastify's trusted serving
 * origin.
 */
export function requireSetupServingOrigin(
  request: Readonly<FastifyRequest>,
): void {
  const contentType = request.headers["content-type"]
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw ApiError.invalidRequest({
      "content-type": ["Setup requires application/json."],
    });
  }
  const origin = request.headers.origin;
  if (origin === undefined) {
    return;
  }
  if (!_isSameServingOrigin({ request, origin })) {
    throw ApiError.invalidRequest({
      origin: ["Origin must match the serving origin."],
    });
  }
}
