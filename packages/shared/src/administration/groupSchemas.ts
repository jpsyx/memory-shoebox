import { z } from "zod";
import {
  idSchema,
  memberRefSchema,
  timestampSchema,
  visibilityRuleIdSchema,
  visibilitySummarySchema,
} from "../dtos.ts";
import { LIMITS } from "../limits.ts";

/** Group identity for the visibility picker. */
export const groupRefSchema = z.object({ groupId: idSchema, name: z.string() });

/** Group identity for the visibility picker. */
export type GroupRef = z.infer<typeof groupRefSchema>;

/** Administrative group details and item usage in each direction. */
export const adminGroupDtoSchema = z.object({
  ...groupRefSchema.shape,
  createdAt: timestampSchema,
  members: z.array(memberRefSchema),
  usedByOnlyRules: z.number().int().nonnegative(),
  usedByExceptRules: z.number().int().nonnegative(),
});

/** Administrative group details and item usage in each direction. */
export type AdminGroupDto = z.infer<typeof adminGroupDtoSchema>;

/** Role-selected administrative or picker group collection. */
export const listGroupsResponseSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("admin"),
    groups: z.array(adminGroupDtoSchema),
    nextCursor: z.null(),
  }),
  z.object({
    shape: z.literal("picker"),
    groups: z.array(groupRefSchema),
    nextCursor: z.null(),
  }),
]);

/** Role-selected administrative or picker group collection. */
export type ListGroupsResponse = z.infer<typeof listGroupsResponseSchema>;

/** Path parameters of the administrative group routes. */
export const groupIdParamsSchema = z.strictObject({ groupId: idSchema });

/** Path parameters of the administrative group routes. */
export type GroupIdParams = z.infer<typeof groupIdParamsSchema>;

/** Body of POST /api/groups; member ids may repeat. */
export const createGroupRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(LIMITS.groupNameMaxLength),
  memberIds: z.array(idSchema).optional(),
});

/** Body of POST /api/groups; member ids may repeat. */
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;

/** Body of PATCH /api/groups/:groupId. */
export const renameGroupRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(LIMITS.groupNameMaxLength),
});

/** Body of PATCH /api/groups/:groupId. */
export type RenameGroupRequest = z.infer<typeof renameGroupRequestSchema>;

/** Body of PUT /api/groups/:groupId/members. */
export const replaceGroupMembersRequestSchema = z.strictObject({
  memberIds: z.array(idSchema),
});

/** Body of PUT /api/groups/:groupId/members. */
export type ReplaceGroupMembersRequest = z.infer<
  typeof replaceGroupMembersRequestSchema
>;

/** The complete group membership after replacement. */
export const replaceGroupMembersResponseSchema = z.object({
  members: z.array(memberRefSchema),
  nextCursor: z.null(),
});

/** The complete group membership after replacement. */
export type ReplaceGroupMembersResponse = z.infer<
  typeof replaceGroupMembersResponseSchema
>;

/** Path of GET /api/groups/:groupId/usage. */
export const getGroupUsageRequestSchema = groupIdParamsSchema;

/** Path of GET /api/groups/:groupId/usage. */
export type GetGroupUsageRequest = z.infer<typeof getGroupUsageRequestSchema>;

/** One rule and the audience change caused by deleting a group. */
export const groupUsageRuleDtoSchema = z.object({
  ruleId: visibilityRuleIdSchema,
  visibility: visibilitySummarySchema.extend({
    mode: z.enum(["only", "except"]),
  }),
  effect: z.enum(["narrows", "widens"]),
  itemCount: z.number().int().nonnegative(),
  visibilityAfter: visibilitySummarySchema,
  becomesEmptyAllowList: z.boolean(),
});

/** One rule and the audience change caused by deleting a group. */
export type GroupUsageRuleDto = z.infer<typeof groupUsageRuleDtoSchema>;

/** The complete usage bound to the group deletion confirmation token. */
export const groupUsageResponseSchema = z.object({
  group: groupRefSchema,
  narrowingItemCount: z.number().int().nonnegative(),
  wideningItemCount: z.number().int().nonnegative(),
  emptyAllowListItemCount: z.number().int().nonnegative(),
  membersLosingAccess: z.array(memberRefSchema),
  membersGainingAccess: z.array(memberRefSchema),
  rules: z.array(groupUsageRuleDtoSchema),
  confirmationToken: z.string().min(1).nullable(),
});

/** The complete usage bound to the group deletion confirmation token. */
export type GroupUsageResponse = z.infer<typeof groupUsageResponseSchema>;

/** Query of DELETE /api/groups/:groupId. */
export const deleteGroupRequestSchema = z.strictObject({
  confirmationToken: z.string().min(1).optional(),
});

/** Query of DELETE /api/groups/:groupId. */
export type DeleteGroupRequest = z.infer<typeof deleteGroupRequestSchema>;
