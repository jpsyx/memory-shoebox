import { describe, expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _makeApp() {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
}

describe("GET /api/upload-sessions/:sessionId", () => {
  it("serves the uploader's own batch", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    await insertUploadFile(database, { uploadSessionId: sessionId });

    const response = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${sessionId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sessionId,
      state: "uploading",
      progress: { waitingCount: 1 },
    });
    await close();
  });

  it("serves any batch to an admin", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "admin" },
    });
    const otherId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: otherId,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${sessionId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().uploadedBy.memberId).toBe(otherId);
    await close();
  });

  it("is one 404 for another uploader's batch and for no batch", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: otherId,
    });

    const theirs = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${sessionId}`,
      headers: { cookie },
    });
    const nothing = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${createId()}`,
      headers: { cookie },
    });

    expect(theirs.statusCode).toBe(404);
    expect(theirs.json().error).toBe("upload_session_not_found");
    expect(theirs.body).toBe(nothing.body);
    await close();
  });

  it("is a 404 before it is a 403, so a viewer learns nothing by probing", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });
    // Uploaded before this member was made a viewer.
    const ownId = await insertUploadSession(database, { uploadedBy: memberId });
    const otherId = await insertMember(database);
    const theirsId = await insertUploadSession(database, {
      uploadedBy: otherId,
    });

    const own = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${ownId}`,
      headers: { cookie },
    });
    const theirs = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${theirsId}`,
      headers: { cookie },
    });

    expect(own.statusCode).toBe(403);
    expect(own.json().error).toBe("upload_forbidden");
    expect(theirs.statusCode).toBe(404);
    await close();
  });

  it("refuses a limit over the cap, an unknown state and a foreign cursor", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });

    const urls = [
      `/api/upload-sessions/${sessionId}?limit=501`,
      `/api/upload-sessions/${sessionId}?states=failed,lost`,
      `/api/upload-sessions/${sessionId}?cursor=not-a-cursor`,
    ];
    const responses = await Promise.all(
      urls.map((url) => {
        return app.inject({ method: "GET", url, headers: { cookie } });
      }),
    );

    expect(
      responses.map((response) => {
        return [response.statusCode, response.json().error];
      }),
    ).toEqual([
      [400, "invalid_request"],
      [400, "invalid_request"],
      [400, "invalid_request"],
    ]);
    await close();
  });

  it("pages the files and filters them by state", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 0,
      state: "done",
    });
    const failedId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      state: "failed",
      problem_code: "connection_lost",
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 2,
    });

    const firstPage = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${sessionId}?limit=2`,
      headers: { cookie },
    });
    const secondPage = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${sessionId}?limit=2&cursor=${firstPage.json().nextCursor}`,
      headers: { cookie },
    });
    const failedOnly = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${sessionId}?states=failed`,
      headers: { cookie },
    });

    expect(firstPage.json().files).toHaveLength(2);
    expect(secondPage.json().files).toHaveLength(1);
    expect(secondPage.json().nextCursor).toBeNull();
    expect(
      failedOnly.json().files.map((file: { fileId: string }) => {
        return file.fileId;
      }),
    ).toEqual([failedId]);
    await close();
  });
});
