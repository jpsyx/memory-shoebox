import {
  NOTHING,
  createContext,
  getDerivativeKeysFromFile,
  getQueuedKeysFromDatabase,
} from "./runUploadAbandonSweepTestHelpers.ts";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { runUploadAbandonSweep } from "../../../../src/jobs/runUploadAbandonSweep/runUploadAbandonSweep.ts";

import { failB2CallsInsideTransactions } from "../../../helpers/failB2CallsInsideTransactions/failB2CallsInsideTransactions.ts";
import {
  NOW,
  insertInstanceSetting,
  insertMember,
  insertUploadFile,
  insertUploadSession,
  shiftDays,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("upload-abandon-sweep", () => {
  it("fails a file retried after its batch settled once it goes idle itself, without settling again", async () => {
    const context = await createContext();
    const { database, memberId, b2 } = context;
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    await insertMember(database, { display_name: "Rosa" });
    const settledAt = shiftMinutes({ instant: NOW, minutes: -300 });
    // Another retried file kept the batch's own activity recent: in a
    // settled batch only the row's `updated_at` says whether it is alive.
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: settledAt,
      notified_at: settledAt,
      notified_member_count: 1,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -5 }),
    });
    const storageKey = `uploads/${sessionId}/retried/original.mov`;
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "sending",
      declared_content_type: "video/quicktime",
      kind: "video",
      storage_key: storageKey,
      multipart_upload_id: "multipart-upload-9",
      updated_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });
    const watch = failB2CallsInsideTransactions({ database, b2 });

    const first = await runUploadAbandonSweep({
      database: watch.database,
      b2,
      now: NOW,
    });
    const second = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(first).toEqual({
      ...NOTHING,
      abandonedFileCount: 1,
      abortedMultipartCount: 1,
    });
    expect(second).toEqual(NOTHING);
    const file = await database
      .selectFrom("upload_files")
      .select(["state", "problem_code", "multipart_upload_id"])
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file).toEqual({
      state: "failed",
      problem_code: "abandoned",
      multipart_upload_id: null,
    });
    // Aborted outside any transaction, and what it may have left is queued.
    expect(watch.callsInsideTransactions).toEqual([]);
    expect(b2.calls).toEqual(["abortMultipart"]);
    expect(await getQueuedKeysFromDatabase(database)).toEqual(
      [storageKey, ...getDerivativeKeysFromFile({ sessionId, fileId })].sort(),
    );
    // The batch already settled and told everybody: no second latch, no mail.
    const session = await database
      .selectFrom("upload_sessions")
      .select(["state", "settled_at", "notified_at", "notified_member_count"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      state: "settled",
      settled_at: settledAt,
      notified_at: settledAt,
      notified_member_count: 1,
    });
    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toEqual([]);
    await database.destroy();
  });

  it("still runs the draft half when the retried files cannot be failed, then reports it", async () => {
    const { database, memberId, b2 } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: shiftMinutes({ instant: NOW, minutes: -300 }),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "sending",
      updated_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });
    const draftMemberId = await insertMember(database);
    const draftSessionId = await insertUploadSession(database, {
      uploadedBy: draftMemberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftDays({ instant: NOW, days: -8 }),
    });
    await sql`CREATE TRIGGER retry_refused BEFORE UPDATE OF state ON upload_files
      WHEN NEW.id = ${sql.lit(fileId)}
      BEGIN SELECT RAISE(ABORT, 'this row cannot be failed'); END`.execute(
      database,
    );

    const failure = await runUploadAbandonSweep({
      database,
      b2,
      now: NOW,
    }).then(
      () => {
        return null;
      },
      (error: unknown) => {
        return error;
      },
    );

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).message).toContain("retried");
    const draft = await database
      .selectFrom("upload_sessions")
      .select("state")
      .where("id", "=", draftSessionId)
      .executeTakeFirstOrThrow();
    expect(draft.state).toBe("cancelled");
    const file = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("sending");
    await database.destroy();
  });

  it("leaves a fresh retry in a settled batch alone, however old the batch", async () => {
    const { database, memberId, b2 } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -300 }),
      settled_at: shiftMinutes({ instant: NOW, minutes: -300 }),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "waiting",
      updated_at: shiftMinutes({ instant: NOW, minutes: -5 }),
    });

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(summary).toEqual(NOTHING);
    const file = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("waiting");
    await database.destroy();
  });

  it("leaves an in-flight file on a cancelled draft alone", async () => {
    const { database, memberId, b2 } = await createContext();
    // The only cancelled session the routes can produce: `DELETE
    // /api/upload-sessions/:sessionId` answers 409 once `committed_at` is
    // set, so a cancelled batch is an uncommitted one and the draft half is
    // what already dealt with it.
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
      committed_at: null,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "waiting",
      updated_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(summary).toEqual(NOTHING);
    const file = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("waiting");
    await database.destroy();
  });

  it("sweeps a committed batch left cancelled and unsettled", async () => {
    const { database, memberId, b2 } = await createContext();
    // No route can write this row today, and the sweep is keyed on
    // `settled_at` rather than on `state` so that one which somehow did would
    // still be finished: a non-terminal row on a batch nobody is uploading
    // holds the settle latch open forever.
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -100 }),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "waiting",
      updated_at: shiftMinutes({ instant: NOW, minutes: -100 }),
    });

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(summary.abandonedFileCount).toBe(1);
    const file = await database
      .selectFrom("upload_files")
      .select(["state", "problem_code"])
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("failed");
    expect(file.problem_code).toBe("abandoned");
    await database.destroy();
  });

  it("leaves a file that already reached a terminal state", async () => {
    const { database, memberId, b2 } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });
    const refusedId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "refused",
      problem_code: "unsupported_type",
      updated_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(summary.abandonedFileCount).toBe(0);
    const refused = await database
      .selectFrom("upload_files")
      .select(["state", "problem_code"])
      .where("id", "=", refusedId)
      .executeTakeFirstOrThrow();
    expect(refused.state).toBe("refused");
    expect(refused.problem_code).toBe("unsupported_type");
    await database.destroy();
  });
});
