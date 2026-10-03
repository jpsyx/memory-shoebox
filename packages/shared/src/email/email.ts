import { z } from "zod";
import { signInCodeSchema } from "../auth.ts";
import {
  calendarDateSchema,
  signedUrlSchema,
  timestampSchema,
} from "../dtos.ts";
import { emailCommonSchema } from "./emailCommon.constants.ts";

/** Inputs for _addUploadSessionAgreementIssues. */
type AddUploadSessionAgreementIssuesOptions = {
  capturedOn: string;
  firstCapturedOn: string;
  lastCapturedOn: string;
  visibleDayCount: number;
  visibleItemCount: number;
};

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
 * Every state a row in `outbound_emails` may hold.
 *
 * `sent`, `failed`, `cancelled` and `suppressed` are terminal. Deleting a
 * comment cancels its notification while `queued` and never once `sending`: a
 * message already handed to the provider cannot be recalled.
 *
 * The order matches the `CHECK` constraint in migration
 * `0007_operations_and_audit.ts`, so the two can be read side by side.
 */
export const OUTBOUND_EMAIL_STATES = [
  "queued",
  "sending",
  "sent",
  "failed",
  "cancelled",
  "suppressed",
] as const;

/** One of the six states a message may hold. */
export type OutboundEmailState = (typeof OUTBOUND_EMAIL_STATES)[number];

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
 * `sign_in_code`: the six digits, addressed to whoever typed the address.
 *
 * The code is in the subject line deliberately, so it reads off a lock screen,
 * which is why both `payload_json` and `subject` are scrubbed once the row is
 * terminal (`data-models.md` § `outbound_emails`).
 */
export const signInCodeEmailPayloadSchema = emailCommonSchema.extend({
  /** The six digits, plaintext. Scrubbed from the row once terminal. */
  code: signInCodeSchema,
  expiresAt: timestampSchema,
  /** Carried so the copy cannot drift from the row it describes. */
  expiresInMinutes: z.number().int().positive(),
});

/** `sign_in_code`'s payload. */
export type SignInCodeEmailPayload = z.infer<
  typeof signInCodeEmailPayloadSchema
>;

/**
 * `comment`: somebody wrote on a photograph.
 *
 * One kind with two variants, chosen by `relation`, because they are the same
 * event reaching two different readers: the person who put the photograph up,
 * and somebody who had already written on it. The reason line and the subject
 * both have to say which, or a grandmother reads "one of your photos" about a
 * photograph that is not hers.
 *
 * The body is the comment **exactly as it was sent** (Decision 8). An edit
 * cannot catch a message already delivered, so editing a comment does not
 * rewrite a queued payload.
 */
export const commentEmailPayloadSchema = emailCommonSchema.extend({
  authorDisplayName: z.string(),
  /** The comment exactly as it was sent. */
  body: z.string(),
  /** Videos: the pinned position, in seconds. Null on a photograph. */
  atSeconds: z.number().nonnegative().nullable(),
  itemCapturedOn: calendarDateSchema,
  itemUrl: signedUrlSchema,
  /** Chooses the subject and the reason line. */
  relation: z.enum(["uploader", "commenter"]),
  uploaderDisplayName: z.string(),
});

/** `comment`'s payload. */
export type CommentEmailPayload = z.infer<typeof commentEmailPayloadSchema>;

/**
 * Reports every way an `upload_session` payload's figures can disagree with
 * each other.
 *
 * Each field is checked alone by its own schema, so a payload whose days run
 * backwards, or that counts more days than photographs, would otherwise parse
 * and be rendered into a message that contradicts itself. `YYYY-MM-DD` days
 * order the same as strings, so they are compared as strings.
 */
function _addUploadSessionAgreementIssues(
  payload: AddUploadSessionAgreementIssuesOptions,
  context: z.core.$RefinementCtx,
): void {
  const isOrdered =
    payload.firstCapturedOn <= payload.capturedOn &&
    payload.capturedOn <= payload.lastCapturedOn;
  if (!isOrdered) {
    context.addIssue({
      code: "custom",
      message: "capturedOn lies between firstCapturedOn and lastCapturedOn.",
      path: ["capturedOn"],
    });
  }

  const isOneDay = payload.firstCapturedOn === payload.lastCapturedOn;
  if (payload.visibleDayCount === 1 && !isOneDay) {
    context.addIssue({
      code: "custom",
      message: "One day means firstCapturedOn and lastCapturedOn are equal.",
      path: ["visibleDayCount"],
    });
  }
  if (payload.visibleDayCount > 1 && isOneDay) {
    context.addIssue({
      code: "custom",
      message: "Several days means firstCapturedOn and lastCapturedOn differ.",
      path: ["visibleDayCount"],
    });
  }

  if (payload.visibleItemCount < payload.visibleDayCount) {
    context.addIssue({
      code: "custom",
      message: "Every counted day holds at least one item.",
      path: ["visibleItemCount"],
    });
  }
}

/**
 * `upload_session`: a batch finished, told once to everybody who can see any
 * of it (`apis/notifications.md` § 3).
 *
 * **Every figure is this recipient's own** (Decision 4). There is no batch
 * total anywhere in it, because a shared total is a side channel saying how
 * much exists beyond what the reader can open. The narrowed state of surface
 * 16 is this payload with a smaller `visibleItemCount`, nothing else.
 *
 * `firstCapturedOn` and `lastCapturedOn` are not in the payload
 * `notifications.md` writes out. The `upload-multi-day` copy names the span
 * ("between 1 September and 14 September 2026"), and a renderer that had to
 * query for it would break the rule that rendering takes the payload and
 * nothing else.
 */
export const uploadSessionEmailPayloadSchema = emailCommonSchema
  .extend({
    uploaderDisplayName: z.string(),
    /** This recipient's figure. Never a batch total. */
    visibleItemCount: z.number().int().positive(),
    /**
     * The day carrying most of this recipient's visible items, the earliest
     * winning a tie, so the link is deterministic.
     */
    capturedOn: calendarDateSchema,
    /** Distinct days among this recipient's visible items. */
    visibleDayCount: z.number().int().positive(),
    /** The earliest of those days. Equal to `capturedOn` on a one-day batch. */
    firstCapturedOn: calendarDateSchema,
    /** The latest of those days. */
    lastCapturedOn: calendarDateSchema,
    /**
     * `${baseUrl}/?at=${lastCapturedOn}`: the timeline started at the batch's
     * newest visible day, so reading down passes every one of them. `?at=` is
     * the start position the jump rail writes; there is no `/day/` route, so
     * `notifications.md` § 3's `/day/` form is not used.
     */
    dayUrl: signedUrlSchema,
    /**
     * The milestone band on `lastCapturedOn`, if any: the day `dayUrl` opens
     * at, and the day the multi-day copy means by "the last of them". On a
     * one-day batch that is also `capturedOn`. Milestones have no visibility of
     * their own, so this needs no filtering (Decision 5).
     */
    milestoneName: z.string().nullable(),
  })
  .superRefine(_addUploadSessionAgreementIssues);

/** `upload_session`'s payload. */
export type UploadSessionEmailPayload = z.infer<
  typeof uploadSessionEmailPayloadSchema
>;

/**
 * What a caller hands `enqueueEmail`.
 *
 * `PayloadExtras` is the kind's payload **minus** `EmailCommon`, bounded to
 * `object` so that a bare primitive cannot stand in for that block: the enqueue
 * resolves that block itself, because only code inside the enqueue can
 * discover that `public.base_url` is unset and write the row anyway
 * (`apis/notifications.md` § When `public.base_url` is unset). The subject is
 * derived from the kind's template for the same reason, since
 * `invitation`'s subject interpolates the Shoebox name, which a caller does
 * not hold.
 *
 * Both are deliberate deviations from the shape `apis/notifications.md`
 * § The enqueue interface freezes, which gives this type a caller-supplied
 * `subject` and a complete payload. Four slices cite that shape, so the
 * difference is stated here rather than discovered at the first call site.
 */
export type EnqueueEmailInput<
  Kind extends OutboundEmailKind,
  PayloadExtras extends object,
> = {
  kind: Kind;
  /** Normalised by the enqueue. Denormalised onto the row. */
  toAddress: string;
  /** Undefined for a recipient who is not a member, such as an invitee. */
  toMemberId: string | undefined;
  /**
   * The recipient's own name, for the greeting. Undefined greets nobody by
   * name: the enqueue is what turns that into the `null` the payload carries.
   */
  toDisplayName: string | undefined;
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

/** Common payload definitions shared by every mail family. */
export {
  emailCommonSchema,
  type EmailCommon,
} from "./emailCommon.constants.ts";
/** Removal payload family, keeping the directory entry's public contract. */
export {
  removalRequestEmailPayloadSchema,
  removalReminderEmailPayloadSchema,
  removalResolvedDeletedEmailPayloadSchema,
  removalResolvedDeclinedEmailPayloadSchema,
  removalResolvedWithdrawnEmailPayloadSchema,
  removalResolvedEmailPayloadSchema,
  type RemovalRequestEmailPayload,
  type RemovalReminderEmailPayload,
  type RemovalResolvedDeletedEmailPayload,
  type RemovalResolvedDeclinedEmailPayload,
  type RemovalResolvedWithdrawnEmailPayload,
  type RemovalResolvedEmailPayload,
} from "./removalEmailPayloadSchemas.constants.ts";
