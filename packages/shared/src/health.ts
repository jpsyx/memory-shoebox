import { z } from "zod";

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
