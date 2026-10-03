import { CAPTURE, setUpUploadTestContext } from "./setUpUploadTestContext.ts";
import { describe, expect, it } from "vitest";
import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { createId } from "../../../../src/db/createId.ts";

import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/commit", () => {
  it.each([
    ["arm", "uploading", "waiting"],
    ["arm", "settled", "failed"],
    ["close", "settled", "failed"],
  ] as const)(
    "answers an idempotent 200 and writes nothing: %s on a %s batch",
    async (intent, sessionState, fileState) => {
      const {
        database,
        b2,
        sessionId,
        commit,
        readSession,
        readFiles,
        close,
        advanceClock,
      } = await setUpUploadTestContext({
        state: sessionState,
        committed_at: NOW,
        settled_at: sessionState === "settled" ? NOW : null,
        file_count: 1,
      });
      await insertUploadFile(database, {
        uploadSessionId: sessionId,
        position: 1,
        state: fileState,
        problem_code: fileState === "failed" ? "connection_lost" : null,
        ...CAPTURE,
      });
      const sessionBefore = await readSession();
      const filesBefore = await readFiles();
      advanceClock();

      const response = await commit({ intent: intent });

      expect(response.statusCode).toBe(200);
      expect(response.json<UploadSessionDetail>()).toMatchObject({
        sessionId,
        state: sessionState,
      });
      expect(await readSession()).toEqual(sessionBefore);
      expect(await readFiles()).toEqual(filesBefore);
      expect(b2.calls).not.toContain("abortMultipart");
      await close();
    },
  );

  it.each([
    ["close", "draft", { state: "draft", committed_at: null }],
    ["arm", "cancelled", { state: "cancelled", committed_at: null }],
    ["close", "cancelled", { state: "cancelled", committed_at: null }],
  ] as const)(
    "refuses %s on a %s session",
    async (intent, sessionState, overrides) => {
      const { database, sessionId, commit, readSession, readFiles, close } =
        await setUpUploadTestContext(overrides);
      await insertUploadFile(database, {
        uploadSessionId: sessionId,
        position: 1,
        ...CAPTURE,
      });
      const sessionBefore = await readSession();
      const filesBefore = await readFiles();

      const response = await commit({ intent: intent });

      expect(sessionBefore.state).toBe(sessionState);
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("upload_session_conflict");
      expect(await readSession()).toEqual(sessionBefore);
      expect(await readFiles()).toEqual(filesBefore);
      await close();
    },
  );

  it.each([
    ["no body", undefined],
    ["an empty object", {}],
    ["an unknown intent", { intent: "commit" }],
    ["a non-string intent", { intent: true }],
  ] as const)(
    "is a 400 for %s, and changes nothing",
    async (_name, payload) => {
      const { app, database, cookie, sessionId, readSession, close } =
        await setUpUploadTestContext();
      await insertUploadFile(database, {
        uploadSessionId: sessionId,
        position: 1,
        ...CAPTURE,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/upload-sessions/${sessionId}/commit`,
        headers: { cookie },
        ...(payload === undefined ? {} : { payload }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("invalid_request");
      expect(await readSession()).toMatchObject({
        state: "draft",
        committed_at: null,
      });
      await close();
    },
  );

  it("is the uploader's alone: one 404 for anybody else, an admin included", async () => {
    const { app, database, commit, close } = await setUpUploadTestContext();
    const { cookie: otherCookie } = await insertSignedInMember({
      database,
      token: "other-uploader",
    });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });
    const viewer = await insertSignedInMember({
      database,
      token: "viewer",
      member: { role: "viewer" },
    });
    const viewerSessionId = await insertUploadSession(database, {
      uploadedBy: viewer.memberId,
      state: "draft",
      committed_at: null,
    });

    const forOther = await commit({ intent: "arm", cookieToSend: otherCookie });
    const forAdmin = await commit({ intent: "arm", cookieToSend: adminCookie });
    const forNothing = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${createId()}/commit`,
      headers: { cookie: otherCookie },
      payload: { intent: "arm" },
    });
    const forViewer = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${viewerSessionId}/commit`,
      headers: { cookie: viewer.cookie },
      payload: { intent: "arm" },
    });

    expect(forOther.statusCode).toBe(404);
    expect(forOther.json().error).toBe("upload_session_not_found");
    expect(forAdmin.body).toBe(forOther.body);
    expect(forNothing.body).toBe(forOther.body);
    expect(forViewer.statusCode).toBe(403);
    expect(forViewer.json().error).toBe("upload_forbidden");
    await close();
  });
});
