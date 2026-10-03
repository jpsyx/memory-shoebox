import { type IncomingMessage } from "node:http";

import { RESPONSE_HEADER_BY_PARAMETER } from "./createFakeS3Server.constants.ts";

import type { FakeS3Operation } from "./createFakeS3Server.types.ts";

/** Reads the whole request body. Every body here is small, or one part. */
export function getBodyFromRequest(request: IncomingMessage): Promise<Buffer> {
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

/**
 * The object key from a path-style URL: `""` for the bucket itself, and
 * undefined for a path naming some other bucket.
 */
export function getKeyFromPath(
  options: Readonly<{
    pathname: string;
    bucketName: string;
  }>,
): string | undefined {
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
      (
        [
          "uploads",
          "uploadId",
          "partNumber",
          "x-id",
        ] as const satisfies readonly string[]
      ).some((knownName) => {
        return knownName === name;
      }) ||
      name in RESPONSE_HEADER_BY_PARAMETER ||
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
export function getOperationFromRequest(
  options: Readonly<{
    method: string;
    query: URLSearchParams;
    headers: IncomingMessage["headers"];
  }>,
): FakeS3Operation {
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
