import { z } from "zod";
import { timestampSchema } from "./dtos.ts";

/** Stable SemVer used by the product's automatic release workflow. */
export const releaseVersionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);

/** An update check never represents a failed lookup as an up-to-date install. */
export const releaseStatusResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.enum(["up_to_date", "update_available"]),
    latestVersion: releaseVersionSchema,
    checkedAt: timestampSchema,
  }),
  z.object({
    status: z.literal("unavailable"),
    latestVersion: z.null(),
    checkedAt: z.null(),
  }),
]);

/** Public release metadata available through the admin-only version check. */
export type ReleaseStatusResponse = z.infer<typeof releaseStatusResponseSchema>;
