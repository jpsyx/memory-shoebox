import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { runUploadAbandonSweep } from "../../src/jobs/runUploadAbandonSweep.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";
import { failB2CallsInsideTransactions } from "../helpers/failB2CallsInsideTransactions.ts";
import {
  NOW,
  insertInstanceSetting,
  insertItem,
  insertMember,
  insertUploadFile,
  insertUploadSession,
  shiftDays,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** A summary in which nothing happened. */
const NOTHING = {
  abandonedFileCount: 0,
  cancelledDraftCount: 0,
  settledSessionCount: 0,
  abortedMultipartCount: 0,
};

async function _createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const b2 = createFakeB2Client();
  return { database, memberId, b2 };
}

/** Every derivative key a browser may have sent ahead of one file's original. */
function _getDerivativeKeysFromFile(options: {
  sessionId: string;
  fileId: string;
}): string[] {
  return ["display", "thumb", "poster"].map((purpose) => {
    return `uploads/${options.sessionId}/${options.fileId}/${purpose}.jpg`;
  });
}

/** What `pending_object_deletions` holds, in key order. */
async function _readQueuedKeys(
  database: Awaited<ReturnType<typeof _createContext>>["database"],
): Promise<string[]> {
  const rows = await database
    .selectFrom("pending_object_deletions")
    .select("storage_key")
    .orderBy("storage_key")
    .execute();
  return rows.map((row) => {
    return row.storage_key;
  });
}

/**
 * A committed batch idle past the grace period, with one photograph that
 * landed and one large video whose multipart upload never finished.
 */
async function _insertAbandonedBatch(
  context: Awaited<ReturnType<typeof _createContext>>,
): Promise<{ sessionId: string; videoFileId: string }> {
  const sessionId = await insertUploadSession(context.database, {
    uploadedBy: context.memberId,
    last_activity_at: shiftMinutes({ instant: NOW, minutes: -90 }),
  });
  const itemId = await insertItem(context.database, {
    uploadedBy: context.memberId,
    upload_session_id: sessionId,
  });
  await insertUploadFile(context.database, {
    uploadSessionId: sessionId,
    position: 0,
    state: "done",
    item_id: itemId,
  });
  const videoFileId = await insertUploadFile(context.database, {
    uploadSessionId: sessionId,
    position: 1,
    state: "sending",
    original_filename: "IMG_0002.MOV",
    declared_content_type: "video/quicktime",
    kind: "video",
    storage_key: `uploads/${sessionId}/video/original.mov`,
    multipart_upload_id: "multipart-upload-1",
  });
  return { sessionId, videoFileId };
}

describe("upload-abandon-sweep", () => {
  it("does nothing against empty tables", async () => {
    const { database, b2 } = await _createContext();

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(summary).toEqual(NOTHING);
    expect(b2.calls).toEqual([]);
    await database.destroy();
  });

  it("abandons a batch idle past the grace period, and is idempotent", async () => {
    const { database, memberId, b2 } = await _createContext();
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

    const first = await runUploadAbandonSweep({ database, b2, now: NOW });
    const second = await runUploadAbandonSweep({ database, b2, now: NOW });

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
    const { database, memberId, b2 } = await _createContext();
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

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

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
    const { database, memberId, b2 } = await _createContext();
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

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

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

  it("settles the batch it abandoned and enqueues its one email", async () => {
    const context = await _createContext();
    const { database, b2 } = context;
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    const rosaId = await insertMember(database, { display_name: "Rosa" });
    const { sessionId } = await _insertAbandonedBatch(context);

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(summary.settledSessionCount).toBe(1);
    const session = await database
      .selectFrom("upload_sessions")
      .select(["state", "settled_at", "notified_member_count", "notified_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      state: "settled",
      settled_at: NOW,
      notified_member_count: 1,
      notified_at: NOW,
    });
    const emails = await database
      .selectFrom("outbound_emails")
      .select("idempotency_key")
      .where("kind", "=", "upload_session")
      .execute();
    expect(emails).toEqual([
      { idempotency_key: `upload:${sessionId}:${rosaId}` },
    ]);
    await database.destroy();
  });

  it("aborts the abandoned multipart upload, after its transaction commits", async () => {
    const context = await _createContext();
    const watch = failB2CallsInsideTransactions({
      database: context.database,
      b2: context.b2,
    });
    const { videoFileId } = await _insertAbandonedBatch(context);

    const summary = await runUploadAbandonSweep({
      database: watch.database,
      b2: context.b2,
      now: NOW,
    });

    expect(watch.callsInsideTransactions).toEqual([]);
    expect(context.b2.calls).toEqual(["abortMultipart"]);
    expect(summary.abortedMultipartCount).toBe(1);
    const video = await context.database
      .selectFrom("upload_files")
      .select(["state", "multipart_upload_id"])
      .where("id", "=", videoFileId)
      .executeTakeFirstOrThrow();
    expect(video).toEqual({ state: "failed", multipart_upload_id: null });
    await context.database.destroy();
  });

  it("keeps the upload id when the abort fails, so the next run tries again", async () => {
    const context = await _createContext();
    const { database, b2 } = context;
    const { videoFileId } = await _insertAbandonedBatch(context);
    b2.isUnavailable = true;

    const first = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(first.abortedMultipartCount).toBe(0);
    const kept = await database
      .selectFrom("upload_files")
      .select("multipart_upload_id")
      .where("id", "=", videoFileId)
      .executeTakeFirstOrThrow();
    expect(kept.multipart_upload_id).toBe("multipart-upload-1");

    b2.isUnavailable = false;
    const second = await runUploadAbandonSweep({ database, b2, now: NOW });

    // The batch settled on the first run and is not touched again; the abort
    // is retried anyway, because the row still carries its id.
    expect(second.settledSessionCount).toBe(0);
    expect(second.abortedMultipartCount).toBe(1);
    const cleared = await database
      .selectFrom("upload_files")
      .select("multipart_upload_id")
      .where("id", "=", videoFileId)
      .executeTakeFirstOrThrow();
    expect(cleared.multipart_upload_id).toBeNull();
    await database.destroy();
  });

  it("queues what an abandoned row may have left in the bucket, and only that", async () => {
    const { database, memberId, b2 } = await _createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      upload_session_id: sessionId,
    });
    const doneId = createId();
    const singleId = createId();
    const keylessId = createId();
    const multipartId = createId();
    const seed = (overrides: Partial<Database["upload_files"]>) => {
      return insertUploadFile(database, {
        uploadSessionId: sessionId,
        ...overrides,
      });
    };
    // Landed and ingested: an item stands on it, so it must never be queued.
    await seed({
      id: doneId,
      position: 0,
      state: "done",
      item_id: itemId,
      storage_key: `uploads/${sessionId}/${doneId}/original.jpg`,
    });
    // A single PUT that may have landed just before the tab closed.
    await seed({
      id: singleId,
      position: 1,
      state: "sending",
      storage_key: `uploads/${sessionId}/${singleId}/original.jpg`,
    });
    // Never presigned, so nothing of it can be in the bucket.
    await seed({ id: keylessId, position: 2, state: "waiting" });
    // Aborted, and its key queued too: Backblaze may have assembled it
    // before the abort could remove it.
    await seed({
      id: multipartId,
      position: 3,
      state: "sending",
      kind: "video",
      declared_content_type: "video/quicktime",
      storage_key: `uploads/${sessionId}/${multipartId}/original.mov`,
      multipart_upload_id: "multipart-upload-1",
    });

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(summary.abandonedFileCount).toBe(3);
    expect(await _readQueuedKeys(database)).toEqual(
      [
        `uploads/${sessionId}/${singleId}/original.jpg`,
        ..._getDerivativeKeysFromFile({ sessionId, fileId: singleId }),
        `uploads/${sessionId}/${multipartId}/original.mov`,
        ..._getDerivativeKeysFromFile({ sessionId, fileId: multipartId }),
      ].toSorted(),
    );
    await database.destroy();
  });

  it("does not queue a key again once the drain has deleted it", async () => {
    const { database, memberId, b2 } = await _createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -90 }),
    });
    const fileId = createId();
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: fileId,
      state: "sending",
      storage_key: `uploads/${sessionId}/${fileId}/original.jpg`,
    });
    await runUploadAbandonSweep({ database, b2, now: NOW });
    expect(await _readQueuedKeys(database)).toHaveLength(4);
    // The drain has deleted all four objects by the next run.
    await database.deleteFrom("pending_object_deletions").execute();

    await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(await _readQueuedKeys(database)).toEqual([]);
    await database.destroy();
  });

  it("settles the other batches and runs the other halves when one batch's settle fails, then reports it", async () => {
    const { database, memberId, b2 } = await _createContext();
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
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -90 }),
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
    const { database, memberId, b2 } = await _createContext();
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
    const { database, memberId, b2 } = await _createContext();
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
    const { database, memberId, b2 } = await _createContext();
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

  it("fails a file retried after its batch settled once it goes idle itself, without settling again", async () => {
    const context = await _createContext();
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
    expect(await _readQueuedKeys(database)).toEqual(
      [storageKey, ..._getDerivativeKeysFromFile({ sessionId, fileId })].sort(),
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
    const { database, memberId, b2 } = await _createContext();
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
    const { database, memberId, b2 } = await _createContext();
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
    const { database, memberId, b2 } = await _createContext();
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
    const { database, memberId, b2 } = await _createContext();
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
    const { database, memberId, b2 } = await _createContext();
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
