import { CAPTURE, setUpUploadTestContext } from "./setUpUploadTestContext.ts";
import { describe, expect, it } from "vitest";
import type { UploadSessionDetail } from "@memory-shoebox/shared";

import {
  insertItem,
  insertRendition,
  insertUploadFile,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/commit", () => {
  it("arms a draft and freezes the figures it committed to", async () => {
    const { database, b2, sessionId, commit, readSession, close } =
      await setUpUploadTestContext();
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

    const response = await commit({ intent: "arm" });

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
    const empty = await setUpUploadTestContext();
    const emptyResponse = await empty.commit({ intent: "arm" });
    await empty.close();

    const refused = await setUpUploadTestContext();
    await insertUploadFile(refused.database, {
      uploadSessionId: refused.sessionId,
      position: 1,
      declared_content_type: "application/pdf",
      kind: null,
      state: "refused",
      problem_code: "unsupported_type",
    });
    const refusedResponse = await refused.commit({ intent: "arm" });
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
    } = await setUpUploadTestContext({
      state: "uploading",
      committed_at: NOW,
      file_count: 5,
    });
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

    const response = await commit({ intent: "close" });

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
    [0, 3, 4].forEach((position) => {
      expect(filesAfter[position]).toEqual(filesBefore[position]);
    });
    expect(b2.calls).toContain("abortMultipart");
    expect((await readSession()).settled_at).toBe(NOW);
    await close();
  });

  it("still closes the batch when Backblaze will not abort, and keeps the id", async () => {
    const { database, b2, sessionId, commit, close } =
      await setUpUploadTestContext({
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

    const response = await commit({ intent: "close" });

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
});
