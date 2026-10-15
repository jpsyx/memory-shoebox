import { type IncomingMessage } from "node:http";

import {
  type MediaRangeReaderFailure,
  type Transfer,
} from "./createMediaRangeReader.types.ts";

import {
  FAILURE_CODES,
  READ_IDLE_MS,
} from "./createMediaRangeReader.constants.ts";

/** Internal module responsibility shared by the entry point. */
export function getRangeFailureFromError(
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

/** Internal module responsibility shared by the entry point. */
export function getRangeFromRequest(
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

/** Internal module responsibility shared by the entry point. */
export async function runWithReadIdleTimeout<Result>(
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

/** Internal module responsibility shared by the entry point. */
export function validateMediaRangeResponse(
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
