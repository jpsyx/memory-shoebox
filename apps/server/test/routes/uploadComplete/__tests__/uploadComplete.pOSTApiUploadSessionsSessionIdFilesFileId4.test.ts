import {
  JPEG,
  DISPLAY,
  THUMB,
  holdCompleteMultipartsUntilTwoAreAsked,
  setUpUploadTestContext,
} from "./uploadCompleteTestHelpers.ts";

import { describe, expect, it, vi } from "vitest";
import type { CompleteUploadFileResponse } from "@memory-shoebox/shared";
import { createDatabase } from "../../../../src/db/client.ts";

import { createFakeB2Client } from "../../../helpers/createFakeB2Client/createFakeB2Client.ts";

import { failB2CallsInsideTransactions } from "../../../helpers/failB2CallsInsideTransactions/failB2CallsInsideTransactions.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/files/:fileId/complete", () => {
  it("lands one item and aborts nothing when a multipart file's complete arrives twice at once", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUpUploadTestContext();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    holdCompleteMultipartsUntilTwoAreAsked({ b2 });
    const payload = {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    };

    const responses = await Promise.all([
      complete({ fileId: file.fileId, payload: payload }),
      complete({ fileId: file.fileId, payload: payload }),
    ]);

    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([200, 200]);
    expect(
      responses.filter((response) => {
        return response.json<CompleteUploadFileResponse>().didSettle;
      }),
    ).toHaveLength(1);
    expect(await countItems()).toBe(1);
    expect(await readFile(file.fileId)).toMatchObject({
      state: "done",
      multipart_upload_id: null,
    });
    expect(b2.calls).not.toContain("abortMultipart");
    await close();
  });

  it("retries a complete that arrives while the first is still assembling, and fails nothing", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUpUploadTestContext();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    // The first complete is assembling a large file. Backblaze has consumed
    // the upload id already, so a second one is told it is gone, and the
    // object is not in the bucket until the first answers.
    let completeCount = 0;
    let finishAssembling = (): void => {};
    const assembled = new Promise<void>((resolve) => {
      finishAssembling = resolve;
    });
    b2.completeMultipart = async () => {
      completeCount += 1;
      if (completeCount > 1) {
        throw Object.assign(new Error("The upload is gone."), {
          name: "NoSuchUpload",
        });
      }
      await assembled;
      b2.storedObjects.set(file.keyOf("original"), {
        sizeBytes: 1024,
        contentType: JPEG,
      });
    };
    const payload = {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    };

    const first = complete({ fileId: file.fileId, payload: payload });
    await vi.waitFor(() => {
      expect(completeCount).toBe(1);
    });
    const second = await complete({ fileId: file.fileId, payload: payload });
    expect([second.statusCode, second.json().error]).toEqual([
      503,
      "upload_storage_unavailable",
    ]);
    expect((await readFile(file.fileId)).state).toBe("sending");
    finishAssembling();
    const firstResponse = await first;
    const retried = await complete({ fileId: file.fileId, payload: payload });

    expect(firstResponse.statusCode).toBe(200);
    expect(retried.statusCode).toBe(200);
    expect(retried.json<CompleteUploadFileResponse>().didSettle).toBe(false);
    expect(await countItems()).toBe(1);
    expect((await readFile(file.fileId)).state).toBe("done");
    expect(b2.calls).not.toContain("abortMultipart");
    await close();
  });

  it("refuses the wrong parts before asking Backblaze anything", async () => {
    const { b2, seedFile, complete, readFile, close } =
      await setUpUploadTestContext();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    const send = (parts: Array<{ partNumber: number; etag: string }>) => {
      return complete({
        fileId: file.fileId,
        payload: {
          outcome: "done",
          contentHash: file.contentHash,
          byteSize: 1024,
          parts,
        },
      });
    };

    const responses = [
      // 1024 bytes are one part: a second, a gap and a repeat are all wrong.
      await send([
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
      ]),
      await send([{ partNumber: 2, etag: '"etag-2"' }]),
      await send([
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 1, etag: '"etag-1"' },
      ]),
    ];

    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([400, 400, 400]);
    expect(b2.calls).toEqual([]);
    expect((await readFile(file.fileId)).state).toBe("sending");
    await close();
  });

  it("answers 403 to a viewer's own old session, after the 404 checks", async () => {
    const { app, database, sessionId, seedFile, complete, close } =
      await setUpUploadTestContext();
    const strangersFile = await seedFile({ position: 1 });
    const viewer = await insertSignedInMember({
      database,
      token: "viewer",
      member: { role: "viewer" },
    });
    const viewerSessionId = await insertUploadSession(database, {
      uploadedBy: viewer.memberId,
      state: "settled",
      settled_at: NOW,
    });
    const viewerFileId = await insertUploadFile(database, {
      uploadSessionId: viewerSessionId,
    });
    const payload = { outcome: "failed", problemCode: "connection_lost" };
    const send = (
      functionOptions: Readonly<{
        sessionIdToSend: string;
        fileIdToSend: string;
      }>,
    ) => {
      const { sessionIdToSend, fileIdToSend } = functionOptions;

      return app.inject({
        method: "POST",
        url: `/api/upload-sessions/${sessionIdToSend}/files/${fileIdToSend}/complete`,
        headers: { cookie: viewer.cookie },
        payload,
      });
    };

    const forOwn = await send({
      sessionIdToSend: viewerSessionId,
      fileIdToSend: viewerFileId,
    });
    const forStranger = await send({
      sessionIdToSend: sessionId,
      fileIdToSend: strangersFile.fileId,
    });

    expect(forOwn.statusCode).toBe(403);
    expect(forOwn.json().error).toBe("upload_forbidden");
    expect(forStranger.statusCode).toBe(404);
    expect(forStranger.json().error).toBe("upload_session_not_found");
    // The setUp member's own route stays reachable.
    expect(
      (await complete({ fileId: strangersFile.fileId, payload: payload }))
        .statusCode,
    ).toBe(200);
    await close();
  });

  it("makes no Backblaze call while a transaction is open", async () => {
    // Every BEGIN IMMEDIATE the app issues goes through the watched handle,
    // so the watch knows exactly when a transaction is open.
    const watchedB2 = createFakeB2Client();
    const watch = failB2CallsInsideTransactions({
      database: createDatabase(":memory:"),
      b2: watchedB2,
    });
    const { b2, seedFile, complete, close } = await setUpUploadTestContext({
      database: watch.database,
      b2: watchedB2,
    });
    const multipart = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    const single = await seedFile({ position: 2 });
    const dropped = await seedFile({
      position: 3,
      multipartUploadId: "upload-three",
    });
    b2.storedObjects.set(multipart.keyOf("display"), {
      sizeBytes: 200_000,
      contentType: JPEG,
    });
    b2.storedObjects.set(multipart.keyOf("thumb"), {
      sizeBytes: 40_000,
      contentType: JPEG,
    });
    b2.storedObjects.set(single.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });

    const responses = [
      await complete({
        fileId: multipart.fileId,
        payload: {
          outcome: "done",
          contentHash: multipart.contentHash,
          byteSize: 1024,
          width: 3024,
          height: 4032,
          parts: [{ partNumber: 1, etag: '"etag-1"' }],
          renditions: [DISPLAY, THUMB],
        },
      }),
      await complete({
        fileId: single.fileId,
        payload: {
          outcome: "done",
          contentHash: single.contentHash,
          byteSize: 1024,
        },
      }),
      await complete({
        fileId: dropped.fileId,
        payload: {
          outcome: "failed",
          problemCode: "connection_lost",
        },
      }),
    ];

    expect(watch.callsInsideTransactions).toEqual([]);
    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([200, 200, 200]);
    expect(responses[2]?.json<CompleteUploadFileResponse>().didSettle).toBe(
      true,
    );
    // The watch saw every kind of call complete makes, so the silence above
    // is a finding rather than an absence of calls.
    expect(b2.calls).toEqual(
      expect.arrayContaining([
        "completeMultipart",
        "headObject",
        "abortMultipart",
        "presignGet",
      ]),
    );
    await close();
  });
});
