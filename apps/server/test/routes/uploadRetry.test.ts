import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type {
  CompleteUploadFileResponse,
  RenditionPurpose,
  RetryUploadFileResponse,
} from "@memory-shoebox/shared";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { makeUploadStorageKeyFromRendition } from "../../src/upload/presignUploadFile.ts";
import {
  createFakeB2Client,
  type FakeB2Client,
} from "../helpers/createFakeB2Client.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { failB2CallsInsideTransactions } from "../helpers/failB2CallsInsideTransactions.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertInstanceSetting,
  insertMember,
  insertPendingObjectDeletion,
  insertUploadFile,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const JPEG = "image/jpeg";

const countUploadEmails = async (
  database: Kysely<Database>,
  sessionId: string,
): Promise<number> => {
  const rows = await database
    .selectFrom("outbound_emails")
    .select("id")
    .where("idempotency_key", "like", `upload:${sessionId}:%`)
    .execute();
  return rows.length;
};

/** What `seedFile` hands back: the row's id, its hash, and its keys. */
type SeededFile = {
  fileId: string;
  contentHash: string;
  keyOf: (purpose: RenditionPurpose) => string;
};

/** A `sending` file with every capture column filled, ready to be overridden. */
const makeSeedFile = (options: {
  database: Kysely<Database>;
  sessionId: string;
}) => {
  const { database, sessionId } = options;
  return async (fileOptions: {
    position: number;
    overrides?: Partial<Database["upload_files"]>;
  }): Promise<SeededFile> => {
    const fileId = createId();
    const contentHash = createHash("sha256").update(fileId).digest("hex");
    const keyOf = (purpose: RenditionPurpose) => {
      return makeUploadStorageKeyFromRendition({
        sessionId,
        fileId,
        purpose,
        declaredContentType: JPEG,
      });
    };
    await insertUploadFile(database, {
      id: fileId,
      uploadSessionId: sessionId,
      position: fileOptions.position,
      state: "sending",
      attempt_count: 1,
      declared_bytes: 1024,
      content_hash: contentHash,
      storage_key: keyOf("original"),
      captured_at: "2026-09-14T04:41:32.000Z",
      capture_date: "2026-09-14",
      capture_offset_minutes: 120,
      capture_source: "exif",
      original_captured_at: "2026-09-14T04:41:32.000Z",
      width: 4032,
      height: 3024,
      ...fileOptions.overrides,
    });
    return { fileId, contentHash, keyOf };
  };
};

/** One signed-in POST to a file's route. */
const makePost = (options: {
  app: FastifyInstance;
  cookie: string;
  sessionId: string;
}) => {
  return (
    fileId: string,
    action: "presign" | "complete" | "retry",
    payload?: Record<string, unknown>,
  ) => {
    return options.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${options.sessionId}/files/${fileId}/${action}`,
      headers: { cookie: options.cookie },
      payload,
    });
  };
};

const setUp = async (
  options: { database?: Kysely<Database>; b2?: FakeB2Client } = {},
) => {
  let currentTime = NOW;
  const testApp = await createTestApp({
    clock: () => {
      return new Date(currentTime);
    },
    // Only when given: a `database: undefined` would reach `createApp`.
    ...(options.database === undefined ? {} : { database: options.database }),
    ...(options.b2 === undefined ? {} : { b2: options.b2 }),
  });
  const { cookie, memberId } = await insertSignedInMember({
    database: testApp.database,
  });
  const sessionId = await insertUploadSession(testApp.database, {
    uploadedBy: memberId,
    file_count: 2,
    total_bytes: 2048,
    last_activity_at: shiftMinutes({ instant: NOW, minutes: -10 }),
  });
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    seedFile: makeSeedFile({ database: testApp.database, sessionId }),
    post: makePost({ app: testApp.app, cookie, sessionId }),
    readFile: (fileId: string) => {
      return testApp.database
        .selectFrom("upload_files")
        .selectAll()
        .where("id", "=", fileId)
        .executeTakeFirstOrThrow();
    },
    setTime: (instant: string) => {
      currentTime = instant;
    },
  };
};

type RetryContext = Awaited<ReturnType<typeof setUp>>;

/** The body of a `complete` that lands a 1 KiB original. */
const doneBody = (file: SeededFile) => {
  return { outcome: "done", contentHash: file.contentHash, byteSize: 1024 };
};

/** Puts a 1 KiB JPEG in the fake bucket under the file's original key. */
const storeOriginal = (context: RetryContext, file: SeededFile): void => {
  context.b2.storedObjects.set(file.keyOf("original"), {
    sizeBytes: 1024,
    contentType: JPEG,
  });
};

/**
 * Lands every `landed` file, then fails `dropped`, which settles the batch:
 * the last file to end runs the latch.
 */
const settleWithOneDropped = async (
  context: RetryContext,
  files: { landed: readonly SeededFile[]; dropped: SeededFile },
) => {
  for (const file of files.landed) {
    storeOriginal(context, file);
    await context.post(file.fileId, "complete", doneBody(file));
  }
  return context.post(files.dropped.fileId, "complete", {
    outcome: "failed",
    problemCode: "connection_lost",
  });
};

/** Five minutes on: retry, presign and complete the dropped file again. */
const recoverDroppedFile = async (
  context: RetryContext,
  dropped: SeededFile,
) => {
  context.setTime(shiftMinutes({ instant: NOW, minutes: 5 }));
  const retried = await context.post(dropped.fileId, "retry");
  const presigned = await context.post(dropped.fileId, "presign", {
    contentHash: dropped.contentHash,
    byteSize: 1024,
  });
  storeOriginal(context, dropped);
  const recovered = await context.post(
    dropped.fileId,
    "complete",
    doneBody(dropped),
  );
  return { retried, presigned, recovered };
};

/** A camera-dated capture at the given second of one minute. */
const captureAtSecond = (second: number) => {
  const capturedAt = `2026-09-14T04:41:${String(second).padStart(2, "0")}.000Z`;
  return { captured_at: capturedAt, original_captured_at: capturedAt };
};

/** Every burst, and each of the session's items with its place in one. */
const readBurstState = async (
  database: Kysely<Database>,
  sessionId: string,
) => {
  return {
    bursts: await database.selectFrom("bursts").selectAll().execute(),
    frames: await database
      .selectFrom("items")
      .select(["id", "burst_id", "burst_index"])
      .where("upload_session_id", "=", sessionId)
      .orderBy("captured_at")
      .execute(),
  };
};

describe("POST /api/upload-sessions/:sessionId/files/:fileId/retry", () => {
  it("puts a failed file back to waiting, keeping its attempts", async () => {
    const { b2, seedFile, post, readFile, close } = await setUp();
    const file = await seedFile({
      position: 1,
      overrides: {
        state: "failed",
        attempt_count: 2,
        problem_code: "connection_lost",
        problem_detail: "The network went away.",
        presigned_until: NOW,
        multipart_upload_id: "upload-old",
      },
    });
    // Still in flight, so the batch has not settled and the email is ahead.
    await seedFile({ position: 2 });

    const response = await post(file.fileId, "retry");

    expect(response.statusCode).toBe(200);
    expect(response.json<RetryUploadFileResponse>()).toMatchObject({
      isIncludedInEmail: true,
      file: {
        fileId: file.fileId,
        state: "waiting",
        problemCode: null,
        problemDetail: null,
        attemptCount: 2,
      },
    });
    expect(await readFile(file.fileId)).toMatchObject({
      state: "waiting",
      attempt_count: 2,
      problem_code: null,
      problem_detail: null,
      presigned_until: null,
      multipart_upload_id: null,
      content_hash: file.contentHash,
    });
    // The failure's own abort never got through; this one is outside the
    // transaction, and stops the old parts being billed.
    expect(b2.calls).toContain("abortMultipart");
    await close();
  });

  it.each(["waiting", "sending", "done", "refused", "cancelled"])(
    "refuses a %s row and says which state stopped it",
    async (state) => {
      const { seedFile, post, readFile, close } = await setUp();
      const file = await seedFile({ position: 1, overrides: { state } });

      const response = await post(file.fileId, "retry");

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "upload_file_conflict",
        details: { state },
      });
      expect((await readFile(file.fileId)).state).toBe(state);
      await close();
    },
  );

  it("sends no second email for a file recovered after the batch settled", async () => {
    const context = await setUp();
    const { database, sessionId, seedFile, readFile, close } = context;
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    // Somebody who can see the batch and wants to hear about it.
    await insertMember(database, { display_name: "Tía Inés" });
    const landed = await seedFile({ position: 1 });
    const dropped = await seedFile({ position: 2 });

    const settling = await settleWithOneDropped(context, {
      landed: [landed],
      dropped,
    });

    expect(settling.json<CompleteUploadFileResponse>().didSettle).toBe(true);
    expect(await countUploadEmails(database, sessionId)).toBe(1);

    const { retried, presigned, recovered } = await recoverDroppedFile(
      context,
      dropped,
    );

    expect(retried.json<RetryUploadFileResponse>()).toMatchObject({
      isIncludedInEmail: false,
      file: { state: "waiting" },
    });
    expect(presigned.statusCode).toBe(200);
    expect(recovered.json<CompleteUploadFileResponse>()).toMatchObject({
      didSettle: false,
      sessionState: "settled",
      file: { state: "done" },
    });
    expect(await countUploadEmails(database, sessionId)).toBe(1);
    const session = await database
      .selectFrom("upload_sessions")
      .select("settled_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.settled_at).toBe(NOW);
    expect((await readFile(dropped.fileId)).attempt_count).toBe(2);
    expect(
      await database.selectFrom("items").select("id").execute(),
    ).toHaveLength(2);
    await close();
  });

  it("answers one 404 for a file outside this batch, and for a stranger's session", async () => {
    const { app, database, memberId, sessionId, seedFile, post, close } =
      await setUp();
    const file = await seedFile({
      position: 1,
      overrides: { state: "failed" },
    });
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: NOW,
    });
    const elsewhereId = await insertUploadFile(database, {
      uploadSessionId: otherSessionId,
      state: "failed",
    });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });

    const forElsewhere = await post(elsewhereId, "retry");
    const forNothing = await post(createId(), "retry");
    const forAdmin = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${sessionId}/files/${file.fileId}/retry`,
      headers: { cookie: adminCookie },
    });
    const forNoSession = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${createId()}/files/${file.fileId}/retry`,
      headers: { cookie: adminCookie },
    });

    expect(forElsewhere.statusCode).toBe(404);
    expect(forElsewhere.json().error).toBe("upload_file_not_found");
    expect(forElsewhere.body).toBe(forNothing.body);
    expect(forAdmin.statusCode).toBe(404);
    expect(forAdmin.json().error).toBe("upload_session_not_found");
    expect(forAdmin.body).toBe(forNoSession.body);
    await close();
  });

  it("refuses a viewer on their own session", async () => {
    const { database, close, app } = await setUp();
    const viewer = await insertSignedInMember({
      database,
      token: "viewer",
      member: { role: "viewer" },
    });
    const viewerSessionId = await insertUploadSession(database, {
      uploadedBy: viewer.memberId,
    });
    const viewerFileId = await insertUploadFile(database, {
      uploadSessionId: viewerSessionId,
      state: "failed",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${viewerSessionId}/files/${viewerFileId}/retry`,
      headers: { cookie: viewer.cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("upload_forbidden");
    await close();
  });

  it("records the retry as activity on the batch", async () => {
    const { database, sessionId, seedFile, post, setTime, close } =
      await setUp();
    const file = await seedFile({
      position: 1,
      overrides: { state: "failed" },
    });
    const retriedAt = shiftMinutes({ instant: NOW, minutes: 5 });
    setTime(retriedAt);

    await post(file.fileId, "retry");

    const session = await database
      .selectFrom("upload_sessions")
      .select("last_activity_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.last_activity_at).toBe(retriedAt);
    await close();
  });

  it("aborts the stale multipart upload after its transaction has closed", async () => {
    // Every BEGIN IMMEDIATE the app issues goes through the watched handle,
    // so the watch knows exactly when a transaction is open.
    const watchedB2 = createFakeB2Client();
    const watch = failB2CallsInsideTransactions({
      database: createDatabase(":memory:"),
      b2: watchedB2,
    });
    const { b2, seedFile, post, readFile, close } = await setUp({
      database: watch.database,
      b2: watchedB2,
    });
    const file = await seedFile({
      position: 1,
      overrides: { state: "failed", multipart_upload_id: "upload-old" },
    });

    const response = await post(file.fileId, "retry");

    expect(response.statusCode).toBe(200);
    expect(b2.calls).toContain("abortMultipart");
    expect(watch.callsInsideTransactions).toEqual([]);
    expect((await readFile(file.fileId)).multipart_upload_id).toBeNull();
    await close();
  });

  it("takes this file's keys back from the deletion queue, and nobody else's", async () => {
    const { database, seedFile, post, close } = await setUp();
    const file = await seedFile({
      position: 1,
      overrides: { state: "failed", problem_code: "abandoned" },
    });
    const sibling = await seedFile({
      position: 2,
      overrides: { state: "failed", problem_code: "abandoned" },
    });
    const unrelatedKey = "uploads/another-session/another-file/original.jpg";
    // What the abandon sweep queues for a row it fails: every key it might
    // have written. The drain deletes by key and never checks use, so a key
    // the retry is about to reuse must leave the queue with the retry.
    for (const purpose of ["original", "display", "thumb", "poster"] as const) {
      await insertPendingObjectDeletion(database, {
        storageKey: file.keyOf(purpose),
      });
    }
    await insertPendingObjectDeletion(database, {
      storageKey: sibling.keyOf("original"),
    });
    await insertPendingObjectDeletion(database, { storageKey: unrelatedKey });

    const response = await post(file.fileId, "retry");

    expect(response.statusCode).toBe(200);
    const queued = await database
      .selectFrom("pending_object_deletions")
      .select("storage_key")
      .orderBy("storage_key")
      .execute();
    expect(
      queued.map((row) => {
        return row.storage_key;
      }),
    ).toEqual([unrelatedKey, sibling.keyOf("original")].toSorted());
    await close();
  });

  it("leaves the deletion queue alone when it refuses the retry", async () => {
    const { database, seedFile, post, close } = await setUp();
    const file = await seedFile({ position: 1, overrides: { state: "done" } });
    await insertPendingObjectDeletion(database, {
      storageKey: file.keyOf("original"),
    });

    const response = await post(file.fileId, "retry");

    expect(response.statusCode).toBe(409);
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .select("id")
        .execute(),
    ).toHaveLength(1);
    await close();
  });

  it("does not stack a file recovered after settling into the burst it fell inside", async () => {
    const context = await setUp();
    const { database, sessionId, seedFile, readFile, close } = context;
    // Three frames four seconds apart settle as one burst; the frame that
    // dropped was taken between the second and the third.
    const landed = [
      await seedFile({ position: 1, overrides: captureAtSecond(0) }),
      await seedFile({ position: 2, overrides: captureAtSecond(4) }),
      await seedFile({ position: 3, overrides: captureAtSecond(8) }),
    ];
    const dropped = await seedFile({
      position: 4,
      overrides: captureAtSecond(6),
    });
    await settleWithOneDropped(context, { landed, dropped });
    const settled = await readBurstState(database, sessionId);
    expect(settled.bursts).toHaveLength(1);
    expect(
      settled.frames.map((frame) => {
        return frame.burst_index;
      }),
    ).toEqual([1, 2, 3]);

    const { recovered } = await recoverDroppedFile(context, dropped);

    expect(recovered.statusCode).toBe(200);
    const recoveredItemId = (await readFile(dropped.fileId)).item_id;
    const after = await readBurstState(database, sessionId);
    expect(after.bursts).toEqual(settled.bursts);
    expect(
      after.frames.filter((frame) => {
        return frame.id !== recoveredItemId;
      }),
    ).toEqual(settled.frames);
    expect(
      after.frames.find((frame) => {
        return frame.id === recoveredItemId;
      }),
    ).toMatchObject({ burst_id: null, burst_index: null });
    await close();
  });
});
