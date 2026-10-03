import { z } from "zod";

/**
 * Structured detail on a failure, for the cases that need more than a code.
 * `message` is English and is never the primary UI copy, so anything the
 * interface has to render as a number, a field name or an id belongs here
 * instead.
 *
 * The last four are the upload slice's (`upload.md`, design decision 11), and
 * every one is optional, so no existing response changes.
 */
export const apiErrorDetailsSchema = z.object({
  /** Per-field validation failures, keyed by field name. */
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  /** Seconds until a rate-limited caller may retry. */
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  /** Sign-in attempts left before the code is replaced. */
  attemptsRemaining: z.number().int().nonnegative().optional(),
  /**
   * The batch already in flight, on `409 upload_session_conflict`, so the
   * client opens it instead of starting a second one.
   */
  sessionId: z.string().optional(),
  /**
   * The row that already holds these bytes, on the hash collision, so the
   * client skips the file the server already has.
   */
  fileId: z.string().optional(),
  /** The row's state, on `409 upload_file_conflict`. */
  state: z.string().optional(),
  /** The picked files refused, on `409 upload_manifest_conflict`. */
  clientRefs: z.array(z.string()).optional(),
});

/** Structured detail on a failure. */
export type ApiErrorDetails = z.infer<typeof apiErrorDetailsSchema>;

/**
 * Error body returned by every failing API route.
 *
 * `error` is a stable snake_case code and is what the client branches on.
 * `message` is English, for a log or a fallback, never for the interface.
 */
export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: apiErrorDetailsSchema.optional(),
});

/** Error body returned by every failing API route. */
export type ApiError = z.infer<typeof apiErrorSchema>;
