import { z } from "zod";
import { signedUrlSchema, timestampSchema } from "./dtos.ts";

/**
 * The seven kinds the product sends.
 *
 * A reaction is deliberately not one of them and must not become one
 * (`apis/notifications.md` § Rules that hold for all nine): it is one tap,
 * meant to cost the person leaving it nothing, which it stops doing the
 * moment it costs somebody else an email.
 *
 * The order matches the `CHECK` constraint in migration
 * `0007_operations_and_audit.ts`, so the two can be read side by side.
 */
export const OUTBOUND_EMAIL_KINDS = [
  "sign_in_code",
  "invitation",
  "upload_session",
  "comment",
  "removal_request",
  "removal_reminder",
  "removal_resolved",
] as const;

/** One of the seven kinds. */
export const outboundEmailKindSchema = z.enum(OUTBOUND_EMAIL_KINDS);

/** One of the seven kinds. */
export type OutboundEmailKind = z.infer<typeof outboundEmailKindSchema>;

/**
 * What caused a message.
 *
 * `item` is in the list and is not an email kind: it is what a `comment`
 * message's link resolves against. The column carries no foreign key, because
 * the trigger can be deleted and the mail record must outlive it.
 */
export const outboundEmailTriggerKindSchema = z.enum([
  "sign_in_code",
  "invitation",
  "upload_session",
  "comment",
  "removal_request",
  "item",
]);

/** What caused a message. */
export type OutboundEmailTriggerKind = z.infer<
  typeof outboundEmailTriggerKindSchema
>;

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
  shoeboxName: z.string().min(1),
  /** Absolute, from `public.base_url`. No message is renderable without it. */
  baseUrl: signedUrlSchema,
  /** IANA zone from `shoebox.timezone`, frozen at enqueue. */
  timezone: z.string().min(1),
  /** The recipient's own name, for the greeting. Null falls back to nothing. */
  toDisplayName: z.string().nullable(),
  /** Null for `sign_in_code`, which has no switch to offer. */
  preferencesUrl: signedUrlSchema.nullable(),
});

/** The block on every payload. */
export type EmailCommon = z.infer<typeof emailCommonSchema>;

/**
 * `sign_in_code`: the six digits, addressed to whoever typed the address.
 *
 * The code is in the subject line deliberately, so it reads off a lock screen,
 * which is why both `payload_json` and `subject` are scrubbed once the row is
 * terminal (`data-models.md` § `outbound_emails`).
 */
export const signInCodeEmailPayloadSchema = emailCommonSchema.extend({
  /** The six digits, plaintext. Scrubbed from the row once terminal. */
  code: z.string().regex(/^\d{6}$/),
  expiresAt: timestampSchema,
  /** Carried so the copy cannot drift from the row it describes. */
  expiresInMinutes: z.number().int().positive(),
  /** Always null for this kind: there is no preference that turns it off. */
  preferencesUrl: z.null(),
});

/** `sign_in_code`'s payload. */
export type SignInCodeEmailPayload = z.infer<
  typeof signInCodeEmailPayloadSchema
>;

/**
 * What a caller hands `enqueueEmail`.
 *
 * `PayloadExtras` is the kind's payload **minus** `EmailCommon`: the enqueue
 * resolves that block itself, because only code inside the enqueue can
 * discover that `public.base_url` is unset and write the row anyway
 * (`apis/notifications.md` § When `public.base_url` is unset). The subject is
 * derived from the kind's template for the same reason, since
 * `invitation`'s subject interpolates the Shoebox name, which a caller does
 * not hold. Recorded in the step design as a deliberate deviation from the
 * shape `notifications.md` § The enqueue interface freezes.
 */
export type EnqueueEmailInput<Kind extends OutboundEmailKind, PayloadExtras> = {
  kind: Kind;
  /** Normalised by the enqueue. Denormalised onto the row. */
  toAddress: string;
  toMemberId: string | null;
  /** The recipient's own name, for the greeting. */
  toDisplayName: string | null;
  /** Verbatim from the recipe table in `apis/notifications.md`. `UNIQUE`. */
  idempotencyKey: string;
  payload: PayloadExtras;
  triggerKind: OutboundEmailTriggerKind;
  triggerId: string;
  /** Defaults to now. The reminder job is the only caller that sets it. */
  sendAfter?: string;
};

/**
 * What is sitting in `outbound_emails` right now, for the admin's mail banner
 * (`apis/notifications.md` § Mail).
 *
 * No formatted or relative string: the surface's "has not gone out for three
 * hours" is computed in the browser from `oldestQueuedAt`.
 */
export const mailQueueHealthSchema = z.object({
  queuedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  suppressedCount: z.number().int().nonnegative(),
  sentLast24hCount: z.number().int().nonnegative(),
  oldestQueuedAt: timestampSchema.nullable(),
  lastSentAt: timestampSchema.nullable(),
  lastFailedAt: timestampSchema.nullable(),
});

/** What is sitting in `outbound_emails` right now. */
export type MailQueueHealth = z.infer<typeof mailQueueHealthSchema>;
