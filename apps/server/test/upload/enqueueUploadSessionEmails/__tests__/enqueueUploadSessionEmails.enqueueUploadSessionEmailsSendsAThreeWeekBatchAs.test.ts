import {
  createUploadTestContext,
  insertBatchItems,
  readUploadEmails,
} from "./enqueueUploadSessionEmailsTestHelpers.ts";

import { describe, expect, it } from "vitest";

import { enqueueUploadSessionEmails } from "../../../../src/upload/enqueueUploadSessionEmails/enqueueUploadSessionEmails.ts";
import {
  NOW,
  insertGroup,
  insertGroupMember,
  insertMember,
  insertMilestone,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("enqueueUploadSessionEmails", () => {
  it("sends a three-week batch as one email per recipient, not one per day", async () => {
    const { database, uploaderId, sessionId } = await createUploadTestContext();
    const rosaId = await insertMember(database, { display_name: "Rosa" });
    await insertBatchItems({
      database: database,
      options: {
        uploaderId,
        sessionId,
        capturedOn: "2026-09-01",
        count: 2,
        firstSeq: 0,
      },
    });
    await insertBatchItems({
      database: database,
      options: {
        uploaderId,
        sessionId,
        capturedOn: "2026-09-08",
        count: 1,
        firstSeq: 10,
      },
    });
    await insertBatchItems({
      database: database,
      options: {
        uploaderId,
        sessionId,
        capturedOn: "2026-09-21",
        count: 3,
        firstSeq: 20,
      },
    });

    const result = await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const emails = await readUploadEmails(database);
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
    const { database, uploaderId, sessionId } = await createUploadTestContext();
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
    await insertBatchItems({
      database: database,
      options: { ...common, count: 2, firstSeq: 0 },
    });
    await insertBatchItems({
      database: database,
      options: {
        ...common,
        count: 3,
        firstSeq: 10,
        visibilityRuleId: cousinsOnlyId,
      },
    });
    await insertBatchItems({
      database: database,
      options: {
        ...common,
        count: 4,
        firstSeq: 20,
        visibilityRuleId: notInesId,
      },
    });

    await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const countsByMemberId = new Map(
      (await readUploadEmails(database)).map((email) => {
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

  it("computes each recipient's days from what they can see, never from the whole batch", async () => {
    const { database, uploaderId, sessionId } = await createUploadTestContext();
    const abuelaId = await insertMember(database, { display_name: "Abuela" });
    const inesId = await insertMember(database, { display_name: "Inés" });
    const adminId = await insertMember(database, { role: "admin" });
    const cousinsId = await insertGroup(database, { name: "Cousins" });
    await insertGroupMember(database, { groupId: cousinsId, memberId: inesId });
    const notCousinsId = await insertVisibilityRule(database, {
      mode: "except",
    });
    await insertVisibilityRuleSubject(database, {
      ruleId: notCousinsId,
      groupId: cousinsId,
    });
    // The two later days are hidden from the cousins; the two earlier ones
    // are everyone's. The milestone on the 16th sits on a hidden day.
    await insertMilestone(database, {
      name: "Mateo's first tooth",
      startsOn: "2026-09-12",
    });
    await insertMilestone(database, {
      name: "Mateo's baptism",
      startsOn: "2026-09-16",
    });
    const common = { uploaderId, sessionId };
    await insertBatchItems({
      database: database,
      options: {
        ...common,
        capturedOn: "2026-09-10",
        count: 2,
        firstSeq: 0,
      },
    });
    await insertBatchItems({
      database: database,
      options: {
        ...common,
        capturedOn: "2026-09-12",
        count: 1,
        firstSeq: 10,
      },
    });
    await insertBatchItems({
      database: database,
      options: {
        ...common,
        capturedOn: "2026-09-14",
        count: 3,
        firstSeq: 20,
        visibilityRuleId: notCousinsId,
      },
    });
    await insertBatchItems({
      database: database,
      options: {
        ...common,
        capturedOn: "2026-09-16",
        count: 2,
        firstSeq: 30,
        visibilityRuleId: notCousinsId,
      },
    });

    await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const emailsByMemberId = new Map(
      (await readUploadEmails(database)).map((email) => {
        return [email.memberId, email];
      }),
    );
    expect(emailsByMemberId.size).toBe(3);
    // Inés sees two days of the four, and nothing on or after the 14th.
    expect(emailsByMemberId.get(inesId)?.subject).toBe(
      "Papá put up 3 photos, from 2 days",
    );
    expect(emailsByMemberId.get(inesId)?.payload).toMatchObject({
      visibleItemCount: 3,
      visibleDayCount: 2,
      firstCapturedOn: "2026-09-10",
      lastCapturedOn: "2026-09-12",
      capturedOn: "2026-09-10",
      dayUrl: "https://shoebox.example.com/?at=2026-09-12",
      milestoneName: "Mateo's first tooth",
    });
    // Abuela and the admin see all four, and the baptism on the last one.
    const everythingPayload = {
      visibleItemCount: 8,
      visibleDayCount: 4,
      firstCapturedOn: "2026-09-10",
      lastCapturedOn: "2026-09-16",
      capturedOn: "2026-09-14",
      dayUrl: "https://shoebox.example.com/?at=2026-09-16",
      milestoneName: "Mateo's baptism",
    };
    expect(emailsByMemberId.get(abuelaId)?.subject).toBe(
      "Papá put up 8 photos, from 4 days",
    );
    expect(emailsByMemberId.get(abuelaId)?.payload).toMatchObject(
      everythingPayload,
    );
    expect(emailsByMemberId.get(adminId)?.payload).toMatchObject(
      everythingPayload,
    );
    await database.destroy();
  });

  it("never tells the uploader about their own upload", async () => {
    const { database, uploaderId, sessionId } = await createUploadTestContext();
    await insertBatchItems({
      database: database,
      options: {
        uploaderId,
        sessionId,
        capturedOn: "2026-09-14",
        count: 2,
        firstSeq: 0,
      },
    });

    const result = await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    expect(result.recipientCount).toBe(0);
    expect(await readUploadEmails(database)).toEqual([]);
    await database.destroy();
  });

  it("sends nothing to notify_on_upload = 0, or to an invited or removed member", async () => {
    const { database, uploaderId, sessionId } = await createUploadTestContext();
    await insertMember(database, { notify_on_upload: 0 });
    await insertMember(database, { status: "invited", joined_at: null });
    await insertMember(database, { status: "removed", removed_at: NOW });
    const rosaId = await insertMember(database);
    await insertBatchItems({
      database: database,
      options: {
        uploaderId,
        sessionId,
        capturedOn: "2026-09-14",
        count: 1,
        firstSeq: 0,
      },
    });

    await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const emails = await readUploadEmails(database);
    expect(
      emails.map((email) => {
        return email.memberId;
      }),
    ).toEqual([rosaId]);
    await database.destroy();
  });
});
