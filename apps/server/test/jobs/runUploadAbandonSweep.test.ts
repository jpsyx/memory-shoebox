import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runUploadAbandonSweep } from "../../src/jobs/runUploadAbandonSweep.ts";
import {
  NOW,
  insertMember,
  insertUploadFile,
  insertUploadSession,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

async function _createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  return { database, memberId };
}

describe("upload-abandon-sweep", () => {
  it("does nothing against empty tables", async () => {
    const { database } = await _createContext();

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary).toEqual({ abandonedFileCount: 0, cancelledDraftCount: 0 });
    await database.destroy();
  });

  it("abandons a batch idle past the grace period, and is idempotent", async () => {
    const { database, memberId } = await _createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });
    // The file's own `updated_at` is recent and the batch's is not, so this
    // passes only for a job that measures the session.
    const stalledId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "sending",
      updated_at: shiftMinutes({ instant: NOW, minutes: -5 }),
    });

    const first = await runUploadAbandonSweep({ database, now: NOW });
    const second = await runUploadAbandonSweep({ database, now: NOW });

    expect(first.abandonedFileCount).toBe(1);
    expect(second.abandonedFileCount).toBe(0);
    const stalled = await database
      .selectFrom("upload_files")
      .select(["state", "problem_code"])
      .where("id", "=", stalledId)
      .executeTakeFirstOrThrow();
    expect(stalled.state).toBe("failed");
    expect(stalled.problem_code).toBe("abandoned");
    await database.destroy();
  });

  it("leaves a slow file alone while its batch is still active", async () => {
    const { database, memberId } = await _createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -5 }),
    });
    // A 5 GB video: its row was touched at presign two hours ago and will not
    // be touched again until it lands. Something else in the batch completed
    // five minutes ago, which is what `last_activity_at` records, and the
    // grace period exists precisely so this transfer is not failed under
    // somebody who is still uploading it.
    const slowId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "sending",
      updated_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary.abandonedFileCount).toBe(0);
    const slow = await database
      .selectFrom("upload_files")
      .select(["state", "problem_code"])
      .where("id", "=", slowId)
      .executeTakeFirstOrThrow();
    expect(slow.state).toBe("sending");
    expect(slow.problem_code).toBeNull();
    await database.destroy();
  });

  it("abandons every non-terminal row in the batch, not only the stale ones", async () => {
    const { database, memberId } = await _createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });
    const waitingId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 0,
      state: "waiting",
      updated_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });
    const sendingId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      state: "sending",
      updated_at: shiftMinutes({ instant: NOW, minutes: -2 }),
    });
    const doneId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 2,
      state: "done",
      updated_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary.abandonedFileCount).toBe(2);
    const files = await database
      .selectFrom("upload_files")
      .select(["id", "state", "problem_code"])
      .where("upload_session_id", "=", sessionId)
      .orderBy("position")
      .execute();
    expect(files).toEqual([
      { id: waitingId, state: "failed", problem_code: "abandoned" },
      { id: sendingId, state: "failed", problem_code: "abandoned" },
      { id: doneId, state: "done", problem_code: null },
    ]);
    await database.destroy();
  });

  it("leaves a file whose batch was never committed to the draft half", async () => {
    const { database, memberId } = await _createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      updated_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary).toEqual({ abandonedFileCount: 0, cancelledDraftCount: 0 });
    const file = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("waiting");
    await database.destroy();
  });

  it("cancels a draft idle past appConfig.upload.draftExpiryHours, and is idempotent", async () => {
    const { database, memberId } = await _createContext();
    const staleId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -8 * 24 * 60 }),
    });
    await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -60 }),
    });

    const first = await runUploadAbandonSweep({ database, now: NOW });
    const second = await runUploadAbandonSweep({ database, now: NOW });

    expect(first.cancelledDraftCount).toBe(1);
    expect(second.cancelledDraftCount).toBe(0);
    const stale = await database
      .selectFrom("upload_sessions")
      .select("state")
      .where("id", "=", staleId)
      .executeTakeFirstOrThrow();
    expect(stale.state).toBe("cancelled");
    await database.destroy();
  });

  it("never touches a settled batch", async () => {
    const { database, memberId } = await _createContext();
    // Idle well past the grace period and holding a `waiting` row, so
    // `settled_at IS NULL` is the only clause keeping it out of the sweep.
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -120 }),
      settled_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "waiting",
      updated_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary.abandonedFileCount).toBe(0);
    const file = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("waiting");
    await database.destroy();
  });

  it("leaves an in-flight file on a cancelled draft alone", async () => {
    const { database, memberId } = await _createContext();
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

    const summary = await runUploadAbandonSweep({ database, now: NOW });

    expect(summary).toEqual({ abandonedFileCount: 0, cancelledDraftCount: 0 });
    const file = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("waiting");
    await database.destroy();
  });

  it("sweeps a committed batch left cancelled and unsettled", async () => {
    const { database, memberId } = await _createContext();
    // No route can write this row today, and the sweep is keyed on
    // `settled_at` rather than on `state` so that one which somehow did would
    // still be finished: a non-terminal row on a batch nobody is uploading
    // holds the settle latch open forever.
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "waiting",
      updated_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });

    const summary = await runUploadAbandonSweep({ database, now: NOW });

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
    const { database, memberId } = await _createContext();
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

    const summary = await runUploadAbandonSweep({ database, now: NOW });

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
