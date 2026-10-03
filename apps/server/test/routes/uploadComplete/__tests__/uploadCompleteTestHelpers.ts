import type { Selectable, Kysely } from "kysely";
import type { LightMyRequestResponse } from "fastify";
import { createHash } from "node:crypto";

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
type FixtureContext = Awaited<ReturnType<typeof createTestApp>> &
  FixtureOperations & { cookie: string; memberId: string; sessionId: string };

/** Operations bound to one independently created upload fixture. */
type FixtureOperations = {
  seedFile: (fileOptions: {
    position: number;
    multipartUploadId?: string;
    overrides?: Partial<Database["upload_files"]>;
  }) => Promise<{
    fileId: string;
    contentHash: string;
    keyOf: (purpose: "original" | "display" | "thumb") => string;
  }>;
  complete: (
    functionOptions: Readonly<{
      fileId: string;
      payload: Record<string, unknown>;
    }>,
  ) => Promise<LightMyRequestResponse>;
  readFile: (fileId: string) => Promise<Selectable<Database["upload_files"]>>;
  countItems: () => Promise<number>;
};

/** seedFile using this fixture's catalog and request context. */
async function _seedFileForFixture(
  input: Readonly<{
    context: {
      sessionId: string;
      testApp: Awaited<ReturnType<typeof createTestApp>>;
    };
    argument: Parameters<FixtureOperations["seedFile"]>[0];
  }>,
): ReturnType<FixtureOperations["seedFile"]> {
  const { sessionId, testApp } = input.context;
  const fileOptions = input.argument;

  const fileId = createId();
  const contentHash = createHash("sha256").update(fileId).digest("hex");
  const keyOf = _makeKeyLookupFromFile({ sessionId, fileId });
  await insertUploadFile(testApp.database, {
    id: fileId,
    uploadSessionId: sessionId,
    position: fileOptions.position,
    state: "sending",
    declared_bytes: 1024,
    content_hash: contentHash,
    storage_key: keyOf("original"),
    multipart_upload_id: fileOptions.multipartUploadId ?? null,
    captured_at: "2026-09-14T04:41:32.000Z",
    capture_date: "2026-09-14",
    capture_offset_minutes: 120,
    capture_source: "exif",
    original_captured_at: "2026-09-14T04:41:32.000Z",
    width: 4032,
    height: 3024,
    ...fileOptions.overrides,
  });
  if (fileOptions.multipartUploadId !== undefined) {
    // What Backblaze assembles from the parts once `complete` asks it to.
    testApp.b2.multipartObjects.set(keyOf("original"), {
      sizeBytes: fileOptions.overrides?.declared_bytes ?? 1024,
      contentType: JPEG,
    });
  }
  return { fileId, contentHash, keyOf };
}

/** complete using this fixture's catalog and request context. */
function _completeForFixture(
  input: Readonly<{
    context: {
      testApp: Awaited<ReturnType<typeof createTestApp>>;
      sessionId: string;
      cookie: string;
    };
    argument: Readonly<{ fileId: string; payload: Record<string, unknown> }>;
  }>,
): Promise<LightMyRequestResponse> {
  const { testApp, sessionId, cookie } = input.context;
  const functionOptions = input.argument;

  const { fileId, payload } = functionOptions;

  return testApp.app.inject({
    method: "POST",
    url: `/api/upload-sessions/${sessionId}/files/${fileId}/complete`,
    headers: { cookie },
    payload,
  });
}

/** readFile using this fixture's catalog and request context. */
function _readFileForFixture(
  input: Readonly<{
    context: { testApp: Awaited<ReturnType<typeof createTestApp>> };
    argument: string;
  }>,
): Promise<Selectable<Database["upload_files"]>> {
  const { testApp } = input.context;
  const fileId = input.argument;

  return testApp.database
    .selectFrom("upload_files")
    .selectAll()
    .where("id", "=", fileId)
    .executeTakeFirstOrThrow();
}

/** Binds upload operations to one fixture without sharing live resources. */
function _makeOperationsFromFixtureContext(
  context: Readonly<{
    sessionId: string;
    testApp: Awaited<ReturnType<typeof createTestApp>>;
    cookie: string;
  }>,
): FixtureOperations {
  const { sessionId, testApp, cookie } = context;
  const seedFile = (fileOptions: {
    position: number;
    multipartUploadId?: string;
    overrides?: Partial<Database["upload_files"]>;
  }) => {
    return _seedFileForFixture({
      context: { sessionId, testApp },
      argument: fileOptions,
    });
  };
  const complete = (
    functionOptions: Readonly<{
      fileId: string;
      payload: Record<string, unknown>;
    }>,
  ) => {
    return _completeForFixture({
      context: { testApp, sessionId, cookie },
      argument: functionOptions,
    });
  };
  const readFile = (fileId: string) => {
    return _readFileForFixture({ context: { testApp }, argument: fileId });
  };
  const countItems = async () => {
    return (await testApp.database.selectFrom("items").select("id").execute())
      .length;
  };
  return { seedFile, complete, readFile, countItems };
}

/** Inputs for changeRowDuringVerification. */
export type ChangeRowDuringVerificationOptions = {
  b2: FakeB2Client;
  database: Kysely<Database>;
  operation: "headObject" | "completeMultipart";
  fileId: string;
  changes: Partial<Database["upload_files"]>;
  key?: string;
};

/**
 * JPEG MIME type used by these fixtures.
 */
export const JPEG = "image/jpeg";

/**
 * Reported display rendition for the completion fixtures.
 */
export const DISPLAY = {
  purpose: "display",
  byteSize: 200_000,
  width: 1536,
  height: 2048,
};

/**
 * Reported thumbnail rendition for the completion fixtures.
 */
export const THUMB = {
  purpose: "thumb",
  byteSize: 40_000,
  width: 360,
  height: 480,
};

/**
 * A gate two callers must both reach before either passes, so two completes of
 * one file are both past their verification before either writes. A short
 * timer frees them if the second never comes, so a regression fails rather
 * than hangs.
 */
export function makeGateForTwoCallers(): () => Promise<void> {
  let arrivedCount = 0;
  let release = (): void => {};
  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
    setTimeout(resolve, 250);
  });
  return async () => {
    arrivedCount += 1;
    if (arrivedCount === 2) {
      release();
    }
    await bothArrived;
  };
}

/** Holds every `headObject` until two have been asked. */
export function holdHeadObjectsUntilTwoAreAsked(
  options: Readonly<{ b2: FakeB2Client }>,
): void {
  const { b2 } = options;
  const passGate = makeGateForTwoCallers();
  const headObject = b2.headObject;
  b2.headObject = async (request) => {
    await passGate();
    return headObject(request);
  };
}

/** Holds every `completeMultipart` until two have been asked. */
export function holdCompleteMultipartsUntilTwoAreAsked(
  options: Readonly<{ b2: FakeB2Client }>,
): void {
  const { b2 } = options;
  const passGate = makeGateForTwoCallers();
  const completeMultipart = b2.completeMultipart;
  b2.completeMultipart = async (request) => {
    await passGate();
    return completeMultipart(request);
  };
}

/**
 * Rewrites the file's row at the start of the named Backblaze operation, which
 * is what a sweep, a commit-close or a re-presign does to a row while a
 * `complete` is verifying it. The fake's `onCall` is synchronous and cannot
 * wait for a write, so the write rides on the operation itself instead. With
 * `key`, only the operation on that object rewrites the row, so another
 * file's verification in the same test leaves it alone.
 */
export function changeRowDuringVerification(
  options: Readonly<ChangeRowDuringVerificationOptions>,
): void {
  const { b2, database } = options;
  const rewriteRow = async (key: string): Promise<void> => {
    if (options.key !== undefined && options.key !== key) {
      return;
    }
    await database
      .updateTable("upload_files")
      .set(options.changes)
      .where("id", "=", options.fileId)
      .execute();
  };
  if (options.operation === "headObject") {
    const headObject = b2.headObject;
    b2.headObject = async (callOptions) => {
      await rewriteRow(callOptions.key);
      return headObject(callOptions);
    };
    return;
  }
  const completeMultipart = b2.completeMultipart;
  b2.completeMultipart = async (callOptions) => {
    await rewriteRow(callOptions.key);
    return completeMultipart(callOptions);
  };
}

/**
 * Creates an upload-route fixture and returns its catalog and request
 * helpers.
 */
export async function setUpUploadTestContext(
  options: Readonly<{
    database?: Kysely<Database>;
    b2?: FakeB2Client;
    session?: Partial<Database["upload_sessions"]>;
  }> = {},
): Promise<FixtureContext> {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
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
    ...options.session,
  });
  const { seedFile, complete, readFile, countItems } =
    _makeOperationsFromFixtureContext({ sessionId, testApp, cookie });
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    seedFile,
    complete,
    readFile,
    countItems,
  };
}

// Bind all rendition keys to the same seeded file.
function _makeKeyLookupFromFile(
  options: Readonly<{ sessionId: string; fileId: string }>,
): Awaited<ReturnType<FixtureOperations["seedFile"]>>["keyOf"] {
  const { sessionId, fileId } = options;
  return (purpose: "original" | "display" | "thumb") => {
    return makeUploadStorageKeyFromRendition({
      sessionId,
      fileId,
      purpose,
      declaredContentType: JPEG,
    });
  };
}
