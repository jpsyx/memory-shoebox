import {
  createUploadTestContext,
  insertBatchItems,
  readUploadEmails,
} from "./enqueueUploadSessionEmailsTestHelpers.ts";

import { describe, expect, it } from "vitest";

import { enqueueUploadSessionEmails } from "../../../../src/upload/enqueueUploadSessionEmails/enqueueUploadSessionEmails.ts";
import {
  NOW,
  insertMember,
  insertMilestone,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("enqueueUploadSessionEmails", () => {
  it("writes zero rows when nobody else can see any of it", async () => {
    const { database, uploaderId, sessionId } = await createUploadTestContext();
    await insertMember(database);
    const onlyMeId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId: onlyMeId,
      memberId: uploaderId,
    });
    await insertBatchItems({
      database: database,
      options: {
        uploaderId,
        sessionId,
        capturedOn: "2026-09-14",
        count: 3,
        firstSeq: 0,
        visibilityRuleId: onlyMeId,
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

  it("links the earliest of two equally busy days, and names the narrowest milestone on the last day", async () => {
    const { database, uploaderId, sessionId } = await createUploadTestContext();
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
    await insertBatchItems({
      database: database,
      options: {
        uploaderId,
        sessionId,
        capturedOn: "2026-09-15",
        count: 2,
        firstSeq: 10,
      },
    });

    await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const [email] = await readUploadEmails(database);
    expect(email?.payload.capturedOn).toBe("2026-09-14");
    expect(email?.payload.lastCapturedOn).toBe("2026-09-15");
    expect(email?.payload.dayUrl).toBe(
      "https://shoebox.example.com/?at=2026-09-15",
    );
    expect(email?.payload.milestoneName).toBe("Mateo is born");
    await database.destroy();
  });

  it("names the milestone on the last day when only the last day has one", async () => {
    const { database, uploaderId, sessionId } = await createUploadTestContext();
    await insertMember(database);
    await insertMilestone(database, {
      name: "Mateo's first steps",
      startsOn: "2026-09-16",
    });
    await insertBatchItems({
      database: database,
      options: {
        uploaderId,
        sessionId,
        capturedOn: "2026-09-14",
        count: 3,
        firstSeq: 0,
      },
    });
    await insertBatchItems({
      database: database,
      options: {
        uploaderId,
        sessionId,
        capturedOn: "2026-09-16",
        count: 1,
        firstSeq: 10,
      },
    });

    await enqueueUploadSessionEmails({
      transaction: database,
      sessionId,
      uploadedBy: uploaderId,
      now: NOW,
    });

    const [email] = await readUploadEmails(database);
    // The busiest day has no milestone; the day the link opens at does.
    expect(email?.payload.capturedOn).toBe("2026-09-14");
    expect(email?.payload.lastCapturedOn).toBe("2026-09-16");
    expect(email?.payload.milestoneName).toBe("Mateo's first steps");
    await database.destroy();
  });
});
