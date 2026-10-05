import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import {
  startMemberAuthorityWorker,
  stopMemberAuthorityWorkers,
} from "./memberAuthorityWorkerHelpers/memberAuthorityWorkerHelpers.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertMember,
  insertSession,
  insertGroup,
  insertGroupMember,
  insertInvitation,
  insertItem,
  insertComment,
  insertPerson,
  insertItemPerson,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";

async function _fixture() {
  const fixture = await createTestApp({
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
    mutate: (method: "PATCH" | "DELETE", memberId: string, role = "viewer") => {
      return fixture.app.inject({
        method,
        url: `/api/members/${memberId}`,
        headers: { cookie: admin.cookie },
        ...(method === "PATCH" ? { payload: { role } } : {}),
      });
    },
  };
}

describe("member authority", () => {
  it.each(["PATCH", "DELETE"] as const)(
    "guards the last active admin for %s and rolls back all writes",
    async (method) => {
      const { database, admin, mutate, close } = await _fixture();
      await insertMember(database, { role: "admin", status: "invited" });
      const groupId = await insertGroup(database);
      await insertGroupMember(database, { groupId, memberId: admin.memberId });
      const response = await mutate(method, admin.memberId);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "members_last_admin",
        details: { activeAdminCount: 0 },
      });
      expect(
        await database
          .selectFrom("members")
          .select(["role", "status"])
          .where("id", "=", admin.memberId)
          .executeTakeFirstOrThrow(),
      ).toEqual({ role: "admin", status: "active" });
      expect(
        await database.selectFrom("sessions").selectAll().execute(),
      ).toHaveLength(1);
      expect(
        await database.selectFrom("group_members").selectAll().execute(),
      ).toHaveLength(1);
      expect(
        await database.selectFrom("activity_events").selectAll().execute(),
      ).toHaveLength(0);
      expect(
        await database.selectFrom("settings").selectAll().execute(),
      ).toHaveLength(0);
      await close();
    },
  );
  it("allows self demotion with a second active admin and changes authority immediately", async () => {
    const { app, database, admin, mutate, close } = await _fixture();
    await insertMember(database, { role: "admin" });
    const response = await mutate("PATCH", admin.memberId, "uploader");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      role: "uploader",
      status: "active",
    });
    expect(
      (
        await app.inject({
          url: "/api/settings",
          headers: { cookie: admin.cookie },
        })
      ).statusCode,
    ).toBe(403);
    const event = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event.kind).toBe("member_role_changed");
    expect(JSON.parse(event.detail_json ?? "null")).toEqual({
      fromRole: "admin",
      toRole: "uploader",
    });
    expect(
      (
        await database
          .selectFrom("settings")
          .select("value")
          .where("key", "=", "visibility.generation")
          .executeTakeFirstOrThrow()
      ).value,
    ).toBe("1");
    await close();
  });
  it("changes an invited admin's offered role without counting them as active", async () => {
    const { database, mutate, close } = await _fixture();
    const invitedId = await insertMember(database, {
      role: "admin",
      status: "invited",
      joined_at: null,
    });
    expect((await mutate("PATCH", invitedId)).statusCode).toBe(200);
    await close();
  });
  it("removes self, revokes all devices/invitations and groups, preserves historical authorship and actor device label", async () => {
    const { app, database, admin, mutate, close } = await _fixture();
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
    const response = await mutate("DELETE", admin.memberId);
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
      await database
        .selectFrom("visibility_rule_subjects")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
    const event = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event).toMatchObject({
      kind: "member_removed",
      actor_label: "Abuela Rosa",
      device_label: "A phone",
    });
    expect(JSON.parse(event.detail_json ?? "null")).toEqual({
      groups: [{ groupId, name: "Cousins" }],
      sessionsRevoked: 2,
    });
    await close();
  });
  it("keeps double removal a conflict and refuses role changes to removed identities", async () => {
    const { database, mutate, close } = await _fixture();
    const memberId = await insertMember(database);
    expect((await mutate("DELETE", memberId)).statusCode).toBe(200);
    expect((await mutate("DELETE", memberId)).json().error).toBe(
      "members_already_removed",
    );
    expect((await mutate("PATCH", memberId)).json().error).toBe(
      "members_not_active",
    );
    await close();
  });
  it.each(["PATCH", "DELETE"] as const)(
    "refuses unknown and unauthorized %s requests",
    async (method) => {
      const { app, database, mutate, close } = await _fixture();
      expect((await mutate(method, createId())).json().error).toBe(
        "members_not_found",
      );
      const viewer = await insertSignedInMember({
        database,
        token: "viewer",
        member: { role: "viewer" },
      });
      await Promise.all(
        [undefined, viewer.cookie].map(async (cookie) => {
          expect(
            (
              await app.inject({
                method,
                url: `/api/members/${viewer.memberId}`,
                headers: cookie ? { cookie } : {},
                ...(method === "PATCH" ? { payload: { role: "admin" } } : {}),
              })
            ).statusCode,
          ).toBe(cookie ? 403 : 401);
        }),
      );
      await close();
    },
  );
  it("rolls back removal and audit when visibility invalidation fails", async () => {
    const { database, mutate, close } = await _fixture();
    const memberId = await insertMember(database);
    await insertSession(database, { memberId });
    await sql`CREATE TRIGGER reject_generation BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT, 'forced generation failure'); END`.execute(
      database,
    );
    expect((await mutate("DELETE", memberId)).statusCode).toBe(500);
    expect(
      (
        await database
          .selectFrom("members")
          .select("status")
          .where("id", "=", memberId)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe("active");
    expect(
      await database.selectFrom("sessions").selectAll().execute(),
    ).toHaveLength(2);
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toHaveLength(0);
    await close();
  });
  it.each(["changeMemberRole", "removeMember"])(
    "serializes concurrent %s attempts on separate process/file connections",
    async (action) => {
      const directory = await mkdtemp(join(tmpdir(), "shoebox-authority-"));
      let ownedDatabase: ReturnType<typeof createDatabase> | undefined;
      let context: Awaited<ReturnType<typeof createTestApp>> | undefined;
      const workers: Array<ReturnType<typeof startMemberAuthorityWorker>> = [];
      try {
        const databasePath = join(directory, "catalog.sqlite");
        ownedDatabase = createDatabase(databasePath);
        context = await createTestApp({ database: ownedDatabase });
        const database = ownedDatabase;
        const first = await insertSignedInMember({
          database,
          token: "first",
          member: { role: "admin" },
        });
        const second = await insertSignedInMember({
          database,
          token: "second",
          member: { role: "admin" },
        });
        [first, second].forEach((member) => {
          workers.push(
            startMemberAuthorityWorker({
              databasePath,
              memberId: member.memberId,
              sessionId: member.sessionId,
              action,
            }),
          );
        });
        await Promise.all(
          workers.map((worker) => {
            return worker.ready;
          }),
        );
        workers.forEach((worker) => {
          return worker.child.stdin.end("go");
        });
        expect(
          (
            await Promise.all(
              workers.map((worker) => {
                return worker.result;
              }),
            )
          ).sort(),
        ).toEqual(["members_last_admin", "ok"]);
        const admins = await database
          .selectFrom("members")
          .select("id")
          .where("role", "=", "admin")
          .where("status", "=", "active")
          .execute();
        expect(admins.length).toBeGreaterThanOrEqual(1);
      } finally {
        try {
          await stopMemberAuthorityWorkers(workers);
        } finally {
          try {
            await context?.app.close();
          } finally {
            try {
              await ownedDatabase?.destroy();
            } finally {
              await rm(directory, { recursive: true, force: true });
            }
          }
        }
      }
    },
    15000,
  );
});
