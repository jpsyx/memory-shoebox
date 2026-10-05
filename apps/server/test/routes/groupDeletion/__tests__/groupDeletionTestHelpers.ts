import type { GroupUsageResponse } from "@memory-shoebox/shared";
import { groupUsageResponseSchema } from "@memory-shoebox/shared";
import type { LightMyRequestResponse } from "fastify";
import { expect } from "vitest";
import type { DatabaseExecutor } from "../../../../src/db/types/db.types.ts";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import type { TestApp } from "../../../helpers/createTestApp.ts";
import type { SignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertGroup,
  insertGroupMember,
  insertItem,
  insertMember,
  insertRendition,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
type GroupAccessFixture = {
  groupId: string;
  onlyId: string;
  exceptId: string;
  onlyItemId: string;
  exceptItemId: string;
};
type GroupRequests = {
  usage: () => Promise<GroupUsageResponse>;
  remove: (
    options?: Readonly<{ token?: string; targetId?: string }>,
  ) => Promise<LightMyRequestResponse>;
};
/** Catalog and request controls used by group deletion scenarios. */
export type GroupDeletionFixture = TestApp &
  GroupAccessFixture &
  GroupRequests & {
    admin: SignedInMember;
    viewer: SignedInMember;
    otherId: string;
    setNow: (instant: string) => void;
  };

/** Seeds group access cases and returns group, rule, and item IDs. */
export async function seedGroupAccess(
  input: Readonly<{
    database: DatabaseExecutor;
    options: { adminId: string; viewerId: string };
  }>,
): Promise<GroupAccessFixture> {
  const { database, options } = input;
  const groupId = await insertGroup(database);
  await insertGroupMember(database, { groupId, memberId: options.viewerId });
  const onlyId = await insertVisibilityRule(database, { mode: "only" });
  const exceptId = await insertVisibilityRule(database, { mode: "except" });
  await insertVisibilityRuleSubject(database, { ruleId: onlyId, groupId });
  await insertVisibilityRuleSubject(database, { ruleId: exceptId, groupId });
  const onlyItemId = await insertItem(database, {
    uploadedBy: options.adminId,
    visibility_rule_id: onlyId,
  });
  const exceptItemId = await insertItem(database, {
    uploadedBy: options.adminId,
    visibility_rule_id: exceptId,
    seq: 1,
  });
  await Promise.all(
    [onlyItemId, exceptItemId].map((itemId) => {
      return insertRendition(database, { itemId });
    }),
  );
  return { groupId, onlyId, exceptId, onlyItemId, exceptItemId };
}

/** Returns authenticated group usage and deletion request functions. */
export function makeGroupRequestsFromOptions(
  options: Readonly<{ fixture: TestApp; groupId: string; cookie: string }>,
): GroupRequests {
  const { fixture, groupId, cookie } = options;
  const { app } = fixture;
  const headers = { cookie };
  const usage = async () => {
    const response = await app.inject({
      url: `/api/groups/${groupId}/usage`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    return groupUsageResponseSchema.parse(response.json());
  };
  const remove: GroupRequests["remove"] = ({
    token,
    targetId = groupId,
  } = {}) => {
    return app.inject({
      method: "DELETE",
      url: `/api/groups/${targetId}${token ? `?confirmationToken=${encodeURIComponent(token)}` : ""}`,
      headers,
    });
  };
  return { usage, remove };
}

/** Provides the groupDeletion test fixture for catalog behavior. */
export async function createGroupDeletionFixture(): Promise<GroupDeletionFixture> {
  let now = NOW;
  const fixture = await createOwnedTestApp({
    clock: () => {
      return new Date(now);
    },
  });
  const { database } = fixture;
  const admin = await insertSignedInMember({
    database,
    member: { role: "admin" },
  });
  const viewer = await insertSignedInMember({
    database,
    token: "viewer",
    member: { role: "viewer" },
  });
  const otherId = await insertMember(database, { display_name: "Other" });
  const catalog = await seedGroupAccess({
    database: database,
    options: {
      adminId: admin.memberId,
      viewerId: viewer.memberId,
    },
  });
  const requests = makeGroupRequestsFromOptions({
    fixture: fixture,
    groupId: catalog.groupId,
    cookie: admin.cookie,
  });
  return {
    ...fixture,
    admin,
    viewer,
    otherId,
    ...catalog,
    ...requests,
    setNow: (value: string) => {
      now = value;
    },
  };
}

/** Seeds the authority that will change after a usage preview. */
export async function prepareGroupUsageChange(
  options: Readonly<{ change: string; fixture: GroupDeletionFixture }>,
): Promise<string | undefined> {
  const { change, fixture } = options;
  const { database, exceptId, otherId, viewer } = fixture;
  if (change === "subjects") {
    await insertVisibilityRuleSubject(database, {
      ruleId: exceptId,
      memberId: otherId,
    });
  }
  if (change !== "remaining memberships") {
    return undefined;
  }
  const remainingGroupId = await insertGroup(database, { name: "Remaining" });
  await insertGroupMember(database, {
    groupId: remainingGroupId,
    memberId: viewer.memberId,
  });
  await insertVisibilityRuleSubject(database, {
    ruleId: exceptId,
    groupId: remainingGroupId,
  });
  return remainingGroupId;
}

/** Changes visibility subjects or item assignments after recorded consent. */
export async function changeGroupUsageSubjects(
  options: Readonly<{
    change: string;
    fixture: GroupDeletionFixture;
    remainingGroupId: string | undefined;
  }>,
): Promise<void> {
  const { change, fixture, remainingGroupId } = options;
  const {
    database,
    exceptId,
    viewer,
    otherId,
    onlyId,
    onlyItemId,
    exceptItemId,
  } = fixture;
  if (change === "subjects") {
    await database
      .updateTable("visibility_rule_subjects")
      .set({ member_id: viewer.memberId })
      .where("rule_id", "=", exceptId)
      .where("member_id", "=", otherId)
      .execute();
  }
  if (change === "remaining memberships" && remainingGroupId !== undefined) {
    await database
      .updateTable("group_members")
      .set({ member_id: otherId })
      .where("group_id", "=", remainingGroupId)
      .execute();
  }
  if (change === "rule assignments") {
    await database
      .updateTable("items")
      .set({ visibility_rule_id: onlyId })
      .where("id", "=", exceptItemId)
      .execute();
    await database
      .updateTable("items")
      .set({ visibility_rule_id: exceptId })
      .where("id", "=", onlyItemId)
      .execute();
  }
}

/** Changes consented membership, role, status, uploader, or item identity. */
export async function changeGroupUsageAuthority(
  options: Readonly<{ change: string; fixture: GroupDeletionFixture }>,
): Promise<void> {
  const { change, fixture } = options;
  const { database, viewer, otherId, groupId, exceptId, exceptItemId, admin } =
    fixture;
  if (change === "memberships") {
    await database
      .updateTable("group_members")
      .set({ member_id: otherId })
      .where("group_id", "=", groupId)
      .execute();
  }
  if (change === "role") {
    await database
      .updateTable("members")
      .set({ role: "admin" })
      .where("id", "=", viewer.memberId)
      .execute();
  }
  if (change === "status") {
    await database
      .updateTable("members")
      .set({ status: "removed" })
      .where("id", "=", viewer.memberId)
      .execute();
  }
  if (change === "uploader") {
    await database
      .updateTable("items")
      .set({ uploaded_by: viewer.memberId })
      .where("id", "=", exceptItemId)
      .execute();
  }
  if (change === "items") {
    await database.deleteFrom("items").where("id", "=", exceptItemId).execute();
    await insertItem(database, {
      uploadedBy: admin.memberId,
      visibility_rule_id: exceptId,
      seq: 1,
    });
  }
}
