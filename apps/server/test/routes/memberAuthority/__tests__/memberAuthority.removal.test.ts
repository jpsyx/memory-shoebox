import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import {
  insertMember,
  insertSession,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMemberAuthorityFixture,
  expectRetainedMemberAuthorship,
  prepareRemovedMemberFixture,
} from "./memberAuthorityTestHelpers.ts";

describe("member authority", () => {
  it("allows self demotion with a second active admin and changes authority immediately", async () => {
    const { app, database, admin, mutate, close } =
      await createMemberAuthorityFixture();
    await insertMember(database, { role: "admin" });
    const response = await mutate({
      method: "PATCH",
      memberId: admin.memberId,
      role: "uploader",
    });
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

  it("removes self, revokes all devices/invitations and groups, preserves historical authorship and actor device label", async () => {
    const { database, commentId, admin, groupId, close } =
      await prepareRemovedMemberFixture();
    await expectRetainedMemberAuthorship({ database, commentId, admin });
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
    const { database, mutate, close } = await createMemberAuthorityFixture();
    const memberId = await insertMember(database);
    expect(
      (await mutate({ method: "DELETE", memberId: memberId })).statusCode,
    ).toBe(200);
    expect(
      (await mutate({ method: "DELETE", memberId: memberId })).json().error,
    ).toBe("members_already_removed");
    expect(
      (await mutate({ method: "PATCH", memberId: memberId })).json().error,
    ).toBe("members_not_active");
    await close();
  });

  it("rolls back removal and audit when visibility invalidation fails", async () => {
    const { database, mutate, close } = await createMemberAuthorityFixture();
    const memberId = await insertMember(database);
    await insertSession(database, { memberId });
    await sql`CREATE TRIGGER reject_generation BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT, 'forced generation failure'); END`.execute(
      database,
    );
    expect(
      (await mutate({ method: "DELETE", memberId: memberId })).statusCode,
    ).toBe(500);
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
});
