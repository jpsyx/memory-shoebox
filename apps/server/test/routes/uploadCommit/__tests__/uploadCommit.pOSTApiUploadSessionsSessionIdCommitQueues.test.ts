import { CAPTURE, setUpUploadTestContext } from "./setUpUploadTestContext.ts";
import { describe, expect, it } from "vitest";
import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { createId } from "../../../../src/db/createId.ts";

import {
  insertItem,
  insertUploadFile,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/commit", () => {
  it("queues what a cancelled row may have left in the bucket, and nothing for a row that landed", async () => {
    const { database, sessionId, memberId, commit, close } =
      await setUpUploadTestContext({
        state: "uploading",
        committed_at: NOW,
        file_count: 4,
      });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      upload_session_id: sessionId,
      seq: 1,
    });
    const doneId = createId();
    const singleId = createId();
    const keylessId = createId();
    const multipartId = createId();
    const failedId = createId();
    const derivativeKeys = (fileId: string) => {
      return ["display", "thumb", "poster"].map((purpose) => {
        return `uploads/${sessionId}/${fileId}/${purpose}.jpg`;
      });
    };
    // Landed and ingested: an item stands on it.
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: doneId,
      position: 1,
      state: "done",
      item_id: itemId,
      storage_key: `uploads/${sessionId}/${doneId}/original.jpg`,
      ...CAPTURE,
    });
    // A single PUT that may have landed just before the close.
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: singleId,
      position: 2,
      state: "sending",
      content_hash: "c".repeat(64),
      storage_key: `uploads/${sessionId}/${singleId}/original.jpg`,
      ...CAPTURE,
    });
    // Never presigned, so nothing of it can be in the bucket.
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: keylessId,
      position: 3,
      ...CAPTURE,
    });
    // Aborted, and its key queued too: Backblaze may have assembled it
    // before the abort could remove it.
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: multipartId,
      position: 4,
      state: "sending",
      kind: "video",
      declared_content_type: "video/quicktime",
      content_hash: "d".repeat(64),
      storage_key: `uploads/${sessionId}/${multipartId}/original.mov`,
      multipart_upload_id: "upload-four",
      ...CAPTURE,
    });
    // Already failed, and not this close's to touch.
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: failedId,
      position: 5,
      state: "failed",
      problem_code: "connection_lost",
      storage_key: `uploads/${sessionId}/${failedId}/original.jpg`,
      ...CAPTURE,
    });

    const response = await commit({ intent: "close" });

    expect(response.statusCode).toBe(200);
    const queued = await database
      .selectFrom("pending_object_deletions")
      .select("storage_key")
      .orderBy("storage_key")
      .execute();
    expect(
      queued.map((row) => {
        return row.storage_key;
      }),
    ).toEqual(
      [
        `uploads/${sessionId}/${singleId}/original.jpg`,
        ...derivativeKeys(singleId),
        `uploads/${sessionId}/${multipartId}/original.mov`,
        ...derivativeKeys(multipartId),
      ].toSorted(),
    );
    await close();
  });

  it("queues nothing more when the close is repeated", async () => {
    const { database, sessionId, commit, close } = await setUpUploadTestContext(
      {
        state: "uploading",
        committed_at: NOW,
      },
    );
    const fileId = createId();
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: fileId,
      position: 1,
      state: "sending",
      content_hash: "c".repeat(64),
      storage_key: `uploads/${sessionId}/${fileId}/original.jpg`,
      ...CAPTURE,
    });
    await commit({ intent: "close" });
    // The drain deletes all four objects between the two requests.
    await database.deleteFrom("pending_object_deletions").execute();

    const response = await commit({ intent: "close" });

    expect(response.statusCode).toBe(200);
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .select("id")
        .execute(),
    ).toEqual([]);
    await close();
  });

  it("arms once when two arms race on one draft, and cancels nothing", async () => {
    const { database, sessionId, commit, readSession, readFiles, close } =
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

    const [first, second] = await Promise.all([
      commit({ intent: "arm" }),
      commit({ intent: "arm" }),
    ]);

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
    } = await setUpUploadTestContext();
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      ...CAPTURE,
    });
    await commit({ intent: "arm" });
    const sessionBefore = await readSession();
    const filesBefore = await readFiles();
    advanceClock();

    const response = await commit({ intent: "arm" });

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
    } = await setUpUploadTestContext({ state: "uploading", committed_at: NOW });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position: 1,
      state: "sending",
      content_hash: "c".repeat(64),
      storage_key: `uploads/${sessionId}/one/original.mov`,
      multipart_upload_id: "upload-one",
      ...CAPTURE,
    });
    await commit({ intent: "close" });
    const sessionBefore = await readSession();
    const filesBefore = await readFiles();
    const callsBefore = b2.calls.length;
    advanceClock();

    const response = await commit({ intent: "close" });

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
});
