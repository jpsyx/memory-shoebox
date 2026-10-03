import type { Selectable } from "kysely";
import type { LightMyRequestResponse } from "fastify";
import { createHash } from "node:crypto";

import { appConfig } from "../../../../../../app.config.ts";

import type { Database } from "../../../../src/db/types/db.types.ts";

import type { FakeB2Client } from "../../../helpers/createFakeB2Client/createFakeB2Client.ts";
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
  seedFile: (
    overrides: { position: number } & Partial<Database["upload_files"]>,
  ) => Promise<string>;
  presign: (
    functionOptions: Readonly<{
      fileId: string;
      payload: Record<string, unknown>;
    }>,
  ) => Promise<LightMyRequestResponse>;
  readFile: (fileId: string) => Promise<Selectable<Database["upload_files"]>>;
  readSession: () => Promise<Selectable<Database["upload_sessions"]>>;
};

/** seedFile using this fixture's catalog and request context. */
function _seedFileForFixture(
  input: Readonly<{
    context: {
      testApp: Awaited<ReturnType<typeof createTestApp>>;
      sessionId: string;
    };
    argument: { position: number } & Partial<Database["upload_files"]>;
  }>,
): Promise<string> {
  const { testApp, sessionId } = input.context;
  const overrides = input.argument;

  return insertUploadFile(testApp.database, {
    uploadSessionId: sessionId,
    declared_bytes: 1024,
    ...overrides,
  });
}

/** presign using this fixture's catalog and request context. */
function _presignForFixture(
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
    url: `/api/upload-sessions/${sessionId}/files/${fileId}/presign`,
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
    testApp: Awaited<ReturnType<typeof createTestApp>>;
    sessionId: string;
    cookie: string;
  }>,
): FixtureOperations {
  const { testApp, sessionId, cookie } = context;
  const seedFile = (
    overrides: { position: number } & Partial<Database["upload_files"]>,
  ) => {
    return _seedFileForFixture({
      context: { testApp, sessionId },
      argument: overrides,
    });
  };
  const presign = (
    functionOptions: Readonly<{
      fileId: string;
      payload: Record<string, unknown>;
    }>,
  ) => {
    return _presignForFixture({
      context: { testApp, sessionId, cookie },
      argument: functionOptions,
    });
  };
  const readFile = (fileId: string) => {
    return _readFileForFixture({ context: { testApp }, argument: fileId });
  };
  const readSession = () => {
    return testApp.database
      .selectFrom("upload_sessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
  };
  return { seedFile, presign, readFile, readSession };
}

/**
 * Deterministic SHA-256 checksum used by the fixtures.
 */
export const HASH = createHash("sha256").update("the bytes").digest("hex");

/**
 * An earlier fixture timestamp used to detect a persisted update.
 */
export const EARLIER = shiftMinutes({ instant: NOW, minutes: -10 });

/**
 * Presigned URL expiry used by the fixture.
 */
export const EXPIRES_AT = new Date(
  Date.parse(NOW) + appConfig.upload.presignTtlSeconds * 1000,
).toISOString();

/**
 * Original byte size that exercises the multipart upload path.
 */
export const MULTIPART_BYTES = appConfig.upload.multipartThresholdBytes + 1;

/**
 * Number of parts required for the multipart fixture original.
 */
export const MULTIPART_PART_COUNT = Math.ceil(
  MULTIPART_BYTES / appConfig.upload.multipartPartSizeBytes,
);

/**
 * Holds every `presignMultipart` until `heldCount` of them are in flight, then
 * lets them all through, so two presigns that both read their row before
 * either writes it are both past Backblaze when the writes begin. Answers the
 * ids Backblaze handed out, in the order it opened them.
 */
export function holdPresignMultipart(
  functionOptions: Readonly<{ b2: FakeB2Client; heldCount: number }>,
): { openedUploadIds: string[] } {
  const { b2, heldCount } = functionOptions;

  const openedUploadIds: string[] = [];
  const gate = Promise.withResolvers<void>();
  const presignMultipart = b2.presignMultipart;
  let inFlightCount = 0;
  b2.presignMultipart = async (options) => {
    inFlightCount += 1;
    if (inFlightCount === heldCount) {
      gate.resolve();
    }
    await gate.promise;
    const started = await presignMultipart(options);
    openedUploadIds.push(started.uploadId);
    return started;
  };
  return { openedUploadIds };
}

/**
 * Creates an upload-route fixture and returns its catalog and request
 * helpers.
 */
export async function setUpUploadTestContext(
  sessionOverrides: Partial<Database["upload_sessions"]> = {},
): Promise<FixtureContext> {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const { cookie, memberId } = await insertSignedInMember({
    database: testApp.database,
  });
  const sessionId = await insertUploadSession(testApp.database, {
    uploadedBy: memberId,
    last_activity_at: EARLIER,
    ...sessionOverrides,
  });
  const { seedFile, presign, readFile, readSession } =
    _makeOperationsFromFixtureContext({ testApp, sessionId, cookie });
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    seedFile,
    presign,
    readFile,
    readSession,
  };
}
