import type { LightMyRequestResponse } from "fastify";

import type { Database } from "../../../../src/db/types/db.types.ts";
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
  FixtureOperations & {
    cookie: string;
    memberId: string;
    sessionId: string;
    fileIds: string[];
  };

/** Operations bound to one independently created upload fixture. */
type FixtureOperations = {
  postEdit: (
    payload: Record<string, unknown>,
  ) => Promise<LightMyRequestResponse>;
  deleteEdit: (editId: string) => Promise<LightMyRequestResponse>;
};

/** postEdit using this fixture's catalog and request context. */
function _postEditForFixture(
  input: Readonly<{
    context: {
      testApp: Awaited<ReturnType<typeof createTestApp>>;
      sessionId: string;
      cookie: string;
    };
    argument: Record<string, unknown>;
  }>,
): Promise<LightMyRequestResponse> {
  const { testApp, sessionId, cookie } = input.context;
  const payload = input.argument;

  return testApp.app.inject({
    method: "POST",
    url: `/api/upload-sessions/${sessionId}/edits`,
    headers: { cookie },
    payload,
  });
}

/** deleteEdit using this fixture's catalog and request context. */
function _deleteEditForFixture(
  input: Readonly<{
    context: {
      testApp: Awaited<ReturnType<typeof createTestApp>>;
      sessionId: string;
      cookie: string;
    };
    argument: string;
  }>,
): Promise<LightMyRequestResponse> {
  const { testApp, sessionId, cookie } = input.context;
  const editId = input.argument;

  return testApp.app.inject({
    method: "DELETE",
    url: `/api/upload-sessions/${sessionId}/edits/${editId}`,
    headers: { cookie },
  });
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
  const postEdit = (payload: Record<string, unknown>) => {
    return _postEditForFixture({
      context: { testApp, sessionId, cookie },
      argument: payload,
    });
  };
  const deleteEdit = (editId: string) => {
    return _deleteEditForFixture({
      context: { testApp, sessionId, cookie },
      argument: editId,
    });
  };
  return { postEdit, deleteEdit };
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
    state: "draft",
    committed_at: null,
    file_count: 0,
    total_bytes: 0,
    last_activity_at: shiftMinutes({ instant: NOW, minutes: -30 }),
    ...sessionOverrides,
  });
  const insertFileAtPosition = (position: number): Promise<string> => {
    return insertUploadFile(testApp.database, {
      uploadSessionId: sessionId,
      position,
    });
  };
  const [firstFileId, secondFileId, thirdFileId] = await Promise.all([
    insertFileAtPosition(1),
    insertFileAtPosition(2),
    insertFileAtPosition(3),
  ]);
  const { postEdit, deleteEdit } = _makeOperationsFromFixtureContext({
    testApp,
    sessionId,
    cookie,
  });
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    fileIds: [firstFileId, secondFileId, thirdFileId],
    postEdit,
    deleteEdit,
  };
}
