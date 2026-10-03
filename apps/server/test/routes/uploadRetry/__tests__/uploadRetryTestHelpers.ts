import type { Selectable, Kysely } from "kysely";
import type { LightMyRequestResponse, FastifyInstance } from "fastify";
import { createHash } from "node:crypto";

import type { RenditionPurpose } from "@memory-shoebox/shared";

import { createId } from "../../../../src/db/createId.ts";
import type { Database } from "../../../../src/db/types/db.types.ts";
import { makeUploadStorageKeyFromRendition } from "../../../../src/upload/presignUploadFile/uploadStorageKeyHelpers.ts";
import { type FakeB2Client } from "../../../helpers/createFakeB2Client/createFakeB2Client.ts";
import { createTestApp } from "../../../helpers/createTestApp.ts";

import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertUploadFile,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

/** One independently created upload test fixture. */
type FixtureContext = Awaited<ReturnType<typeof createTestApp>> & {
  cookie: string;
  memberId: string;
  sessionId: string;
  seedFile: ReturnType<typeof makeUploadFileSeederFromContext>;
  post: ReturnType<typeof makeUploadRequestPosterFromContext>;
  readFile: (
    fileId: string,
  ) => Promise<import("kysely").Selectable<Database["upload_files"]>>;
  setTime: (instant: string) => void;
};

/**
 * JPEG MIME type used by these fixtures.
 */
export const JPEG = "image/jpeg";

/**
 * Returns the number of queued upload-session emails for this batch.
 */
export async function countUploadEmails(
  functionOptions: Readonly<{ database: Kysely<Database>; sessionId: string }>,
): Promise<number> {
  const { database, sessionId } = functionOptions;

  const rows = await database
    .selectFrom("outbound_emails")
    .select("id")
    .where("idempotency_key", "like", `upload:${sessionId}:%`)
    .execute();
  return rows.length;
}

/** What `seedFile` hands back: the row's id, its hash, and its keys. */
export type SeededFile = {
  fileId: string;
  contentHash: string;
  keyOf: (purpose: RenditionPurpose) => string;
};

/**
 * A `sending` file with every capture column filled, ready to be overridden.
 */
export function makeUploadFileSeederFromContext(
  options: Readonly<{
    database: Kysely<Database>;
    sessionId: string;
  }>,
): (fileOptions: {
  position: number;
  overrides?: Partial<Database["upload_files"]>;
}) => Promise<SeededFile> {
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
}

/** One signed-in POST to a file's route. */
export function makeUploadRequestPosterFromContext(
  options: Readonly<{
    app: FastifyInstance;
    cookie: string;
    sessionId: string;
  }>,
): (
  functionOptions: Readonly<{
    fileId: string;
    action: "presign" | "complete" | "retry";
    payload?: Record<string, unknown>;
  }>,
) => Promise<LightMyRequestResponse> {
  return (
    functionOptions: Readonly<{
      fileId: string;
      action: "presign" | "complete" | "retry";
      payload?: Record<string, unknown>;
    }>,
  ) => {
    const { fileId, action, payload } = functionOptions;

    return options.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${options.sessionId}/files/${fileId}/${action}`,
      headers: { cookie: options.cookie },
      payload,
    });
  };
}

/**
 * Creates an upload-route fixture and returns its catalog and request
 * helpers.
 */
export async function setUpUploadTestContext(
  options: Readonly<{ database?: Kysely<Database>; b2?: FakeB2Client }> = {},
): Promise<FixtureContext> {
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
    seedFile: makeUploadFileSeederFromContext({
      database: testApp.database,
      sessionId,
    }),
    post: makeUploadRequestPosterFromContext({
      app: testApp.app,
      cookie,
      sessionId,
    }),
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
}

/**
 * Catalog and request helpers returned by the retry-route fixture.
 */
export type RetryContext = Awaited<ReturnType<typeof setUpUploadTestContext>>;

/** The body of a `complete` that lands a 1 KiB original. */
export function doneBody(file: Readonly<SeededFile>): {
  outcome: string;
  contentHash: string;
  byteSize: number;
} {
  return { outcome: "done", contentHash: file.contentHash, byteSize: 1024 };
}

/** Puts a 1 KiB JPEG in the fake bucket under the file's original key. */
export function storeOriginal(
  functionOptions: Readonly<{ context: RetryContext; file: SeededFile }>,
): void {
  const { context, file } = functionOptions;

  context.b2.storedObjects.set(file.keyOf("original"), {
    sizeBytes: 1024,
    contentType: JPEG,
  });
}

/**
 * Lands every `landed` file, then fails `dropped`, which settles the batch:
 * the last file to end runs the latch.
 */
export async function settleWithOneDropped(
  functionOptions: Readonly<{
    context: RetryContext;
    files: { landed: readonly SeededFile[]; dropped: SeededFile };
  }>,
): Promise<LightMyRequestResponse> {
  const { context, files } = functionOptions;

  for (const file of files.landed) {
    storeOriginal({ context: context, file: file });
    await context.post({
      fileId: file.fileId,
      action: "complete",
      payload: doneBody(file),
    });
  }
  return context.post({
    fileId: files.dropped.fileId,
    action: "complete",
    payload: {
      outcome: "failed",
      problemCode: "connection_lost",
    },
  });
}

/** Five minutes on: retry, presign and complete the dropped file again. */
export async function recoverDroppedFile(
  functionOptions: Readonly<{ context: RetryContext; dropped: SeededFile }>,
): Promise<{
  retried: LightMyRequestResponse;
  presigned: LightMyRequestResponse;
  recovered: LightMyRequestResponse;
}> {
  const { context, dropped } = functionOptions;

  context.setTime(shiftMinutes({ instant: NOW, minutes: 5 }));
  const retried = await context.post({
    fileId: dropped.fileId,
    action: "retry",
  });
  const presigned = await context.post({
    fileId: dropped.fileId,
    action: "presign",
    payload: {
      contentHash: dropped.contentHash,
      byteSize: 1024,
    },
  });
  storeOriginal({ context: context, file: dropped });
  const recovered = await context.post({
    fileId: dropped.fileId,
    action: "complete",
    payload: doneBody(dropped),
  });
  return { retried, presigned, recovered };
}

/** A camera-dated capture at the given second of one minute. */
export function captureAtSecond(second: number): {
  captured_at: string;
  original_captured_at: string;
} {
  const capturedAt = `2026-09-14T04:41:${String(second).padStart(2, "0")}.000Z`;
  return { captured_at: capturedAt, original_captured_at: capturedAt };
}

/** Every burst, and each of the session's items with its place in one. */
export async function readBurstState(
  functionOptions: Readonly<{ database: Kysely<Database>; sessionId: string }>,
): Promise<{
  bursts: Array<Selectable<Database["bursts"]>>;
  frames: Array<
    Pick<Selectable<Database["items"]>, "id" | "burst_id" | "burst_index">
  >;
}> {
  const { database, sessionId } = functionOptions;

  return {
    bursts: await database.selectFrom("bursts").selectAll().execute(),
    frames: await database
      .selectFrom("items")
      .select(["id", "burst_id", "burst_index"])
      .where("upload_session_id", "=", sessionId)
      .orderBy("captured_at")
      .execute(),
  };
}
