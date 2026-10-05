import type { AdminGroupDto } from "@memory-shoebox/shared";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { expect } from "vitest";
import { readGroups } from "../../../../src/administration/groupReadHelpers.ts";
import { createId } from "../../../../src/db/createId.ts";
import type {
  Database,
  DatabaseExecutor,
} from "../../../../src/db/types/db.types.ts";
import type { Viewer } from "../../../../src/http/requestContextHelpers.ts";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import type { SignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import type { QueryCountingDatabase } from "../../../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../../../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import {
  NOW,
  insertGroup,
  insertItem,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

type ExpectRoleSelectedGroupsOptions = {
  app: FastifyInstance;
  admin: SignedInMember;
  group: AdminGroupDto;
  uploader: SignedInMember;
};

/** Checks role selected groups. */
export async function expectRoleSelectedGroups(
  options: Readonly<ExpectRoleSelectedGroupsOptions>,
): Promise<void> {
  const { app, admin, group, uploader } = options;
  expect(
    (
      await app.inject({
        url: "/api/groups",
        headers: { cookie: admin.cookie },
      })
    ).json(),
  ).toEqual({ shape: "admin", groups: [group], nextCursor: null });
  expect(
    (
      await app.inject({
        url: "/api/groups",
        headers: { cookie: uploader.cookie },
      })
    ).json(),
  ).toEqual({
    shape: "picker",
    groups: [{ groupId: group.groupId, name: "Cousins" }],
    nextCursor: null,
  });
}

type ExpectEmptyGroupMembershipOptions = {
  empty: LightMyRequestResponse;
  database: DatabaseExecutor;
  app: FastifyInstance;
  headers: Readonly<{ cookie: string }>;
};

/** Checks empty group membership. */
export async function expectEmptyGroupMembership(
  options: Readonly<ExpectEmptyGroupMembershipOptions>,
): Promise<void> {
  const { empty, database, app, headers } = options;
  expect(empty.statusCode).toBe(201);
  expect(await database.selectFrom("settings").selectAll().execute()).toEqual(
    [],
  );
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/groups",
        headers,
        payload: { name: "CAFE\u0301 family" },
      })
    ).json().error,
  ).toBe("groups_name_taken");
}

type ExpectGroupRenameAndMemberValidationOptions = {
  rename: LightMyRequestResponse;
  database: DatabaseExecutor;
  app: FastifyInstance;
  groupId: string;
  invitedId: string;
  removedId: string;
  headers: Readonly<{ cookie: string }>;
};

/** Checks group rename and member validation. */
export async function expectGroupRenameAndMemberValidation(
  options: Readonly<ExpectGroupRenameAndMemberValidationOptions>,
): Promise<void> {
  const { rename, database, app, groupId, invitedId, removedId, headers } =
    options;
  expect(rename.statusCode).toBe(200);
  expect(
    (
      await database
        .selectFrom("settings")
        .select("value")
        .where("key", "=", "visibility.generation")
        .executeTakeFirstOrThrow()
    ).value,
  ).toBe("1");
  expect(
    (
      await app.inject({
        method: "PUT",
        url: `/api/groups/${groupId}/members`,
        headers,
        payload: { memberIds: [invitedId, invitedId] },
      })
    ).json().members,
  ).toHaveLength(1);
  expect(
    (
      await database
        .selectFrom("settings")
        .select("value")
        .where("key", "=", "visibility.generation")
        .executeTakeFirstOrThrow()
    ).value,
  ).toBe("2");
  expect(
    (
      await app.inject({
        method: "PUT",
        url: `/api/groups/${groupId}/members`,
        headers,
        payload: { memberIds: [removedId] },
      })
    ).statusCode,
  ).toBe(400);
}

type ExpectRemovedGroupMembershipOptions = {
  database: DatabaseExecutor;
  groupId: string;
  app: FastifyInstance;
  headers: Readonly<{ cookie: string }>;
};

/** Checks removed group membership. */
export async function expectRemovedGroupMembership(
  options: Readonly<ExpectRemovedGroupMembershipOptions>,
): Promise<void> {
  const { database, groupId, app, headers } = options;
  expect(
    await database
      .selectFrom("group_members")
      .selectAll()
      .where("group_id", "=", groupId)
      .execute(),
  ).toHaveLength(1);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/groups/${createId()}`,
        headers,
        payload: { name: "Missing" },
      })
    ).json().error,
  ).toBe("groups_not_found");
}

/** Checks group audit kinds. */
export function expectGroupAuditKinds(
  options: Readonly<{ events: ReadonlyArray<Database["activity_events"]> }>,
): void {
  const { events } = options;
  expect(
    events.map((event) => {
      return event.kind;
    }),
  ).toEqual([
    "group_created",
    "group_created",
    "group_renamed",
    "group_membership_changed",
  ]);
  expect(events[1]?.subject_label).toBe("Invited");
  expect(JSON.parse(events[2]?.detail_json ?? "null")).toEqual({
    fromName: "Invited",
    toName: "Friends",
  });
}

type RoleSelectedGroupFixtureResult = {
  uploader: SignedInMember;
  viewer: SignedInMember;
  group: AdminGroupDto;
  app: FastifyInstance;
  close: () => Promise<void>;
};

/** Provides groups catalog fixtures and request controls. */
export async function prepareRoleSelectedGroupFixture(): Promise<RoleSelectedGroupFixtureResult> {
  const { app, database, close } = await createOwnedTestApp();
  const admin = await insertSignedInMember({
    database,
    member: { role: "admin" },
  });
  const uploader = await insertSignedInMember({
    database,
    token: "uploader",
    member: { role: "uploader" },
  });
  const viewer = await insertSignedInMember({
    database,
    token: "viewer",
    member: { role: "viewer" },
  });
  const created = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers: { cookie: admin.cookie },
    payload: { name: "Cousins", memberIds: [viewer.memberId] },
  });
  expect(created.statusCode).toBe(201);
  const group = created.json();
  await expectRoleSelectedGroups({ app, admin, group, uploader });
  return { uploader, viewer, group, app, close };
}

type GroupMutationFixtureResult = {
  app: FastifyInstance;
  headers: { cookie: string };
  invitedId: string;
  database: DatabaseExecutor;
  removedId: string;
  close: () => Promise<void>;
};

/** Provides groups catalog fixtures and request controls. */
export async function prepareGroupMutationFixture(): Promise<GroupMutationFixtureResult> {
  const { app, database, close } = await createOwnedTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const admin = await insertSignedInMember({
    database,
    member: { role: "admin" },
  });
  const headers = { cookie: admin.cookie };
  const invitedId = await insertMember(database, { status: "invited" });
  const removedId = await insertMember(database, { status: "removed" });
  const empty = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers,
    payload: { name: "  Café   family  " },
  });
  await expectEmptyGroupMembership({ empty, database, app, headers });
  await Promise.all(
    [removedId, createId()].map(async (memberId) => {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/groups",
            headers,
            payload: { name: "Invalid", memberIds: [memberId] },
          })
        ).statusCode,
      ).toBe(400);
    }),
  );
  return { app, headers, invitedId, database, removedId, close };
}

type CountedGroupFixtureResult = {
  counted: QueryCountingDatabase;
  groupId: string;
  database: DatabaseExecutor;
  admin: SignedInMember;
  viewer: Viewer;
  close: () => Promise<void>;
};

/** Provides groups catalog fixtures and request controls. */
export async function prepareCountedGroupFixture(): Promise<CountedGroupFixtureResult> {
  const { database, close } = await createOwnedTestApp();
  const admin = await insertSignedInMember({
    database,
    member: { role: "admin" },
  });
  const viewer = {
    memberId: admin.memberId,
    sessionId: admin.sessionId,
    role: "admin" as const,
    isAdmin: true,
    visibleRuleIds: [],
  };
  const groupId = await insertGroup(database);
  const onlyId = await insertVisibilityRule(database, { mode: "only" });
  const exceptId = await insertVisibilityRule(database, { mode: "except" });
  await insertVisibilityRuleSubject(database, { ruleId: onlyId, groupId });
  await insertVisibilityRuleSubject(database, { ruleId: exceptId, groupId });
  await Promise.all(
    [onlyId, onlyId, exceptId].map((ruleId, index) => {
      return insertItem(database, {
        uploadedBy: admin.memberId,
        visibility_rule_id: ruleId,
        seq: index,
      });
    }),
  );
  const counted = makeQueryCountingDatabaseFromDatabase(database);
  counted.reset();
  const initial = await readGroups({ database: counted.database, viewer });
  expect(initial).toMatchObject({
    shape: "admin",
    groups: [{ usedByOnlyRules: 2, usedByExceptRules: 1 }],
  });
  expect(counted.getQueryCount()).toBe(3);
  counted.reset();
  return { counted, groupId, database, admin, viewer, close };
}
