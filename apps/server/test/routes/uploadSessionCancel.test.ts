import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

/** A draft with two manifest rows, one of them refused at the manifest. */
async function _insertDraft(
  database: Kysely<Database>,
  uploadedBy: string,
): Promise<{ sessionId: string; waitingId: string; refusedId: string }> {
  const sessionId = await insertUploadSession(database, {
    uploadedBy,
    state: "draft",
    committed_at: null,
  });
  const waitingId = await insertUploadFile(database, {
    uploadSessionId: sessionId,
    position: 0,
  });
  const refusedId = await insertUploadFile(database, {
    uploadSessionId: sessionId,
    position: 1,
    state: "refused",
    problem_code: "unsupported_type",
  });
  return { sessionId, waitingId, refusedId };
}

describe("DELETE /api/upload-sessions/:sessionId", () => {
  it("cancels a draft and its unfinished files, keeps the rows, and costs nothing in the bucket", async () => {
    const { app, database, b2, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const { sessionId, waitingId, refusedId } = await _insertDraft(
      database,
      memberId,
    );

    const response = await app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${sessionId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    const session = await database
      .selectFrom("upload_sessions")
      .select("state")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.state).toBe("cancelled");
    const files = await database
      .selectFrom("upload_files")
      .select(["id", "state"])
      .orderBy("position")
      .execute();
    expect(files).toEqual([
      { id: waitingId, state: "cancelled" },
      // Already terminal, so it keeps what it was.
      { id: refusedId, state: "refused" },
    ]);
    expect(b2.calls).toEqual([]);
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toEqual([]);
    await close();
  });

  it("lets an admin cancel another member's draft", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "admin" },
    });
    const otherId = await insertMember(database);
    const { sessionId } = await _insertDraft(database, otherId);

    const response = await app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${sessionId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    await close();
  });

  it("is one 404 for another uploader's draft and for no draft, and cancels nothing", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherId = await insertMember(database);
    const { sessionId } = await _insertDraft(database, otherId);

    const theirs = await app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${sessionId}`,
      headers: { cookie },
    });
    const nothing = await app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${createId()}`,
      headers: { cookie },
    });

    expect(theirs.statusCode).toBe(404);
    expect(theirs.body).toBe(nothing.body);
    const session = await database
      .selectFrom("upload_sessions")
      .select("state")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.state).toBe("draft");
    await close();
  });

  it("is 409 once committed, naming the batch to close instead", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${sessionId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "upload_session_conflict",
      details: { sessionId },
    });
    await close();
  });

  it("is 403 for a viewer's own old draft, and 401 without a session", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });
    const { sessionId } = await _insertDraft(database, memberId);

    const asViewer = await app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${sessionId}`,
      headers: { cookie },
    });
    const anonymous = await app.inject({
      method: "DELETE",
      url: `/api/upload-sessions/${sessionId}`,
    });

    expect(asViewer.statusCode).toBe(403);
    expect(asViewer.json().error).toBe("upload_forbidden");
    expect(anonymous.statusCode).toBe(401);
    await close();
  });
});
