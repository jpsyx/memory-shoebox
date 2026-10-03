import { z } from "zod";
import {
  calendarDateSchema,
  signedUrlSchema,
  timestampSchema,
} from "../dtos.ts";
import { emailCommonSchema } from "./emailCommon.constants.ts";

/** Snapshotted request facts for removal_request (notifications section 5). */
export const removalRequestEmailPayloadSchema = emailCommonSchema.extend({
  requesterDisplayName: z.string(),
  isRequesterTagged: z.boolean(),
  reason: z.string().nullable(),
  itemCapturedOn: calendarDateSchema,
  itemUploadedOn: calendarDateSchema,
  uploaderDisplayName: z.string(),
  requestsUrl: signedUrlSchema,
  relation: z.enum(["uploader", "admin"]),
});
/** Payload of removal_request. */
export type RemovalRequestEmailPayload = z.infer<
  typeof removalRequestEmailPayloadSchema
>;

/** Weekly reminder facts for removal_reminder (notifications section 6). */
export const removalReminderEmailPayloadSchema = emailCommonSchema.extend({
  requesterDisplayName: z.string(),
  reason: z.string().nullable(),
  requestedOn: calendarDateSchema,
  weekIndex: z.number().int().positive(),
  requestsUrl: signedUrlSchema,
  relation: z.enum(["uploader", "admin"]),
});
/** Payload of removal_reminder. */
export type RemovalReminderEmailPayload = z.infer<
  typeof removalReminderEmailPayloadSchema
>;

/** Deleted answer facts; the deleted item has no link (section 7). */
export const removalResolvedDeletedEmailPayloadSchema =
  emailCommonSchema.extend({
    outcome: z.literal("deleted"),
    resolvedByDisplayName: z.string(),
    resolvedAt: timestampSchema,
    itemCapturedOn: calendarDateSchema,
    relation: z.enum(["requester", "uploader"]),
  });
/** Deleted variant of removal_resolved. */
export type RemovalResolvedDeletedEmailPayload = z.infer<
  typeof removalResolvedDeletedEmailPayloadSchema
>;

/** Declined answer with the decliner's verbatim words (section 8). */
export const removalResolvedDeclinedEmailPayloadSchema =
  emailCommonSchema.extend({
    outcome: z.literal("declined"),
    declinerDisplayName: z.string(),
    declineReason: z.string(),
    resolvedAt: timestampSchema,
    itemUrl: signedUrlSchema,
  });
/** Declined variant of removal_resolved. */
export type RemovalResolvedDeclinedEmailPayload = z.infer<
  typeof removalResolvedDeclinedEmailPayloadSchema
>;

/** Requester withdrawal facts; the photo is untouched (section 9). */
export const removalResolvedWithdrawnEmailPayloadSchema =
  emailCommonSchema.extend({
    outcome: z.literal("withdrawn"),
    withdrawnByDisplayName: z.string(),
    resolvedAt: timestampSchema,
    itemCapturedOn: calendarDateSchema,
    itemUrl: signedUrlSchema,
  });
/** Withdrawn variant of removal_resolved. */
export type RemovalResolvedWithdrawnEmailPayload = z.infer<
  typeof removalResolvedWithdrawnEmailPayloadSchema
>;

/** The three outcomes sharing the removal_resolved outbound mail kind. */
export const removalResolvedEmailPayloadSchema = z.discriminatedUnion(
  "outcome",
  [
    removalResolvedDeletedEmailPayloadSchema,
    removalResolvedDeclinedEmailPayloadSchema,
    removalResolvedWithdrawnEmailPayloadSchema,
  ],
);
/** Payload of removal_resolved, discriminated by outcome. */
export type RemovalResolvedEmailPayload = z.infer<
  typeof removalResolvedEmailPayloadSchema
>;
