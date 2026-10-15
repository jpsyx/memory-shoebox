import { type MediaRangeReaderFailure } from "./createMediaRangeReader.types.ts";

/** Internal module responsibility shared by the entry point. */
export const SEGMENT_BYTES = 8 * 1024 ** 2;

/** Internal module responsibility shared by the entry point. */
export const READ_IDLE_MS = 15_000;

/** Internal module responsibility shared by the entry point. */
export const MAX_REQUESTS = 1024;

/** Internal module responsibility shared by the entry point. */
export const FAILURE_CODES = [
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

/** Internal module responsibility shared by the entry point. */
export const TERMINAL_FAILURES = new Set<MediaRangeReaderFailure>([
  "input_byte_limit",
  "input_request_limit",
  "phase_byte_limit",
  "source_changed",
  "source_range_invalid",
]);
