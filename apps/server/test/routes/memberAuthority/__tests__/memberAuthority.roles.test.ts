import { describe, expect, it } from "vitest";
import { createId } from "../../../../src/db/createId.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertGroup,
  insertGroupMember,
  insertMember,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { createMemberAuthorityFixture } from "./memberAuthorityTestHelpers.ts";

describe("member authority", () => {
  it.each(["PATCH", "DELETE"] as const)(
    "guards the last active admin for %s and rolls back all writes",
    async (method) => {
      const { database, admin, mutate, close } =
        await createMemberAuthorityFixture();
      await insertMember(database, { role: "admin", status: "invited" });
      const groupId = await insertGroup(database);
      await insertGroupMember(database, { groupId, memberId: admin.memberId });
      const response = await mutate({
        method: method,
        memberId: admin.memberId,
      });
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

  it("accepts a role-change request for an invited admin", async () => {
    const { database, mutate, close } = await createMemberAuthorityFixture();
    const invitedId = await insertMember(database, {
      role: "admin",
      status: "invited",
      joined_at: null,
    });
    expect(
      (await mutate({ method: "PATCH", memberId: invitedId })).statusCode,
    ).toBe(200);
    await close();
  });

  it.each(["PATCH", "DELETE"] as const)(
    "refuses unknown and unauthorized %s requests",
    async (method) => {
      const { app, database, mutate, close } =
        await createMemberAuthorityFixture();
      expect(
        (await mutate({ method: method, memberId: createId() })).json().error,
      ).toBe("members_not_found");
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
});
