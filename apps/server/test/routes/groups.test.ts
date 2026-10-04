import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertMember,
  insertGroup,
  insertGroupMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  insertItem,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { readGroups } from "../../src/administration/readGroups.ts";
import { readGroupUsage } from "../../src/administration/readGroupUsage.ts";
import { createId } from "../../src/db/createId.ts";

describe("groups", () => {
  it("selects admin and picker rows, forbids viewers and anonymous callers", async () => {
    const { app, database, close } = await createTestApp();
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
    await Promise.all(
      [uploader.cookie, viewer.cookie, undefined].map(async (cookie) => {
        const expectedStatus = cookie ? 403 : 401;
        const requests = [
          {
            method: "POST" as const,
            url: "/api/groups",
            payload: { name: "Forbidden" },
          },
          {
            method: "PATCH" as const,
            url: `/api/groups/${group.groupId}`,
            payload: { name: "Forbidden" },
          },
          {
            method: "PUT" as const,
            url: `/api/groups/${group.groupId}/members`,
            payload: { memberIds: [] },
          },
          { method: "DELETE" as const, url: `/api/groups/${group.groupId}` },
          { method: "GET" as const, url: `/api/groups/${group.groupId}/usage` },
        ];
        await Promise.all(
          requests.map(async (request) => {
            expect(
              (
                await app.inject({
                  ...request,
                  headers: cookie ? { cookie } : {},
                })
              ).statusCode,
            ).toBe(expectedStatus);
          }),
        );
      }),
    );
    expect(
      (
        await app.inject({
          url: "/api/groups",
          headers: { cookie: viewer.cookie },
        })
      ).json().error,
    ).toBe("groups_forbidden");
    expect((await app.inject({ url: "/api/groups" })).statusCode).toBe(401);
    await close();
  });
  it("normalizes names, deduplicates invited members, rejects removed members, and follows generation triggers", async () => {
    const { app, database, close } = await createTestApp({
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
    const created = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers,
      payload: { name: "Invited", memberIds: [invitedId, invitedId] },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().members).toHaveLength(1);
    const groupId = created.json().groupId;
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/groups/${groupId}`,
          headers,
          payload: { name: "Cafe\u0301 family" },
        })
      ).json().error,
    ).toBe("groups_name_taken");
    const rename = await app.inject({
      method: "PATCH",
      url: `/api/groups/${groupId}`,
      headers,
      payload: { name: "Friends" },
    });
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
    const events = await database
      .selectFrom("activity_events")
      .selectAll()
      .orderBy("id")
      .execute();
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
    await close();
  });
});

it("counts items in both directions with fixed batch query costs as groups grow", async () => {
  const { database, close } = await createTestApp();
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
  await readGroupUsage({
    database: counted.database,
    groupId,
    secret: "test",
    now: NOW,
  });
  const usageQueryCount = counted.getQueryCount();
  await Promise.all(
    Array.from({ length: 10 }, async (_, index) => {
      const addedId = await insertGroup(database, { name: `Family ${index}` });
      await insertGroupMember(database, {
        groupId: addedId,
        memberId: admin.memberId,
      });
      const ruleId = await insertVisibilityRule(database, { mode: "only" });
      await insertVisibilityRuleSubject(database, { ruleId, groupId });
      await insertVisibilityRuleSubject(database, { ruleId, groupId: addedId });
      await insertItem(database, {
        uploadedBy: admin.memberId,
        visibility_rule_id: ruleId,
        seq: index + 3,
      });
    }),
  );
  counted.reset();
  const expanded = await readGroups({ database: counted.database, viewer });
  expect(counted.getQueryCount()).toBe(3);
  expect(expanded.groups).toHaveLength(11);
  counted.reset();
  const usage = await readGroupUsage({
    database: counted.database,
    groupId,
    secret: "test",
    now: NOW,
  });
  expect(counted.getQueryCount()).toBe(usageQueryCount);
  expect(usage.rules).toHaveLength(12);
  expect(usage.narrowingItemCount).toBe(12);
  expect(usage.wideningItemCount).toBe(1);
  await close();
});
