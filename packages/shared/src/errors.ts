import { z } from "zod";

/**
 * Structured detail on a failure, for the three cases that need more than a
 * code. `message` is English and is never the primary UI copy, so anything the
 * interface has to render as a number or a field name belongs here instead.
 */
export const apiErrorDetailsSchema = z.object({
  /** Per-field validation failures, keyed by field name. */
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  /** Seconds until a rate-limited caller may retry. */
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  /** Sign-in attempts left before the code is replaced. */
  attemptsRemaining: z.number().int().nonnegative().optional(),
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
