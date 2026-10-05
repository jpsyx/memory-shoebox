import { describe, expect, it } from "vitest";
import {
  adminGroupDtoSchema,
  apiErrorDetailsSchema,
  apiErrorSchema,
  createGroupRequestSchema,
  deleteGroupRequestSchema,
  groupIdParamsSchema,
  groupUsageResponseSchema,
  listGroupsResponseSchema,
  renameGroupRequestSchema,
  replaceGroupMembersRequestSchema,
  replaceGroupMembersResponseSchema,
} from "../../../src/index.ts";
import {
  ADMIN_GROUP,
  GROUP,
  GROUP_ID,
  MEMBER,
  MEMBER_ID,
  USAGE,
  VISIBILITY,
} from "./administrationTestHelpers.ts";

describe("administration group contracts", () => {
  it("keeps the full admin shape and removes extras from picker groups", () => {
    expect(adminGroupDtoSchema.parse(ADMIN_GROUP)).toEqual(ADMIN_GROUP);
    expect(
      listGroupsResponseSchema.parse({
        shape: "admin",
        groups: [ADMIN_GROUP],
        nextCursor: null,
      }),
    ).toEqual({ shape: "admin", groups: [ADMIN_GROUP], nextCursor: null });
    expect(
      listGroupsResponseSchema.parse({
        shape: "picker",
        groups: [ADMIN_GROUP],
        nextCursor: null,
      }),
    ).toEqual({ shape: "picker", groups: [GROUP], nextCursor: null });
  });

  it("returns normalized group names and unchanged narrow mutation values", () => {
    expect(
      createGroupRequestSchema.parse({
        name: " Cousins ",
        memberIds: [MEMBER_ID],
      }).name,
    ).toBe("Cousins");
    expect(renameGroupRequestSchema.parse({ name: "Family" }).name).toBe(
      "Family",
    );
    expect(
      replaceGroupMembersRequestSchema.parse({ memberIds: [] }).memberIds,
    ).toEqual([]);
    expect(
      replaceGroupMembersResponseSchema.parse({
        members: [MEMBER],
        nextCursor: null,
      }).members,
    ).toEqual([MEMBER]);
    expect(groupIdParamsSchema.parse({ groupId: GROUP_ID }).groupId).toBe(
      GROUP_ID,
    );
    expect(
      deleteGroupRequestSchema.parse({ confirmationToken: "signed" })
        .confirmationToken,
    ).toBe("signed");
  });

  it.each([
    { name: " " },
    { name: "x".repeat(101) },
    { name: "Family", memberIds: ["slug"] },
    { name: "Family", usedByOnlyRules: 0 },
  ])("rejects invalid group creation: %j", (body) => {
    expect(createGroupRequestSchema.safeParse(body).success).toBe(false);
  });

  it("preserves both directions of group usage in conflict details", () => {
    expect(
      groupUsageResponseSchema.parse(USAGE).rules[0]?.visibilityAfter.subjects,
    ).toEqual([]);
    expect(apiErrorDetailsSchema.parse(USAGE).wideningItemCount).toBe(2);
    expect(apiErrorDetailsSchema.parse(USAGE)).toEqual(USAGE);
    expect(
      apiErrorSchema.parse({
        error: "groups_usage_changed",
        message: "Usage changed",
        details: USAGE,
      }).details?.membersGainingAccess,
    ).toEqual([MEMBER]);
  });

  it("rejects negative usage counts and an everyone rule naming a group", () => {
    expect(
      groupUsageResponseSchema.safeParse({ ...USAGE, wideningItemCount: -1 })
        .success,
    ).toBe(false);
    expect(
      groupUsageResponseSchema.safeParse({
        ...USAGE,
        rules: [
          {
            ...USAGE.rules[0],
            visibility: { ...VISIBILITY, mode: "everyone" },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
