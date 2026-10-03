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
   * Null for `sign_in_code`, which has no switch to offer.
   *
   * Not narrowed to `z.null()` on that kind's own schema. `EmailCommon` is
   * the block `enqueueEmail` resolves, and `EmailPayloadExtras` is each
   * kind's payload *minus* this block, so a narrowing here is composed
   * straight back out to `string | null` and can only be reconciled with a
   * cast. The rule lives in the one place that can enforce it:
   * `enqueueEmail.ts`'s `_preferencesUrl` returns null for `sign_in_code`,
   * and the layout omits the link when it is null.
   */
  preferencesUrl: signedUrlSchema.nullable(),
});

/** The block on every payload. */
export type EmailCommon = z.infer<typeof emailCommonSchema>;
