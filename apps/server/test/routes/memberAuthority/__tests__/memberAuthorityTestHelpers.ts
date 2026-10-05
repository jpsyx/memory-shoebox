import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { expect } from "vitest";
import type { DatabaseExecutor } from "../../../../src/db/types/db.types.ts";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import type { TestApp } from "../../../helpers/createTestApp.ts";
import type { SignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertComment,
  insertGroup,
  insertGroupMember,
  insertInvitation,
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertSession,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type MemberAuthorityFixture = TestApp & {
  admin: SignedInMember;
  mutate: (
    options: Readonly<{
      method: "PATCH" | "DELETE";
      memberId: string;
      role?: string;
    }>,
  ) => Promise<LightMyRequestResponse>;
};

/** Provides memberAuthority catalog fixtures and request controls. */
export async function createMemberAuthorityFixture(): Promise<MemberAuthorityFixture> {
  const fixture = await createOwnedTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const admin = await insertSignedInMember({
    database: fixture.database,
    member: { role: "admin" },
  });
  return {
    ...fixture,
    admin,
    mutate: ({ method, memberId, role = "viewer" }) => {
      return fixture.app.inject({
        method,
        url: `/api/members/${memberId}`,
        headers: { cookie: admin.cookie },
        ...(method === "PATCH" ? { payload: { role } } : {}),
      });
    },
  };
}

type ExpectRemovedMemberAccessOptions = {
  response: LightMyRequestResponse;
  app: FastifyInstance;
  admin: SignedInMember;
  database: DatabaseExecutor;
  invitationId: string;
  itemId: string;
};

/** Checks removed member access. */
export async function expectRemovedMemberAccess(
  options: Readonly<ExpectRemovedMemberAccessOptions>,
): Promise<void> {
  const { response, app, admin, database, invitationId, itemId } = options;
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    status: "removed",
    removedAt: NOW,
    joinedAt: NOW,
    lastSignedInAt: NOW,
    sessions: [],
  });
  expect(
    (await app.inject({ url: "/api/me", headers: { cookie: admin.cookie } }))
      .statusCode,
  ).toBe(401);
  expect(
    await database.selectFrom("sessions").selectAll().execute(),
  ).toHaveLength(0);
  expect(
    await database.selectFrom("group_members").selectAll().execute(),
  ).toHaveLength(0);
  expect(
    (
      await database
        .selectFrom("invitations")
        .select("revoked_at")
        .where("id", "=", invitationId)
        .executeTakeFirstOrThrow()
    ).revoked_at,
  ).toBe(NOW);
  expect(
    (
      await database
        .selectFrom("items")
        .select("uploaded_by")
        .where("id", "=", itemId)
        .executeTakeFirstOrThrow()
    ).uploaded_by,
  ).toBe(admin.memberId);
}

/** Checks retained member authorship. */
export async function expectRetainedMemberAuthorship(
  options: Readonly<{
    database: DatabaseExecutor;
    commentId: string;
    admin: SignedInMember;
  }>,
): Promise<void> {
  const { database, commentId, admin } = options;
  expect(
    (
      await database
        .selectFrom("comments")
        .select("author_member_id")
        .where("id", "=", commentId)
        .executeTakeFirstOrThrow()
    ).author_member_id,
  ).toBe(admin.memberId);
  expect(
    await database.selectFrom("item_people").selectAll().execute(),
  ).toHaveLength(1);
  expect(
    await database.selectFrom("visibility_rule_subjects").selectAll().execute(),
  ).toHaveLength(1);
}

type RemovedMemberFixtureResult = {
  database: DatabaseExecutor;
  commentId: string;
  admin: SignedInMember;
  groupId: string;
  close: () => Promise<void>;
};

/** Provides memberAuthority catalog fixtures and request controls. */
export async function prepareRemovedMemberFixture(): Promise<RemovedMemberFixtureResult> {
  const { app, database, admin, mutate, close } =
    await createMemberAuthorityFixture();
  await insertMember(database, { role: "admin" });
  await insertSession(database, { memberId: admin.memberId });
  const groupId = await insertGroup(database);
  await insertGroupMember(database, { groupId, memberId: admin.memberId });
  const invitationId = await insertInvitation(database, {
    memberId: admin.memberId,
    invitedByMemberId: admin.memberId,
  });
  const itemId = await insertItem(database, { uploadedBy: admin.memberId });
  const commentId = await insertComment(database, {
    itemId,
    authorMemberId: admin.memberId,
  });
  const personId = await insertPerson(database, {
    displayName: "Rosa",
    member_id: admin.memberId,
  });
  await insertItemPerson(database, { itemId, personId });
  const ruleId = await insertVisibilityRule(database, { mode: "only" });
  await insertVisibilityRuleSubject(database, {
    ruleId,
    memberId: admin.memberId,
  });
  const response = await mutate({
    method: "DELETE",
    memberId: admin.memberId,
  });
  await expectRemovedMemberAccess({
    response,
    app,
    admin,
    database,
    invitationId,
    itemId,
  });
  return { database, commentId, admin, groupId, close };
}
