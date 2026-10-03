import {
  NOTHING,
  createContext,
  getDerivativeKeysFromFile,
  getQueuedKeysFromDatabase,
  insertAbandonedBatch,
} from "./runUploadAbandonSweepTestHelpers.ts";

import { describe, expect, it } from "vitest";

import { createId } from "../../../../src/db/createId.ts";

import type { Database } from "../../../../src/db/types/db.types.ts";
import { runUploadAbandonSweep } from "../../../../src/jobs/runUploadAbandonSweep/runUploadAbandonSweep.ts";

import { failB2CallsInsideTransactions } from "../../../helpers/failB2CallsInsideTransactions/failB2CallsInsideTransactions.ts";
import {
  NOW,
  insertInstanceSetting,
  insertItem,
  insertMember,
  insertUploadFile,
  insertUploadSession,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("upload-abandon-sweep", () => {
  it("does nothing against empty tables", async () => {
    const { database, b2 } = await createContext();

    const summary = await runUploadAbandonSweep({ database, b2, now: NOW });

    expect(summary).toEqual(NOTHING);
    expect(b2.calls).toEqual([]);
    await database.destroy();
  });

  it("abandons a batch idle past the grace period, and is idempotent", async () => {
    const { database, memberId, b2 } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -100 }),
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
    const { database, memberId, b2 } = await createContext();
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
    const { database, memberId, b2 } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -100 }),
    });
    const waitingId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 0,
      state: "waiting",
      updated_at: shiftMinutes({ instant: NOW, minutes: -100 }),
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
      updated_at: shiftMinutes({ instant: NOW, minutes: -100 }),
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
    const context = await createContext();
    const { database, b2 } = context;
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    const rosaId = await insertMember(database, { display_name: "Rosa" });
    const { sessionId } = await insertAbandonedBatch(context);

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
    const context = await createContext();
    const watch = failB2CallsInsideTransactions({
      database: context.database,
      b2: context.b2,
    });
    const { videoFileId } = await insertAbandonedBatch(context);

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
    const context = await createContext();
    const { database, b2 } = context;
    const { videoFileId } = await insertAbandonedBatch(context);
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
    const { database, memberId, b2 } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      last_activity_at: shiftMinutes({ instant: NOW, minutes: -100 }),
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
    expect(await getQueuedKeysFromDatabase(database)).toEqual(
      [
        `uploads/${sessionId}/${singleId}/original.jpg`,
        ...getDerivativeKeysFromFile({ sessionId, fileId: singleId }),
        `uploads/${sessionId}/${multipartId}/original.mov`,
        ...getDerivativeKeysFromFile({ sessionId, fileId: multipartId }),
      ].toSorted(),
    );
    await database.destroy();
  });
});
