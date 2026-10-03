import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { UploadSessionEmailPayload } from "@memory-shoebox/shared";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { enqueueUploadSessionEmails } from "../../src/upload/enqueueUploadSessionEmails.ts";
import {
  NOW,
  insertGroup,
  insertGroupMember,
  insertInstanceSetting,
  insertItem,
  insertMember,
  insertMilestone,
  insertUploadSession,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** A migrated database with a base URL, an uploader and one settled batch. */
async function _createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://shoebox.example.com",
  });
  const uploaderId = await insertMember(database, { display_name: "Papá" });
  const sessionId = await insertUploadSession(database, {
    uploadedBy: uploaderId,
    state: "settled",
    settled_at: NOW,
  });
  return { database, uploaderId, sessionId };
}

/** Inserts `count` items of the batch on one day, under one rule. */
async function _insertBatchItems(
  database: Kysely<Database>,
  options: {
    uploaderId: string;
    sessionId: string;
    capturedOn: string;
    count: number;
    firstSeq: number;
    visibilityRuleId?: string;
  },
): Promise<void> {
  await Promise.all(
    Array.from({ length: options.count }, (_unused, index) => {
      return insertItem(database, {
        uploadedBy: options.uploaderId,
        upload_session_id: options.sessionId,
        captured_on: options.capturedOn,
        captured_at: `${options.capturedOn}T09:00:00.000Z`,
        seq: options.firstSeq + index,
        ...(options.visibilityRuleId === undefined
          ? {}
          : { visibility_rule_id: options.visibilityRuleId }),
      });
    }),
  );
}

/** Every `upload_session` row, with its payload parsed. */
async function _readUploadEmails(database: Kysely<Database>) {
  const rows = await database
    .selectFrom("outbound_emails")
    .select(["to_member_id", "subject", "payload_json", "idempotency_key"])
    .where("kind", "=", "upload_session")
    .execute();
  return rows.map((row) => {
    return {
      memberId: row.to_member_id,
      subject: row.subject,
      idempotencyKey: row.idempotency_key,
      payload: JSON.parse(row.payload_json) as UploadSessionEmailPayload,
    };
  });
}

describe("enqueueUploadSessionEmails", () => {
  it("sends a three-week batch as one email per recipient, not one per day", async () => {
    const { database, uploaderId, sessionId } = await _createContext();
    const rosaId = await insertMember(database, { display_name: "Rosa" });
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-01",
      count: 2,
      firstSeq: 0,
    });
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-08",
      count: 1,
      firstSeq: 10,
    });
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-21",
      count: 3,
      firstSeq: 20,
    });

    const result = await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const emails = await _readUploadEmails(database);
    expect(result.recipientCount).toBe(1);
    expect(emails).toHaveLength(1);
    expect(emails[0]?.memberId).toBe(rosaId);
    expect(emails[0]?.idempotencyKey).toBe(`upload:${sessionId}:${rosaId}`);
    expect(emails[0]?.subject).toBe("Papá put up 6 photos, from 3 days");
    expect(emails[0]?.payload).toMatchObject({
      uploaderDisplayName: "Papá",
      visibleItemCount: 6,
      capturedOn: "2026-09-21",
      visibleDayCount: 3,
      firstCapturedOn: "2026-09-01",
      lastCapturedOn: "2026-09-21",
      dayUrl: "https://shoebox.example.com/?at=2026-09-21",
      milestoneName: null,
    });
    await database.destroy();
  });

  it("gives each recipient their own count, and an admin the whole batch", async () => {
    const { database, uploaderId, sessionId } = await _createContext();
    const abuelaId = await insertMember(database, { display_name: "Abuela" });
    const inesId = await insertMember(database, { display_name: "Inés" });
    const adminId = await insertMember(database, { role: "admin" });
    const cousinsId = await insertGroup(database, { name: "Cousins" });
    await insertGroupMember(database, { groupId: cousinsId, memberId: inesId });
    const cousinsOnlyId = await insertVisibilityRule(database, {
      mode: "only",
    });
    await insertVisibilityRuleSubject(database, {
      ruleId: cousinsOnlyId,
      groupId: cousinsId,
    });
    const notInesId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, {
      ruleId: notInesId,
      memberId: inesId,
    });
    const common = { uploaderId, sessionId, capturedOn: "2026-09-14" };
    await _insertBatchItems(database, { ...common, count: 2, firstSeq: 0 });
    await _insertBatchItems(database, {
      ...common,
      count: 3,
      firstSeq: 10,
      visibilityRuleId: cousinsOnlyId,
    });
    await _insertBatchItems(database, {
      ...common,
      count: 4,
      firstSeq: 20,
      visibilityRuleId: notInesId,
    });

    await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const countsByMemberId = new Map(
      (await _readUploadEmails(database)).map((email) => {
        return [email.memberId, email.payload.visibleItemCount];
      }),
    );
    // Everyone's 2, plus the 4 that hide only from Inés.
    expect(countsByMemberId.get(abuelaId)).toBe(6);
    // Everyone's 2, plus the 3 her group can see.
    expect(countsByMemberId.get(inesId)).toBe(5);
    expect(countsByMemberId.get(adminId)).toBe(9);
    expect(countsByMemberId.size).toBe(3);
    await database.destroy();
  });

  it("never tells the uploader about their own upload", async () => {
    const { database, uploaderId, sessionId } = await _createContext();
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-14",
      count: 2,
      firstSeq: 0,
    });

    const result = await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    expect(result.recipientCount).toBe(0);
    expect(await _readUploadEmails(database)).toEqual([]);
    await database.destroy();
  });

  it("sends nothing to notify_on_upload = 0, or to an invited or removed member", async () => {
    const { database, uploaderId, sessionId } = await _createContext();
    await insertMember(database, { notify_on_upload: 0 });
    await insertMember(database, { status: "invited", joined_at: null });
    await insertMember(database, { status: "removed", removed_at: NOW });
    const rosaId = await insertMember(database);
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-14",
      count: 1,
      firstSeq: 0,
    });

    await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const emails = await _readUploadEmails(database);
    expect(
      emails.map((email) => {
        return email.memberId;
      }),
    ).toEqual([rosaId]);
    await database.destroy();
  });

  it("writes zero rows when nobody else can see any of it", async () => {
    const { database, uploaderId, sessionId } = await _createContext();
    await insertMember(database);
    const onlyMeId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId: onlyMeId,
      memberId: uploaderId,
    });
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-14",
      count: 3,
      firstSeq: 0,
      visibilityRuleId: onlyMeId,
    });

    const result = await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    expect(result.recipientCount).toBe(0);
    expect(await _readUploadEmails(database)).toEqual([]);
    await database.destroy();
  });

  it("links the earliest of two equally busy days, and names the narrowest milestone on the last day", async () => {
    const { database, uploaderId, sessionId } = await _createContext();
    await insertMember(database);
    await insertMilestone(database, {
      name: "Mateo's first week",
      startsOn: "2026-09-14",
      endsOn: "2026-09-20",
    });
    await insertMilestone(database, {
      name: "Mateo is born",
      startsOn: "2026-09-15",
    });
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-14",
      count: 2,
      firstSeq: 0,
    });
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-15",
      count: 2,
      firstSeq: 10,
    });

    await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const [email] = await _readUploadEmails(database);
    expect(email?.payload.capturedOn).toBe("2026-09-14");
    expect(email?.payload.lastCapturedOn).toBe("2026-09-15");
    expect(email?.payload.dayUrl).toBe(
      "https://shoebox.example.com/?at=2026-09-15",
    );
    expect(email?.payload.milestoneName).toBe("Mateo is born");
    await database.destroy();
  });

  it("names the milestone on the last day when only the last day has one", async () => {
    const { database, uploaderId, sessionId } = await _createContext();
    await insertMember(database);
    await insertMilestone(database, {
      name: "Mateo's first steps",
      startsOn: "2026-09-16",
    });
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-14",
      count: 3,
      firstSeq: 0,
    });
    await _insertBatchItems(database, {
      uploaderId,
      sessionId,
      capturedOn: "2026-09-16",
      count: 1,
      firstSeq: 10,
    });

    await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const [email] = await _readUploadEmails(database);
    // The busiest day has no milestone; the day the link opens at does.
    expect(email?.payload.capturedOn).toBe("2026-09-14");
    expect(email?.payload.lastCapturedOn).toBe("2026-09-16");
    expect(email?.payload.milestoneName).toBe("Mateo's first steps");
    await database.destroy();
  });
});
