import type { Selectable } from "kysely";
import type { LightMyRequestResponse } from "fastify";

import type { Database } from "../../../../src/db/types/db.types.ts";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

/** One independently created upload test fixture. */
type FixtureContext = Awaited<ReturnType<typeof createTestApp>> &
  FixtureOperations & {
    cookie: string;
    memberId: string;
    sessionId: string;
    commit: (
      functionOptions: Readonly<{
        intent: "arm" | "close";
        cookieToSend?: string;
      }>,
    ) => Promise<LightMyRequestResponse>;
  };

/** makeOperationsFromFixtureContext inputs or output fields. */
type MakeOperationsFromFixtureContextShape = {
  cookie: string;
  testApp: Awaited<ReturnType<typeof createTestApp>>;
  sessionId: string;
  clock: { instant: string };
};

/** Operations bound to one independently created upload fixture. */
type FixtureOperations = {
  commit: (
    functionOptions: Readonly<{
      intent: "arm" | "close";
      cookieToSend?: string;
    }>,
  ) => Promise<LightMyRequestResponse>;
  readSession: () => Promise<Selectable<Database["upload_sessions"]>>;
  readFiles: () => Promise<Array<Selectable<Database["upload_files"]>>>;
  advanceClock: () => void;
};

/** commit using this fixture's catalog and request context. */
function _commitForFixture(
  input: Readonly<{
    context: {
      cookie: string;
      testApp: Awaited<ReturnType<typeof createTestApp>>;
      sessionId: string;
    };
    argument: Readonly<{ intent: "arm" | "close"; cookieToSend?: string }>;
  }>,
): Promise<LightMyRequestResponse> {
  const { cookie, testApp, sessionId } = input.context;
  const functionOptions = input.argument;

  const { intent, cookieToSend = cookie } = functionOptions;

  return testApp.app.inject({
    method: "POST",
    url: `/api/upload-sessions/${sessionId}/commit`,
    headers: { cookie: cookieToSend },
    payload: { intent },
  });
}

/** Binds upload operations to one fixture without sharing live resources. */
function _makeOperationsFromFixtureContext(
  context: Readonly<MakeOperationsFromFixtureContextShape>,
): FixtureOperations {
  const { cookie, testApp, sessionId, clock } = context;
  const commit = (
    functionOptions: Readonly<{
      intent: "arm" | "close";
      cookieToSend?: string;
    }>,
  ) => {
    return _commitForFixture({
      context: { cookie, testApp, sessionId },
      argument: functionOptions,
    });
  };
  const readSession = () => {
    return testApp.database
      .selectFrom("upload_sessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
  };
  const readFiles = () => {
    return testApp.database
      .selectFrom("upload_files")
      .selectAll()
      .where("upload_session_id", "=", sessionId)
      .orderBy("position", "asc")
      .execute();
  };
  const advanceClock = () => {
    clock.instant = LATER;
  };
  return { commit, readSession, readFiles, advanceClock };
}

/**
 * Capture columns for the EXIF-dated fixture photograph.
 */
export const CAPTURE = {
  captured_at: "2026-09-14T04:41:32.000Z",
  capture_date: "2026-09-14",
  capture_offset_minutes: 120,
  capture_source: "exif",
  original_captured_at: "2026-09-14T04:41:32.000Z",
};

/**
 * The instant a repeat commit runs at, so a write shows as a changed column.
 */
export const LATER = "2026-09-20T12:00:00.000Z";

/**
 * Creates an upload-route fixture and returns its catalog and request
 * helpers.
 */
export async function setUpUploadTestContext(
  sessionOverrides: Partial<Database["upload_sessions"]> = {},
): Promise<FixtureContext> {
  const clock = { instant: NOW };
  const testApp = await createTestApp({
    clock: () => {
      return new Date(clock.instant);
    },
  });
  const { cookie, memberId } = await insertSignedInMember({
    database: testApp.database,
  });
  const sessionId = await insertUploadSession(testApp.database, {
    uploadedBy: memberId,
    state: "draft",
    committed_at: null,
    file_count: 0,
    total_bytes: 0,
    last_activity_at: shiftMinutes({ instant: NOW, minutes: -30 }),
    ...sessionOverrides,
  });
  const { commit, readSession, readFiles, advanceClock } =
    _makeOperationsFromFixtureContext({ cookie, testApp, sessionId, clock });
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    commit,
    readSession,
    readFiles,
    advanceClock,
  };
}
