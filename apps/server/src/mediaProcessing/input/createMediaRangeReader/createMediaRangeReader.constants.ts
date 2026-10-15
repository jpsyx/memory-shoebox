import { type MediaRangeReaderFailure } from "./createMediaRangeReader.types.ts";

/** Maximum upstream body segment requested by one metered range transfer. */
export const SEGMENT_BYTES = 8 * 1024 ** 2;

/** Maximum idle duration for one upstream read before its controller is aborted. */
export const READ_IDLE_MS = 15_000;

/** Aggregate upstream request ceiling across all phases, including repeated reads. */
export const MAX_REQUESTS = 1024;

/** Sanitized failure vocabulary exposed to the processing lifecycle instead of provider errors. */
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

/** Budget and source-contract failures that take precedence over later transient errors. */
export const TERMINAL_FAILURES = new Set<MediaRangeReaderFailure>([
  "input_byte_limit",
  "input_request_limit",
  "phase_byte_limit",
  "source_changed",
  "source_range_invalid",
]);
