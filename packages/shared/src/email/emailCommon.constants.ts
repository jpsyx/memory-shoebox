import { z } from "zod";
import { signedUrlSchema } from "../dtos.ts";
import { ianaTimezoneSchema } from "../settings.ts";

/**
 * The block on every payload, resolved at enqueue so that rendering is a pure
 * function of the payload (`apis/notifications.md` § Rules that hold for all
 * nine).
 *
 * Every instance setting the renderer reads travels here. Without that,
 * changing `shoebox.timezone` between enqueue and send would move a queued
 * batch's day, which is the same non-determinism the recipient snapshot exists
 * to avoid.
 */
export const emailCommonSchema = z.object({
  /** Trimmed: a whitespace name renders as an empty masthead and subject. */
  shoeboxName: z.string().trim().min(1),
  /** Absolute, from `public.base_url`. No message is renderable without it. */
  baseUrl: signedUrlSchema,
  /**
   * IANA zone from `shoebox.timezone`, frozen at enqueue. Validated with that
   * setting's own schema, so an unresolvable zone cannot reach the worker.
   */
  timezone: ianaTimezoneSchema,
  /** The recipient's own name, for the greeting. Null falls back to nothing. */
  toDisplayName: z.string().nullable(),
  /**
   * The signed preferences link, or null when the message has no switch.
   * enqueueEmail emits null for sign-in messages, and the layout omits it.
   */
  preferencesUrl: signedUrlSchema.nullable(),
}) satisfies z.ZodType;

/** The block on every payload. */
export type EmailCommon = z.infer<typeof emailCommonSchema>;
