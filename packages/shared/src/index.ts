import { z } from "zod";

/**
 * The API contract shared by the server and the web app.
 *
 * Each endpoint contributes a Zod schema plus the type inferred from it, so
 * there is a single source of truth for every payload crossing the wire. The
 * web app parses responses with the schema; the server annotates its handlers
 * with the type.
 *
 * Keep this package importable from both sides: the server runs TypeScript
 * directly through Node's type stripping, so anything it imports at runtime
 * must be plain, erasable TypeScript.
 */

/** Response body of `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  /** The server's package version, so a self-hoster can confirm what is live. */
  version: z.string(),
  /** Seconds since the server process started. */
  uptimeSeconds: z.number().int().nonnegative(),
});

/** Response body of `GET /api/health`. */
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Error body returned by every failing API route. */
export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

/** Error body returned by every failing API route. */
export type ApiError = z.infer<typeof apiErrorSchema>;
