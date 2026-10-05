import { describe, expect, it } from "vitest";
import {
  expectGroupAuditKinds,
  expectGroupRenameAndMemberValidation,
  expectRemovedGroupMembership,
  prepareGroupMutationFixture,
} from "./groupsTestHelpers.ts";

describe("groups", () => {
  it("normalizes names, deduplicates invited members, rejects removed members, and follows generation triggers", async () => {
    const { app, headers, invitedId, database, removedId, close } =
      await prepareGroupMutationFixture();
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
    await expectGroupRenameAndMemberValidation({
      rename,
      database,
      app,
      groupId,
      invitedId,
      removedId,
      headers,
    });
    await expectRemovedGroupMembership({ database, groupId, app, headers });
    const events = await database
      .selectFrom("activity_events")
      .selectAll()
      .orderBy("id")
      .execute();
    expectGroupAuditKinds({ events });
    await close();
  });
});
