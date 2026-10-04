import { z } from "zod";
import {
  MEMBER_STATUSES,
  memberRoleSchema,
  normalisedEmailSchema,
  sessionDtoSchema,
} from "../auth.ts";
import {
  idSchema,
  memberRefSchema,
  personRefSchema,
  timestampSchema,
} from "../dtos.ts";
import { LIMITS } from "../limits.ts";

/** The state of a member account. */
export const memberStatusSchema = z.enum(MEMBER_STATUSES);

/** Latest invitation facts, carrying no credential. */
export const memberInvitationDtoSchema = z.object({
  invitationId: idSchema,
  invitedBy: memberRefSchema,
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  sendCount: z.number().int().nonnegative(),
  lastSentAt: timestampSchema,
  revokedAt: timestampSchema.nullable(),
  acceptedAt: timestampSchema.nullable(),
  isPending: z.boolean(),
});

/** Latest invitation facts, carrying no credential. */
export type MemberInvitationDto = z.infer<typeof memberInvitationDtoSchema>;

/** Administrative member details, never served to directory readers. */
export const adminMemberDtoSchema = z.object({
  ...memberRefSchema.shape,
  email: z.email(),
  role: memberRoleSchema,
  status: memberStatusSchema,
  joinedAt: timestampSchema.nullable(),
  lastSignedInAt: timestampSchema.nullable(),
  lastSeenAt: timestampSchema.nullable(),
  removedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  invitation: memberInvitationDtoSchema.nullable(),
  sessions: z.array(sessionDtoSchema),
  isLastActiveAdmin: z.boolean(),
});

/** Administrative member details, never served to directory readers. */
export type AdminMemberDto = z.infer<typeof adminMemberDtoSchema>;

/** Query of GET /api/members; status filtering is admin-only. */
export const listMembersRequestSchema = z.strictObject({
  status: z.array(memberStatusSchema).optional(),
});

/** Query of GET /api/members; status filtering is admin-only. */
export type ListMembersRequest = z.infer<typeof listMembersRequestSchema>;

/** Role-selected administrative or directory member collection. */
export const listMembersResponseSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("admin"),
    members: z.array(adminMemberDtoSchema),
    nextCursor: z.null(),
    activeAdminCount: z.number().int().nonnegative(),
  }),
  z.object({
    shape: z.literal("directory"),
    members: z.array(memberRefSchema),
    nextCursor: z.null(),
  }),
]);

/** Role-selected administrative or directory member collection. */
export type ListMembersResponse = z.infer<typeof listMembersResponseSchema>;

/** Body of POST /api/members with a normalized identity. */
export const inviteMemberRequestSchema = z.strictObject({
  email: normalisedEmailSchema,
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.memberDisplayNameMaxLength)
    .nullable()
    .optional(),
  role: memberRoleSchema,
});

/** Body of POST /api/members with a normalized identity. */
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

/** Member path parameters for administrative account actions. */
export const memberIdParamsSchema = z.strictObject({ memberId: idSchema });

/** Member path parameters for administrative account actions. */
export type MemberIdParams = z.infer<typeof memberIdParamsSchema>;

/** Body of PATCH /api/members/:memberId. */
export const changeMemberRoleRequestSchema = z.strictObject({
  role: memberRoleSchema,
});

/** Body of PATCH /api/members/:memberId. */
export type ChangeMemberRoleRequest = z.infer<
  typeof changeMemberRoleRequestSchema
>;

/** Path of DELETE /api/members/:memberId. */
export const removeMemberRequestSchema = memberIdParamsSchema;

/** Path of DELETE /api/members/:memberId. */
export type RemoveMemberRequest = z.infer<typeof removeMemberRequestSchema>;

/** Path of POST /api/members/:memberId/invitation/resend. */
export const resendMemberInvitationRequestSchema = memberIdParamsSchema;

/** Path of POST /api/members/:memberId/invitation/resend. */
export type ResendMemberInvitationRequest = z.infer<
  typeof resendMemberInvitationRequestSchema
>;

/** Path of DELETE /api/members/:memberId/invitation. */
export const revokeMemberInvitationRequestSchema = memberIdParamsSchema;

/** Path of DELETE /api/members/:memberId/invitation. */
export type RevokeMemberInvitationRequest = z.infer<
  typeof revokeMemberInvitationRequestSchema
>;

/** Path of DELETE /api/members/:memberId/sessions/:sessionId. */
export const revokeMemberSessionParamsSchema = z.strictObject({
  memberId: idSchema,
  sessionId: idSchema,
});

/** Path of DELETE /api/members/:memberId/sessions/:sessionId. */
export type RevokeMemberSessionParams = z.infer<
  typeof revokeMemberSessionParamsSchema
>;

/** Path of the administrative device revocation. */
export const revokeMemberSessionRequestSchema = revokeMemberSessionParamsSchema;

/** Path of the administrative device revocation. */
export type RevokeMemberSessionRequest = z.infer<
  typeof revokeMemberSessionRequestSchema
>;

/** Query of GET /api/member-suggestions. */
export const listMemberSuggestionsRequestSchema = z.strictObject({
  email: normalisedEmailSchema,
});

/** Query of GET /api/member-suggestions. */
export type ListMemberSuggestionsRequest = z.infer<
  typeof listMemberSuggestionsRequestSchema
>;

/** A tagged person suggested for an invitation name. */
export const memberSuggestionDtoSchema = z.object({
  person: personRefSchema,
  itemCount: z.number().int().nonnegative(),
});

/** A tagged person suggested for an invitation name. */
export type MemberSuggestionDto = z.infer<typeof memberSuggestionDtoSchema>;

/** Administrative invitation suggestions, without pagination. */
export const listMemberSuggestionsResponseSchema = z.object({
  suggestions: z.array(memberSuggestionDtoSchema),
  nextCursor: z.null(),
});

/** Administrative invitation suggestions, without pagination. */
export type ListMemberSuggestionsResponse = z.infer<
  typeof listMemberSuggestionsResponseSchema
>;
