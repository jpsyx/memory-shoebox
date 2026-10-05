import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createId } from "../../../../src/db/createId.ts";
import {
  NOW,
  insertGroup,
  insertGroupMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { createGroupDeletionFixture } from "./groupDeletionTestHelpers.ts";

describe("group deletion", () => {
  it.each(["expiry", "tampering", "wrong group"])(
    "refuses %s tokens",
    async (change) => {
      const { database, groupId, usage, remove, setNow, close } =
        await createGroupDeletionFixture();
      const preview = await usage();
      const token =
        change === "tampering"
          ? `${preview.confirmationToken!.slice(0, -2)}xx`
          : preview.confirmationToken!;
      let targetId = groupId;
      if (change === "expiry") {
        setNow(new Date(Date.parse(NOW) + 600_001).toISOString());
      }
      if (change === "wrong group") {
        targetId = await insertGroup(database, { name: "Other" });
        const ruleId = await insertVisibilityRule(database, { mode: "except" });
        await insertVisibilityRuleSubject(database, {
          ruleId,
          groupId: targetId,
        });
      }
      expect(
        (await remove({ token: token, targetId: targetId })).json().error,
      ).toBe("groups_usage_changed");
      await close();
    },
  );

  it("requires zero-item referenced rules to be confirmed and deletes unused groups without tokens", async () => {
    const { database, usage, remove, close } =
      await createGroupDeletionFixture();
    await database.deleteFrom("items").execute();
    const preview = await usage();
    expect(preview.rules).toHaveLength(2);
    expect(preview.wideningItemCount).toBe(0);
    expect(preview.membersGainingAccess).toEqual([]);
    expect((await remove()).json().error).toBe("groups_confirmation_required");
    expect(
      (await remove({ token: preview.confirmationToken! })).statusCode,
    ).toBe(204);
    const unusedId = await insertGroup(database, { name: "Unused" });
    expect(
      (await remove({ token: undefined, targetId: unusedId })).statusCode,
    ).toBe(204);
    expect(
      (await remove({ token: undefined, targetId: createId() })).json().error,
    ).toBe("groups_not_found");
    await close();
  });

  it("subtracts direct and other-group subjects and exempts admins and own uploaders from access deltas", async () => {
    const {
      database,
      admin,
      viewer,
      groupId,
      exceptId,
      onlyId,
      exceptItemId,
      usage,
      close,
    } = await createGroupDeletionFixture();
    const overlappingId = await insertGroup(database, { name: "Overlapping" });
    await insertGroupMember(database, {
      groupId: overlappingId,
      memberId: viewer.memberId,
    });
    await insertGroupMember(database, { groupId, memberId: admin.memberId });
    await insertVisibilityRuleSubject(database, {
      ruleId: onlyId,
      memberId: viewer.memberId,
    });
    await insertVisibilityRuleSubject(database, {
      ruleId: exceptId,
      groupId: overlappingId,
    });
    expect((await usage()).membersLosingAccess).toEqual([]);
    expect((await usage()).membersGainingAccess).toEqual([]);
    await database
      .deleteFrom("visibility_rule_subjects")
      .where("group_id", "=", overlappingId)
      .execute();
    await database
      .updateTable("items")
      .set({ uploaded_by: viewer.memberId })
      .where("id", "=", exceptItemId)
      .execute();
    expect((await usage()).membersGainingAccess).toEqual([]);
    await close();
  });
});
describe("groupDeletion", () => {
  it("maps SQLite RESTRICT refusal and rolls back all rewritten subjects", async () => {
    const { database, groupId, onlyId, usage, remove, close } =
      await createGroupDeletionFixture();
    const preview = await usage();
    const subjectId = createId();
    await sql`CREATE TRIGGER restore_group_reference AFTER UPDATE ON visibility_rules
    WHEN NEW.id = ${sql.lit(onlyId)} BEGIN
      INSERT INTO visibility_rule_subjects(id, rule_id, subject_type, member_id, group_id)
      VALUES (${sql.lit(subjectId)}, ${sql.lit(onlyId)}, 'group', NULL, ${sql.lit(groupId)});
    END`.execute(database);
    const response = await remove({ token: preview.confirmationToken! });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("groups_delete_restricted");
    expect(
      await database
        .selectFrom("groups")
        .selectAll()
        .where("id", "=", groupId)
        .execute(),
    ).toHaveLength(1);
    expect(
      await database
        .selectFrom("visibility_rule_subjects")
        .selectAll()
        .where("group_id", "=", groupId)
        .execute(),
    ).toHaveLength(2);
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);
    await close();
  });

  it("keeps an empty only rule readable by its uploader and admin", async () => {
    const { app, database, admin, viewer, onlyItemId, usage, remove, close } =
      await createGroupDeletionFixture();
    await database
      .updateTable("items")
      .set({ uploaded_by: viewer.memberId })
      .where("id", "=", onlyItemId)
      .execute();
    const preview = await usage();
    expect(preview.membersLosingAccess).toEqual([]);
    expect(
      (await remove({ token: preview.confirmationToken! })).statusCode,
    ).toBe(204);
    await Promise.all(
      [viewer.cookie, admin.cookie].map(async (cookie) => {
        expect(
          (
            await app.inject({
              url: `/api/items/${onlyItemId}`,
              headers: { cookie },
            })
          ).statusCode,
        ).toBe(200);
      }),
    );
    await close();
  });
});
