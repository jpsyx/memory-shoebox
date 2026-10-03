import {
  NOTHING,
  createContext,
  getQueuedKeysFromDatabase,
} from "./runUploadAbandonSweepTestHelpers.ts";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { createId } from "../../../../src/db/createId.ts";

import { runUploadAbandonSweep } from "../../../../src/jobs/runUploadAbandonSweep/runUploadAbandonSweep.ts";

import {
  NOW,
  insertMember,
  insertUploadFile,
  insertUploadSession,
  shiftDays,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("upload-abandon-sweep", () => {
  it("does not queue a key again once the drain has deleted it", async () => {
    const { database, memberId, b2 } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -100 }),
    });
    const fileId = createId();
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: fileId,
      state: "sending",
      storage_key: `uploads/${sessionId}/${fileId}/original.jpg`,
    });
    await runUploadAbandonSweep({ database, b2, now: NOW });
    expect(await getQueuedKeysFromDatabase(database)).toHaveLength(4);
    // The drain has deleted all four objects by the next run.
    await database.deleteFrom("pending_object_deletions").execute();

    await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(await getQueuedKeysFromDatabase(database)).toEqual([]);
    await database.destroy();
  });

  it("settles the other batches and runs the other halves when one batch's settle fails, then reports it", async () => {
    const { database, memberId, b2 } = await createContext();
    const stuckSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -120 }),
    });
    const stuckFileId = await insertUploadFile(database, {
      uploadSessionId: stuckSessionId,
      state: "sending",
    });
    const healthyMemberId = await insertMember(database);
    const healthySessionId = await insertUploadSession(database, {
      uploadedBy: healthyMemberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -100 }),
    });
    await insertUploadFile(database, {
      uploadSessionId: healthySessionId,
      state: "sending",
    });
    const draftMemberId = await insertMember(database);
    const draftSessionId = await insertUploadSession(database, {
      uploadedBy: draftMemberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftDays({ instant: NOW, days: -8 }),
    });
    const closedMemberId = await insertMember(database);
    const closedSessionId = await insertUploadSession(database, {
      uploadedBy: closedMemberId,
      state: "settled",
      settled_at: NOW,
    });
    const leftoverFileId = await insertUploadFile(database, {
      uploadSessionId: closedSessionId,
      state: "cancelled",
      storage_key: `uploads/${closedSessionId}/video/original.mov`,
      multipart_upload_id: "multipart-upload-3",
    });
    // The oldest batch is processed first, and its settle cannot be written.
    await sql`CREATE TRIGGER settle_refused BEFORE UPDATE OF state ON upload_sessions
      WHEN NEW.id = ${sql.lit(stuckSessionId)} AND NEW.state = 'settled'
      BEGIN SELECT RAISE(ABORT, 'this batch cannot settle'); END`.execute(
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
    expect((failure as AggregateError).message).toContain(stuckSessionId);
    expect((failure as AggregateError).errors).toHaveLength(1);
    const readSessionState = async (sessionId: string) => {
      const session = await database
        .selectFrom("upload_sessions")
        .select("state")
        .where("id", "=", sessionId)
        .executeTakeFirstOrThrow();
      return session.state;
    };
    expect(await readSessionState(healthySessionId)).toBe("settled");
    expect(await readSessionState(draftSessionId)).toBe("cancelled");
    // The failed batch rolled back whole: its file is still in flight, so the
    // next run finds it again.
    expect(await readSessionState(stuckSessionId)).toBe("uploading");
    const stuckFile = await database
      .selectFrom("upload_files")
      .select("state")
      .where("id", "=", stuckFileId)
      .executeTakeFirstOrThrow();
    expect(stuckFile.state).toBe("sending");
    const leftover = await database
      .selectFrom("upload_files")
      .select("multipart_upload_id")
      .where("id", "=", leftoverFileId)
      .executeTakeFirstOrThrow();
    expect(leftover.multipart_upload_id).toBeNull();

    await sql`DROP TRIGGER settle_refused`.execute(database);
    const retry = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(retry).toMatchObject({
      abandonedFileCount: 1,
      settledSessionCount: 1,
    });
    expect(await readSessionState(stuckSessionId)).toBe("settled");
    await database.destroy();
  });

  it("retries an abort a closed batch left behind, though nothing else touches it", async () => {
    const { database, memberId, b2 } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: NOW,
    });
    // "Send what did arrive" cancelled it, and its own abort did not land.
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "cancelled",
      problem_code: "cancelled_by_uploader",
      storage_key: `uploads/${sessionId}/video/original.mov`,
      multipart_upload_id: "multipart-upload-2",
    });

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(summary).toEqual({ ...NOTHING, abortedMultipartCount: 1 });
    expect(b2.calls).toEqual(["abortMultipart"]);
    const file = await database
      .selectFrom("upload_files")
      .select(["state", "multipart_upload_id"])
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file).toEqual({ state: "cancelled", multipart_upload_id: null });
    await database.destroy();
  });

  it("leaves a file whose batch was never committed to the draft half", async () => {
    const { database, memberId, b2 } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -100 }),
    });
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      updated_at: shiftMinutes({ instant: NOW, minutes: -100 }),
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

  it("cancels a draft older than a week, leaves a six-day-old one alone, and is idempotent", async () => {
    const { database, memberId, b2 } = await createContext();
    const staleId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftDays({ instant: NOW, days: -8 }),
    });
    const sixDayOldId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "draft",
      committed_at: null,
      last_activity_at: shiftDays({ instant: NOW, days: -6 }),
    });

    const first = await runUploadAbandonSweep({ database, b2, now: NOW });
    const second = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(first.cancelledDraftCount).toBe(1);
    expect(second.cancelledDraftCount).toBe(0);
    const states = await database
      .selectFrom("upload_sessions")
      .select(["id", "state"])
      .where("id", "in", [staleId, sixDayOldId])
      .execute();
    expect(
      new Map(
        states.map((row) => {
          return [row.id, row.state];
        }),
      ),
    ).toEqual(
      new Map([
        [staleId, "cancelled"],
        [sixDayOldId, "draft"],
      ]),
    );
    await database.destroy();
  });
});
