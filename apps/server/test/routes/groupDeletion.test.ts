import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import {
  apiErrorSchema,
  groupUsageResponseSchema,
} from "@memory-shoebox/shared";
import type { TestApp } from "../helpers/createTestApp.ts";
import type { DatabaseExecutor } from "../../src/db/types/db.types.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertRendition,
  insertGroup,
  insertGroupMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  insertItem,
  insertMember,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { createId } from "../../src/db/createId.ts";
import { getVisibilityRuleFromSubjects } from "../../src/items/getVisibilityRuleFromSubjects.ts";

async function _seedGroupAccess(
  database: DatabaseExecutor,
  options: { adminId: string; viewerId: string },
) {
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

function _makeGroupRequests(fixture: TestApp, groupId: string, cookie: string) {
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
  const remove = (token?: string, targetId = groupId) => {
    return app.inject({
      method: "DELETE",
      url: `/api/groups/${targetId}${token ? `?confirmationToken=${encodeURIComponent(token)}` : ""}`,
      headers,
    });
  };
  return { usage, remove };
}

async function _fixture() {
  let now = NOW;
  const fixture = await createTestApp({
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
  const catalog = await _seedGroupAccess(database, {
    adminId: admin.memberId,
    viewerId: viewer.memberId,
  });
  const requests = _makeGroupRequests(fixture, catalog.groupId, admin.cookie);
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

describe("group deletion", () => {
  it("requires confirmation, preserves empty only rules and reveals except items on the same cookie", async () => {
    const fixture = await _fixture();
    const {
      app,
      database,
      viewer,
      groupId,
      onlyId,
      exceptId,
      onlyItemId,
      exceptItemId,
      usage,
      remove,
      close,
    } = fixture;
    const read = (itemId: string) => {
      return app.inject({
        url: `/api/items/${itemId}`,
        headers: { cookie: viewer.cookie },
      });
    };
    const beforeExceptItem = await read(exceptItemId);
    expect(beforeExceptItem.statusCode).toBe(404);
    const preview = await usage();
    expect(preview).toMatchObject({
      narrowingItemCount: 1,
      wideningItemCount: 1,
      emptyAllowListItemCount: 1,
      membersLosingAccess: [{ memberId: viewer.memberId }],
      membersGainingAccess: [{ memberId: viewer.memberId }],
    });
    const unconfirmedDelete = await remove();
    expect(unconfirmedDelete.json().error).toBe("groups_confirmation_required");
    expect(apiErrorSchema.parse(unconfirmedDelete.json()).details).toEqual(
      preview,
    );
    expect((await remove(preview.confirmationToken!)).statusCode).toBe(204);
    const afterConfirmedDeletion = await read(exceptItemId);
    expect(afterConfirmedDeletion.statusCode).toBe(200);
    expect((await read(onlyItemId)).statusCode).toBe(404);
    const remainingOnlyRule = await database
      .selectFrom("visibility_rules")
      .selectAll()
      .where("id", "=", onlyId)
      .executeTakeFirstOrThrow();
    expect(remainingOnlyRule.mode).toBe("only");
    expect(remainingOnlyRule.subject_digest).toBe("");
    const remainingOnlySubjects = await database
      .selectFrom("visibility_rule_subjects")
      .selectAll()
      .where("rule_id", "=", onlyId)
      .execute();
    expect(remainingOnlySubjects).toEqual([]);
    expect(
      (
        await database
          .selectFrom("visibility_rules")
          .selectAll()
          .where("id", "=", exceptId)
          .executeTakeFirstOrThrow()
      ).subject_digest,
    ).toBe("");
    const event = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event).toMatchObject({
      kind: "group_deleted",
      subject_label: "Cousins",
      subject_id: groupId,
    });
    expect(JSON.parse(event.detail_json!)).toMatchObject({
      rewrittenRuleIds: [onlyId, exceptId].sort(),
      narrowingItemCount: 1,
      wideningItemCount: 1,
      membersGainingAccess: [{ memberId: viewer.memberId }],
    });
    await close();
  });
  it.each([
    "subjects",
    "memberships",
    "remaining memberships",
    "role",
    "status",
    "uploader",
    "items",
    "rule assignments",
  ])("rejects changed %s despite unchanged item totals", async (change) => {
    const {
      database,
      viewer,
      otherId,
      groupId,
      onlyId,
      onlyItemId,
      exceptId,
      exceptItemId,
      usage,
      remove,
      close,
    } = await _fixture();
    let remainingGroupId: string | undefined;
    if (change === "subjects") {
      await insertVisibilityRuleSubject(database, {
        ruleId: exceptId,
        memberId: otherId,
      });
    }
    if (change === "remaining memberships") {
      remainingGroupId = await insertGroup(database, { name: "Remaining" });
      await insertGroupMember(database, {
        groupId: remainingGroupId,
        memberId: viewer.memberId,
      });
      await insertVisibilityRuleSubject(database, {
        ruleId: exceptId,
        groupId: remainingGroupId,
      });
    }
    const preview = await usage();
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
      await database
        .deleteFrom("items")
        .where("id", "=", exceptItemId)
        .execute();
      await insertItem(database, {
        uploadedBy: otherId,
        visibility_rule_id: exceptId,
        seq: 1,
      });
    }
    const changedUsageDelete = await remove(preview.confirmationToken!);
    expect(changedUsageDelete.json().error).toBe("groups_usage_changed");
    const fresh = await usage();
    expect(apiErrorSchema.parse(changedUsageDelete.json()).details).toEqual(
      fresh,
    );
    expect(fresh.wideningItemCount).toBe(1);
    expect((await remove(fresh.confirmationToken!)).statusCode).toBe(204);
    await close();
  });
  it.each(["expiry", "tampering", "wrong group"])(
    "refuses %s tokens",
    async (change) => {
      const { database, groupId, usage, remove, setNow, close } =
        await _fixture();
      const preview = await usage();
      let token = preview.confirmationToken!;
      let targetId = groupId;
      if (change === "expiry") {
        setNow(new Date(Date.parse(NOW) + 600_001).toISOString());
      }
      if (change === "tampering") {
        token = `${token.slice(0, -2)}xx`;
      }
      if (change === "wrong group") {
        targetId = await insertGroup(database, { name: "Other" });
        const ruleId = await insertVisibilityRule(database, { mode: "except" });
        await insertVisibilityRuleSubject(database, {
          ruleId,
          groupId: targetId,
        });
      }
      expect((await remove(token, targetId)).json().error).toBe(
        "groups_usage_changed",
      );
      await close();
    },
  );
  it("requires zero-item referenced rules to be confirmed and deletes unused groups without tokens", async () => {
    const { database, usage, remove, close } = await _fixture();
    await database.deleteFrom("items").execute();
    const preview = await usage();
    expect(preview.rules).toHaveLength(2);
    expect(preview.wideningItemCount).toBe(0);
    expect(preview.membersGainingAccess).toEqual([]);
    expect((await remove()).json().error).toBe("groups_confirmation_required");
    expect((await remove(preview.confirmationToken!)).statusCode).toBe(204);
    const unusedId = await insertGroup(database, { name: "Unused" });
    expect((await remove(undefined, unusedId)).statusCode).toBe(204);
    expect((await remove(undefined, createId())).json().error).toBe(
      "groups_not_found",
    );
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
    } = await _fixture();
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
  it("keeps equivalent rule identities and rolls back deletion if invalidation fails", async () => {
    const { database, viewer, groupId, onlyId, usage, remove, close } =
      await _fixture();
    const existingId = await getVisibilityRuleFromSubjects({
      transaction: database,
      mode: "only",
      subjects: [{ kind: "member", id: viewer.memberId }],
      now: NOW,
    });
    await insertVisibilityRuleSubject(database, {
      ruleId: onlyId,
      memberId: viewer.memberId,
    });
    const preview = await usage();
    await sql`CREATE TRIGGER reject_generation BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT, 'generation failure'); END`.execute(
      database,
    );
    expect((await remove(preview.confirmationToken!)).statusCode).toBe(500);
    expect(
      await database
        .selectFrom("groups")
        .selectAll()
        .where("id", "=", groupId)
        .execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);
    await sql`DROP TRIGGER reject_generation`.execute(database);
    expect((await remove(preview.confirmationToken!)).statusCode).toBe(204);
    const rules = await database
      .selectFrom("visibility_rules")
      .selectAll()
      .where("id", "in", [onlyId, existingId])
      .execute();
    expect(rules).toHaveLength(2);
    expect(rules[0]?.subject_digest).toBe(rules[1]?.subject_digest);
    expect(
      await getVisibilityRuleFromSubjects({
        transaction: database,
        mode: "only",
        subjects: [{ kind: "member", id: viewer.memberId }],
        now: NOW,
      }),
    ).toBe([onlyId, existingId].sort()[0]);
    await close();
  });
});

it("maps SQLite RESTRICT refusal and rolls back all rewritten subjects", async () => {
  const { database, groupId, onlyId, usage, remove, close } = await _fixture();
  const preview = await usage();
  const subjectId = createId();
  await sql`CREATE TRIGGER restore_group_reference AFTER UPDATE ON visibility_rules
    WHEN NEW.id = ${sql.lit(onlyId)} BEGIN
      INSERT INTO visibility_rule_subjects(id, rule_id, subject_type, member_id, group_id)
      VALUES (${sql.lit(subjectId)}, ${sql.lit(onlyId)}, 'group', NULL, ${sql.lit(groupId)});
    END`.execute(database);
  const response = await remove(preview.confirmationToken!);
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
    await _fixture();
  await database
    .updateTable("items")
    .set({ uploaded_by: viewer.memberId })
    .where("id", "=", onlyItemId)
    .execute();
  const preview = await usage();
  expect(preview.membersLosingAccess).toEqual([]);
  expect((await remove(preview.confirmationToken!)).statusCode).toBe(204);
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
