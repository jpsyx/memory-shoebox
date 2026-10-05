import { z } from "zod";
import { cursorSchema } from "./collectionSchema.ts";
import { idSchema, memberRefSchema, timestampSchema } from "./dtos.ts";
import {
  mailQueueHealthSchema,
  outboundEmailKindSchema,
} from "./email/email.ts";

/** Self-or-admin presence query; the member list never paginates. */
export const presenceRequestSchema = z.strictObject({
  memberId: idSchema.optional(),
});

/** Self-or-admin presence query; the member list never paginates. */
export type PresenceRequest = z.infer<typeof presenceRequestSchema>;

/** Member arrival and live participation figures. */
export const presenceRowSchema = z.object({
  member: memberRefSchema,
  email: z.email(),
  status: z.enum(["invited", "active"]),
  invitedAt: timestampSchema,
  joinedAt: timestampSchema.nullable(),
  lastSignedInAt: timestampSchema.nullable(),
  lastSeenAt: timestampSchema.nullable(),
  activeDaysCount: z.number().int().nonnegative(),
  activeDaysWindowDays: z.number().int().nonnegative(),
  itemsOpenedCount: z.number().int().nonnegative(),
  commentsWrittenCount: z.number().int().nonnegative(),
  reactionsLeftCount: z.number().int().nonnegative(),
});

/** Member arrival and live participation figures. */
export type PresenceRow = z.infer<typeof presenceRowSchema>;

/** Unpaginated presence for the authorized member set. */
export const presenceResponseSchema = z.object({
  presence: z.array(presenceRowSchema),
  nextCursor: z.null(),
});

/** Unpaginated presence for the authorized member set. */
export type PresenceResponse = z.infer<typeof presenceResponseSchema>;

/** Path of GET /api/items/:itemId/viewers. */
export const itemViewersRequestSchema = z.strictObject({ itemId: idSchema });

/** Path of GET /api/items/:itemId/viewers. */
export type ItemViewersRequest = z.infer<typeof itemViewersRequestSchema>;

/** One eligible member and their full-size opening record. */
export const itemViewerRowSchema = z.object({
  member: memberRefSchema,
  hasOpened: z.boolean(),
  firstSeenAt: timestampSchema.nullable(),
  firstOpenedAt: timestampSchema.nullable(),
  lastOpenedAt: timestampSchema.nullable(),
  openCount: z.number().int().nonnegative(),
});

/** One eligible member and their full-size opening record. */
export type ItemViewerRow = z.infer<typeof itemViewerRowSchema>;

/** Unpaginated eligible viewers of one visible item. */
export const itemViewersResponseSchema = z.object({
  viewers: z.array(itemViewerRowSchema),
  nextCursor: z.null(),
});

/** Unpaginated eligible viewers of one visible item. */
export type ItemViewersResponse = z.infer<typeof itemViewersResponseSchema>;

/** The three presentation families of the durable activity log. */
export const activityFamilySchema = z.enum([
  "authority",
  "destruction",
  "access",
]);

/** The three presentation families of the durable activity log. */
export type ActivityFamily = z.infer<typeof activityFamilySchema>;

const SETTING_SUBJECT_ID_SCHEMA = z.string().min(1).max(256);

/** Bounded and filtered activity query. */
export const activityRequestSchema = z.strictObject({
  limit: z.number().int().min(1).max(200).optional(),
  cursor: cursorSchema.optional(),
  actorMemberId: idSchema.optional(),
  subjectId: z.union([idSchema, SETTING_SUBJECT_ID_SCHEMA]).optional(),
  family: activityFamilySchema.optional(),
});

/** Bounded and filtered activity query. */
export type ActivityRequest = z.infer<typeof activityRequestSchema>;

/** Historical actor label; identity may be gone or absent. */
export const activityActorSchema = z.object({
  memberId: idSchema.nullable(),
  label: z.string(),
});

/** Historical actor label; identity may be gone or absent. */
export type ActivityActor = z.infer<typeof activityActorSchema>;

/** Historical subject label; ids may outlive the subject row. */
export const activitySubjectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("setting"),
    id: SETTING_SUBJECT_ID_SCHEMA.nullable(),
    label: z.string(),
  }),
  z.object({
    kind: z.enum([
      "item",
      "member",
      "group",
      "comment",
      "milestone",
      "session",
    ]),
    id: idSchema.nullable(),
    label: z.string(),
  }),
]);

/** Historical subject label; ids may outlive the subject row. */
export type ActivitySubject = z.infer<typeof activitySubjectSchema>;

/** Narrow per-kind activity detail with no raw storage payload. */
export const activityDetailSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("member_role_changed"),
    fromRole: z.string(),
    toRole: z.string(),
  }),
  z.object({
    kind: z.literal("group_membership_changed"),
    addedLabels: z.array(z.string()),
    removedLabels: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("item_visibility_changed"),
    fromLabel: z.string().nullable(),
    toLabel: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("setting_changed"),
    settingKey: z.string(),
    fromValue: z.string().nullable(),
    toValue: z.string().nullable(),
  }),
]);

/** Narrow per-kind activity detail with no raw storage payload. */
export type ActivityDetail = z.infer<typeof activityDetailSchema>;

/** One durable event with labels as they were at write time. */
export const activityEntryDtoSchema = z.object({
  entryId: idSchema,
  kind: z.string(),
  family: activityFamilySchema,
  occurredAt: timestampSchema,
  actor: activityActorSchema,
  subject: activitySubjectSchema,
  deviceLabel: z.string().nullable(),
  detail: activityDetailSchema.nullable(),
});

/** One durable event with labels as they were at write time. */
export type ActivityEntryDto = z.infer<typeof activityEntryDtoSchema>;

/** One cursor page of durable activity events. */
export const activityResponseSchema = z.object({
  activity: z.array(activityEntryDtoSchema),
  nextCursor: cursorSchema.nullable(),
});

/** One cursor page of durable activity events. */
export type ActivityResponse = z.infer<typeof activityResponseSchema>;

/** One actionable cause selected by the server diagnosis ladder. */
export const mailDiagnosisSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("base_url_unset"),
    settingKey: z.literal("public.base_url"),
  }),
  z.object({
    code: z.literal("from_address_unset"),
    settingKey: z.literal("mail.from_address"),
  }),
  z.object({
    code: z.literal("domain_unverified"),
    domain: z.string(),
    providerError: z.string().nullable(),
  }),
  z.object({
    code: z.literal("provider_rejecting"),
    providerStatus: z.string().nullable(),
    providerMessage: z.string().nullable(),
    failingSince: timestampSchema,
  }),
  z.object({
    code: z.literal("backlog"),
    oldestQueuedAt: timestampSchema,
    queuedCount: z.number().int().nonnegative(),
  }),
]);

/** One actionable cause selected by the server diagnosis ladder. */
export type MailDiagnosis = z.infer<typeof mailDiagnosisSchema>;

/** Latest mail delivery failure, with no credentials or payload. */
export const mailDeliveryFailureSchema = z.object({
  code: z.string().nullable(),
  message: z.string().nullable(),
  occurredAt: timestampSchema,
  kind: outboundEmailKindSchema,
});

/** Latest mail delivery failure, with no credentials or payload. */
export type MailDeliveryFailure = z.infer<typeof mailDeliveryFailureSchema>;

/** Administrative mail configuration, diagnosis and queue facts. */
export const mailHealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "failing"]),
  diagnosis: mailDiagnosisSchema.nullable(),
  fromAddress: z.email().nullable(),
  fromName: z.string().nullable(),
  sendingDomain: z.string().nullable(),
  domainVerifiedAt: timestampSchema.nullable(),
  domainLastCheckError: z.string().nullable(),
  isBaseUrlSet: z.boolean(),
  queue: mailQueueHealthSchema,
  lastError: mailDeliveryFailureSchema.nullable(),
  suppressedAddressCount: z.number().int().nonnegative(),
});

/** Administrative mail configuration, diagnosis and queue facts. */
export type MailHealthResponse = z.infer<typeof mailHealthResponseSchema>;
