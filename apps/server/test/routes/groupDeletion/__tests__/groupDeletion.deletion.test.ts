import type { GroupUsageResponse } from "@memory-shoebox/shared";
import { apiErrorSchema } from "@memory-shoebox/shared";
import type { LightMyRequestResponse } from "fastify";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import type {
  Database,
  DatabaseExecutor,
} from "../../../../src/db/types/db.types.ts";
import { getVisibilityRuleFromSubjects } from "../../../../src/items/getVisibilityRuleFromSubjects.ts";
import type { SignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertVisibilityRuleSubject,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import type { GroupDeletionFixture } from "./groupDeletionTestHelpers.ts";
import {
  changeGroupUsageAuthority,
  changeGroupUsageSubjects,
  createGroupDeletionFixture,
  prepareGroupUsageChange,
} from "./groupDeletionTestHelpers.ts";

type ExpectGroupDeletionAuditOptions = {
  event: Database["activity_events"];
  groupId: string;
  onlyId: string;
  exceptId: string;
  viewer: SignedInMember;
};

function _expectGroupDeletionAudit(
  options: Readonly<ExpectGroupDeletionAuditOptions>,
): void {
  const { event, groupId, onlyId, exceptId, viewer } = options;
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
}

type ExpectFailedGroupDeletionRollbackOptions = {
  remove: (
    options?: Readonly<{ token?: string; targetId?: string }>,
  ) => Promise<LightMyRequestResponse>;
  preview: GroupUsageResponse;
  database: DatabaseExecutor;
  groupId: string;
};

async function _expectFailedGroupDeletionRollback(
  options: Readonly<ExpectFailedGroupDeletionRollbackOptions>,
): Promise<void> {
  const { remove, preview, database, groupId } = options;
  expect((await remove({ token: preview.confirmationToken! })).statusCode).toBe(
    500,
  );
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
}

async function _expectEmptyGroupRules(
  options: Readonly<{
    database: DatabaseExecutor;
    onlyId: string;
    exceptId: string;
  }>,
): Promise<void> {
  const { database, onlyId, exceptId } = options;
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
}

type GroupConsentFixtureResult = GroupDeletionFixture & {
  preview: GroupUsageResponse;
  read: (itemId: string) => Promise<LightMyRequestResponse>;
};

async function _prepareGroupConsentFixture(): Promise<GroupConsentFixtureResult> {
  const fixture = await createGroupDeletionFixture();
  const { app, viewer, exceptItemId, usage, remove } = fixture;
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
  return { ...fixture, preview, read };
}

describe("group deletion", () => {
  it("requires confirmation, preserves empty only rules and reveals except items on the same cookie", async () => {
    const {
      remove,
      preview,
      read,
      exceptItemId,
      onlyItemId,
      database,
      onlyId,
      exceptId,
      groupId,
      viewer,
      close,
    } = await _prepareGroupConsentFixture();
    expect(
      (await remove({ token: preview.confirmationToken! })).statusCode,
    ).toBe(204);
    const afterConfirmedDeletion = await read(exceptItemId);
    expect(afterConfirmedDeletion.statusCode).toBe(200);
    expect((await read(onlyItemId)).statusCode).toBe(404);
    await _expectEmptyGroupRules({ database, onlyId, exceptId });
    const event = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();
    _expectGroupDeletionAudit({ event, groupId, onlyId, exceptId, viewer });
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
    const fixture = await createGroupDeletionFixture();
    const { usage, remove, close } = fixture;
    const remainingGroupId = await prepareGroupUsageChange({ change, fixture });
    const preview = await usage();
    await changeGroupUsageSubjects({ change, fixture, remainingGroupId });
    await changeGroupUsageAuthority({ change, fixture });
    const changedUsageDelete = await remove({
      token: preview.confirmationToken!,
    });
    expect(changedUsageDelete.json().error).toBe("groups_usage_changed");
    const fresh = await usage();
    expect(apiErrorSchema.parse(changedUsageDelete.json()).details).toEqual(
      fresh,
    );
    expect(fresh.wideningItemCount).toBe(1);
    expect((await remove({ token: fresh.confirmationToken! })).statusCode).toBe(
      204,
    );
    await close();
  });

  it("keeps equivalent rule identities and rolls back deletion if invalidation fails", async () => {
    const { database, viewer, groupId, onlyId, usage, remove, close } =
      await createGroupDeletionFixture();
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
    await _expectFailedGroupDeletionRollback({
      remove,
      preview,
      database,
      groupId,
    });
    await sql`DROP TRIGGER reject_generation`.execute(database);
    expect(
      (await remove({ token: preview.confirmationToken! })).statusCode,
    ).toBe(204);
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
