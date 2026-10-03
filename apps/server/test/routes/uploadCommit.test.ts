import { describe, expect, it } from "vitest";
import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertRendition,
  insertUploadFile,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const CAPTURE = {
  captured_at: "2026-09-14T04:41:32.000Z",
  capture_date: "2026-09-14",
  capture_offset_minutes: 120,
  capture_source: "exif",
  original_captured_at: "2026-09-14T04:41:32.000Z",
};

/** The instant a repeat commit runs at, so a write shows as a changed column. */
const LATER = "2026-09-20T12:00:00.000Z";

type Intent = "arm" | "close";

const setUp = async (
  sessionOverrides: Partial<Database["upload_sessions"]> = {},
) => {
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
  const commit = (intent: Intent, cookieToSend: string = cookie) => {
    return testApp.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${sessionId}/commit`,
      headers: { cookie: cookieToSend },
      payload: { intent },
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
};

describe("POST /api/upload-sessions/:sessionId/commit", () => {
  it("arms a draft and freezes the figures it committed to", async () => {
    const { database, b2, sessionId, commit, readSession, close } =
      await setUp();
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      declared_bytes: 3_000_000,
      ...CAPTURE,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 2,
      declared_bytes: 2_000_000,
      ...CAPTURE,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 3,
      original_filename: "menu.pdf",
      declared_content_type: "application/pdf",
      declared_bytes: 900_000,
      kind: null,
      state: "refused",
      problem_code: "unsupported_type",
    });

    const response = await commit("arm");

    expect(response.statusCode).toBe(200);
    expect(response.json<UploadSessionDetail>()).toMatchObject({
      sessionId,
      state: "uploading",
      committedAt: NOW,
      settledAt: null,
      fileCount: 3,
      totalBytes: 5_000_000,
    });
    expect(await readSession()).toMatchObject({
      state: "uploading",
      committed_at: NOW,
      last_activity_at: NOW,
      file_count: 3,
      total_bytes: 5_000_000,
      settled_at: null,
    });
    // A draft holds no bytes, and arming it moves none.
    expect(
      b2.calls.filter((operation) => {
        return operation !== "presignGet";
      }),
    ).toEqual([]);
    await close();
  });

  it("refuses an empty manifest and an all-refused one", async () => {
    const empty = await setUp();
    const emptyResponse = await empty.commit("arm");
    await empty.close();

    const refused = await setUp();
    await insertUploadFile(refused.database, {
      uploadSessionId: refused.sessionId,
      position: 1,
      declared_content_type: "application/pdf",
      kind: null,
      state: "refused",
      problem_code: "unsupported_type",
    });
    const refusedResponse = await refused.commit("arm");
    const unchanged = await refused.readSession();
    await refused.close();

    expect(emptyResponse.statusCode).toBe(400);
    expect(emptyResponse.json().error).toBe("upload_session_empty");
    expect(refusedResponse.statusCode).toBe(400);
    expect(refusedResponse.json().error).toBe("upload_session_empty");
    expect(unchanged).toMatchObject({ state: "draft", committed_at: null });
  });

  it("closes an uploading batch with what arrived, and aborts what was in flight", async () => {
    const {
      database,
      b2,
      sessionId,
      memberId,
      commit,
      readSession,
      readFiles,
      close,
    } = await setUp({ state: "uploading", committed_at: NOW, file_count: 5 });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      upload_session_id: sessionId,
      seq: 1,
    });
    await insertRendition(database, { itemId, purpose: "original" });
    await insertRendition(database, { itemId, purpose: "display" });
    await insertRendition(database, { itemId, purpose: "thumb" });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      state: "done",
      item_id: itemId,
      ...CAPTURE,
    });
    const waitingId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 2,
      ...CAPTURE,
    });
    const sendingId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 3,
      state: "sending",
      content_hash: "c".repeat(64),
      storage_key: `uploads/${sessionId}/three/original.mov`,
      multipart_upload_id: "upload-three",
      ...CAPTURE,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 4,
      state: "failed",
      problem_code: "connection_lost",
      problem_detail: "The connection dropped.",
      attempt_count: 2,
      ...CAPTURE,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 5,
      declared_content_type: "application/pdf",
      kind: null,
      state: "refused",
      problem_code: "unsupported_type",
    });
    const filesBefore = await readFiles();

    const response = await commit("close");

    expect(response.statusCode).toBe(200);
    const detail = response.json<UploadSessionDetail>();
    expect(detail).toMatchObject({ state: "settled", settledAt: NOW });
    expect(detail.progress).toMatchObject({
      doneCount: 1,
      failedCount: 1,
      cancelledCount: 2,
    });
    expect(detail.summary).not.toBeNull();
    const filesAfter = await readFiles();
    expect(
      filesAfter.map((file) => {
        return {
          id: file.id,
          state: file.state,
          problem_code: file.problem_code,
          multipart_upload_id: file.multipart_upload_id,
        };
      }),
    ).toEqual([
      expect.objectContaining({ state: "done" }),
      {
        id: waitingId,
        state: "cancelled",
        problem_code: "cancelled_by_uploader",
        multipart_upload_id: null,
      },
      {
        id: sendingId,
        state: "cancelled",
        problem_code: "cancelled_by_uploader",
        multipart_upload_id: null,
      },
      expect.objectContaining({ state: "failed" }),
      expect.objectContaining({ state: "refused" }),
    ]);
    // What was already terminal is untouched, to the last column.
    for (const position of [0, 3, 4]) {
      expect(filesAfter[position]).toEqual(filesBefore[position]);
    }
    expect(b2.calls).toContain("abortMultipart");
    expect((await readSession()).settled_at).toBe(NOW);
    await close();
  });

  it("still closes the batch when Backblaze will not abort, and keeps the id", async () => {
    const { database, b2, sessionId, commit, close } = await setUp({
      state: "uploading",
      committed_at: NOW,
    });
    const sendingId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      state: "sending",
      content_hash: "c".repeat(64),
      storage_key: `uploads/${sessionId}/one/original.mov`,
      multipart_upload_id: "upload-one",
      ...CAPTURE,
    });
    b2.onCall = (operation) => {
      if (operation === "abortMultipart") {
        throw new Error("Backblaze is not answering");
      }
    };

    const response = await commit("close");

    expect(response.statusCode).toBe(200);
    const file = await database
      .selectFrom("upload_files")
      .select(["state", "multipart_upload_id"])
      .where("id", "=", sendingId)
      .executeTakeFirstOrThrow();
    expect(file).toEqual({
      state: "cancelled",
      multipart_upload_id: "upload-one",
    });
    await close();
  });

  it("arms once when two arms race on one draft, and cancels nothing", async () => {
    const { database, sessionId, commit, readSession, readFiles, close } =
      await setUp();
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      declared_bytes: 3_000_000,
      ...CAPTURE,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 2,
      declared_bytes: 2_000_000,
      ...CAPTURE,
    });

    const [first, second] = await Promise.all([commit("arm"), commit("arm")]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json<UploadSessionDetail>().state).toBe("uploading");
    expect(second.json<UploadSessionDetail>().state).toBe("uploading");
    expect(await readSession()).toMatchObject({
      state: "uploading",
      committed_at: NOW,
      file_count: 2,
      total_bytes: 5_000_000,
      settled_at: null,
    });
    expect(
      (await readFiles()).map((file) => {
        return file.state;
      }),
    ).toEqual(["waiting", "waiting"]);
    await close();
  });

  it("is a no-op to arm a draft that is already armed", async () => {
    const {
      database,
      sessionId,
      commit,
      readSession,
      readFiles,
      close,
      advanceClock,
    } = await setUp();
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      ...CAPTURE,
    });
    await commit("arm");
    const sessionBefore = await readSession();
    const filesBefore = await readFiles();
    advanceClock();

    const response = await commit("arm");

    expect(response.statusCode).toBe(200);
    expect(response.json<UploadSessionDetail>()).toMatchObject({
      sessionId,
      state: "uploading",
      committedAt: NOW,
    });
    expect(await readSession()).toEqual(sessionBefore);
    expect(await readFiles()).toEqual(filesBefore);
    await close();
  });

  it("is a no-op to close a batch that is already closed", async () => {
    const {
      database,
      b2,
      sessionId,
      commit,
      readSession,
      readFiles,
      close,
      advanceClock,
    } = await setUp({ state: "uploading", committed_at: NOW });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      state: "sending",
      content_hash: "c".repeat(64),
      storage_key: `uploads/${sessionId}/one/original.mov`,
      multipart_upload_id: "upload-one",
      ...CAPTURE,
    });
    await commit("close");
    const sessionBefore = await readSession();
    const filesBefore = await readFiles();
    const callsBefore = b2.calls.length;
    advanceClock();

    const response = await commit("close");

    expect(response.statusCode).toBe(200);
    expect(response.json<UploadSessionDetail>().state).toBe("settled");
    expect(await readSession()).toEqual(sessionBefore);
    expect(await readFiles()).toEqual(filesBefore);
    expect(
      b2.calls.slice(callsBefore).filter((operation) => {
        return operation !== "presignGet";
      }),
    ).toEqual([]);
    await close();
  });

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
      } = await setUp({
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

      const response = await commit(intent);

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
        await setUp(overrides);
      await insertUploadFile(database, {
        uploadSessionId: sessionId,
        position: 1,
        ...CAPTURE,
      });
      const sessionBefore = await readSession();
      const filesBefore = await readFiles();

      const response = await commit(intent);

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
        await setUp();
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
    const { app, database, commit, close } = await setUp();
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

    const forOther = await commit("arm", otherCookie);
    const forAdmin = await commit("arm", adminCookie);
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
