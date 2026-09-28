import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { runInvitationLapse } from "../../src/jobs/runInvitationLapse.ts";
import { runSessionSweep } from "../../src/jobs/runSessionSweep.ts";
import { runSignInCodeSweep } from "../../src/jobs/runSignInCodeSweep.ts";
import { runVisibilityRuleSweep } from "../../src/jobs/runVisibilityRuleSweep.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  NOW,
  insertInvitation,
  insertMember,
  insertSession,
  shiftDays,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

async function _createEmptyDatabase(): Promise<Kysely<Database>> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return database;
}

/**
 * Inserts one `only` rule with no subjects and returns its id.
 *
 * A rule nothing references yet, so that each test below decides for itself
 * what points at it.
 */
async function _insertVisibilityRule(
  database: Kysely<Database>,
): Promise<string> {
  const id = createId();
  await database
    .insertInto("visibility_rules")
    .values({
      id,
      mode: "only",
      subject_digest: `digest-${id}`,
      created_at: NOW,
    })
    .execute();
  return id;
}

/** Inserts one photograph on the given rule, every NOT NULL column filled. */
async function _insertItem(
  database: Kysely<Database>,
  options: { uploadedBy: string; visibilityRuleId: string },
): Promise<string> {
  const id = createId();
  await database
    .insertInto("items")
    .values({
      id,
      kind: "photo",
      captured_at: NOW,
      captured_at_offset_minutes: null,
      captured_on: "2026-09-27",
      capture_source: "uploader_set",
      original_captured_at: NOW,
      seq: 1,
      uploaded_by: options.uploadedBy,
      upload_session_id: null,
      visibility_rule_id: options.visibilityRuleId,
      burst_id: null,
      burst_index: null,
      width: 4032,
      height: 3024,
      duration_ms: null,
      byte_size: 2_486_912,
      content_type: "image/jpeg",
      checksum: null,
      original_filename: null,
      alt_text: null,
      created_at: NOW,
    })
    .execute();
  return id;
}

describe("session-sweep", () => {
  it("does nothing against an empty table", async () => {
    const database = await _createEmptyDatabase();

    const summary = await runSessionSweep({ database, now: NOW });

    expect(summary.deletedCount).toBe(0);
    await database.destroy();
  });

  it("deletes expired sessions and leaves live ones", async () => {
    const database = await _createEmptyDatabase();
    const memberId = await insertMember(database);
    await insertSession(database, {
      memberId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });
    await insertSession(database, {
      memberId,
      expires_at: shiftDays({ instant: NOW, days: 10 }),
    });

    const first = await runSessionSweep({ database, now: NOW });
    const second = await runSessionSweep({ database, now: NOW });

    expect(first.deletedCount).toBe(1);
    expect(second.deletedCount).toBe(0);
    expect(
      await database.selectFrom("sessions").select("id").execute(),
    ).toHaveLength(1);
    await database.destroy();
  });
});

describe("sign-in-code-sweep", () => {
  it("does nothing against an empty table", async () => {
    const database = await _createEmptyDatabase();

    expect(
      (await runSignInCodeSweep({ database, now: NOW })).deletedCount,
    ).toBe(0);
    await database.destroy();
  });

  it("deletes expired and consumed codes, twice over without change", async () => {
    const database = await _createEmptyDatabase();
    const insertCode = async (
      overrides: Partial<Database["sign_in_codes"]>,
    ) => {
      await database
        .insertInto("sign_in_codes")
        .values({
          id: createId(),
          email: "rosa@example.com",
          member_id: null,
          code_hash: "hmac",
          attempts: 0,
          max_attempts: 3,
          expires_at: shiftMinutes({ instant: NOW, minutes: 10 }),
          consumed_at: null,
          invalidated_at: null,
          created_at: NOW,
          ...overrides,
        })
        .execute();
    };
    await insertCode({
      expires_at: shiftMinutes({ instant: NOW, minutes: -1 }),
    });
    await insertCode({ consumed_at: NOW });
    await insertCode({});

    const first = await runSignInCodeSweep({ database, now: NOW });
    const second = await runSignInCodeSweep({ database, now: NOW });

    expect(first.deletedCount).toBe(2);
    expect(second.deletedCount).toBe(0);
    await database.destroy();
  });
});

describe("invitation-lapse", () => {
  it("does nothing against an empty table", async () => {
    const database = await _createEmptyDatabase();

    expect((await runInvitationLapse({ database, now: NOW })).lapsedCount).toBe(
      0,
    );
    await database.destroy();
  });

  it("removes an invited member whose latest invitation has expired", async () => {
    const database = await _createEmptyDatabase();
    const adminId = await insertMember(database, { role: "admin" });
    const invitedId = await insertMember(database, { status: "invited" });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });

    const first = await runInvitationLapse({ database, now: NOW });
    const second = await runInvitationLapse({ database, now: NOW });

    expect(first.lapsedCount).toBe(1);
    expect(second.lapsedCount).toBe(0);
    const member = await database
      .selectFrom("members")
      .select(["status", "removed_at"])
      .where("id", "=", invitedId)
      .executeTakeFirstOrThrow();
    expect(member.status).toBe("removed");
    expect(member.removed_at).toBe(NOW);
    await database.destroy();
  });

  it("leaves a member whose latest invitation is a live resend", async () => {
    const database = await _createEmptyDatabase();
    const adminId = await insertMember(database, { role: "admin" });
    const invitedId = await insertMember(database, { status: "invited" });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      expires_at: shiftDays({ instant: NOW, days: 7 }),
    });

    await runInvitationLapse({ database, now: NOW });

    const member = await database
      .selectFrom("members")
      .select("status")
      .where("id", "=", invitedId)
      .executeTakeFirstOrThrow();
    expect(member.status).toBe("invited");
    await database.destroy();
  });

  it("leaves a member whose expired invitation was revoked", async () => {
    const database = await _createEmptyDatabase();
    const adminId = await insertMember(database, { role: "admin" });
    const invitedId = await insertMember(database, { status: "invited" });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
      revoked_at: shiftDays({ instant: NOW, days: -2 }),
    });

    await runInvitationLapse({ database, now: NOW });

    const member = await database
      .selectFrom("members")
      .select("status")
      .where("id", "=", invitedId)
      .executeTakeFirstOrThrow();
    expect(member.status).toBe("invited");
    await database.destroy();
  });
  it("leaves a member whose expired invitation was accepted", async () => {
    const database = await _createEmptyDatabase();
    const adminId = await insertMember(database, { role: "admin" });
    const invitedId = await insertMember(database, { status: "invited" });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
      accepted_at: shiftDays({ instant: NOW, days: -2 }),
    });

    const summary = await runInvitationLapse({ database, now: NOW });

    expect(summary.lapsedCount).toBe(0);
    const member = await database
      .selectFrom("members")
      .select("status")
      .where("id", "=", invitedId)
      .executeTakeFirstOrThrow();
    expect(member.status).toBe("invited");
    await database.destroy();
  });
});

describe("visibility-rule-sweep", () => {
  it("does nothing against a fresh database, and never touches the everyone rule", async () => {
    const database = await _createEmptyDatabase();

    const first = await runVisibilityRuleSweep({ database });
    const second = await runVisibilityRuleSweep({ database });

    expect(first.deletedCount).toBe(0);
    expect(second.deletedCount).toBe(0);
    expect(
      await database
        .selectFrom("visibility_rules")
        .select("id")
        .where("id", "=", EVERYONE_VISIBILITY_RULE_ID)
        .executeTakeFirst(),
    ).toBeDefined();
    await database.destroy();
  });

  it("deletes a rule nothing references, and its subjects with it", async () => {
    const database = await _createEmptyDatabase();
    const memberId = await insertMember(database);
    const ruleId = createId();
    await database
      .insertInto("visibility_rules")
      .values({
        id: ruleId,
        mode: "only",
        subject_digest: "member:one",
        created_at: NOW,
      })
      .execute();
    await database
      .insertInto("visibility_rule_subjects")
      .values({
        id: createId(),
        rule_id: ruleId,
        subject_type: "member",
        member_id: memberId,
        group_id: null,
      })
      .execute();

    const summary = await runVisibilityRuleSweep({ database });

    expect(summary.deletedCount).toBe(1);
    expect(
      await database
        .selectFrom("visibility_rule_subjects")
        .select("id")
        .execute(),
    ).toHaveLength(0);
    await database.destroy();
  });

  it("leaves a rule an item references", async () => {
    const database = await _createEmptyDatabase();
    const memberId = await insertMember(database);
    const ruleId = await _insertVisibilityRule(database);
    await _insertItem(database, {
      uploadedBy: memberId,
      visibilityRuleId: ruleId,
    });

    const summary = await runVisibilityRuleSweep({ database });

    expect(summary.deletedCount).toBe(0);
    expect(
      await database
        .selectFrom("visibility_rules")
        .select("id")
        .where("id", "=", ruleId)
        .executeTakeFirst(),
    ).toBeDefined();
    await database.destroy();
  });

  it("leaves a rule only an upload session references", async () => {
    const database = await _createEmptyDatabase();
    const memberId = await insertMember(database);
    const ruleId = await _insertVisibilityRule(database);
    await database
      .insertInto("upload_sessions")
      .values({
        id: createId(),
        uploaded_by: memberId,
        state: "draft",
        visibility_rule_id: ruleId,
        file_count: 0,
        total_bytes: 0,
        client_timezone: "America/Bogota",
        created_at: NOW,
        committed_at: null,
        last_activity_at: NOW,
        settled_at: null,
        notified_at: null,
        notified_member_count: null,
      })
      .execute();

    const summary = await runVisibilityRuleSweep({ database });

    expect(summary.deletedCount).toBe(0);
    expect(
      await database
        .selectFrom("visibility_rules")
        .select("id")
        .where("id", "=", ruleId)
        .executeTakeFirst(),
    ).toBeDefined();
    await database.destroy();
  });
});
