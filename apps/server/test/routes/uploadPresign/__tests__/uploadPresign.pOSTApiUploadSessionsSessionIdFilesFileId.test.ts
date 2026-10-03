import {
  HASH,
  EARLIER,
  EXPIRES_AT,
  MULTIPART_BYTES,
  MULTIPART_PART_COUNT,
  setUpUploadTestContext,
} from "./uploadPresignTestHelpers.ts";

import { describe, expect, it } from "vitest";
import type { PresignMultipart, PresignSingle } from "@memory-shoebox/shared";
import { appConfig } from "../../../../../../app.config.ts";

import { NOW } from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/files/:fileId/presign", () => {
  it.each([
    ["draft", { state: "draft", committed_at: null }],
    ["cancelled", { state: "cancelled", committed_at: null }],
  ] as const)("moves no byte on a %s session", async (_state, overrides) => {
    const { b2, seedFile, presign, readFile, close } =
      await setUpUploadTestContext(overrides);
    const fileId = await seedFile({ position: 1 });

    const response = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: 1024,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("upload_session_conflict");
    expect(b2.calls).toEqual([]);
    expect(await readFile(fileId)).toMatchObject({
      state: "waiting",
      content_hash: null,
      storage_key: null,
      attempt_count: 0,
    });
    await close();
  });

  it("signs one PUT for a small original, carrying the type it signed", async () => {
    const { sessionId, seedFile, presign, readFile, readSession, close } =
      await setUpUploadTestContext();
    const fileId = await seedFile({
      position: 1,
      original_filename: "IMG_0001.HEIC",
      declared_content_type: "image/heic",
    });
    const key = `uploads/${sessionId}/${fileId}/original.heic`;

    const response = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: 1024,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<PresignSingle>();
    expect(body).toMatchObject({
      mode: "single",
      fileId,
      method: "PUT",
      expiresAt: EXPIRES_AT,
    });
    expect(body.headers).toEqual({ "Content-Type": "image/heic" });
    expect(body.url).toContain(encodeURIComponent(key));
    // The header is the type the URL was signed for, not a second opinion.
    expect(new URL(body.url).searchParams.get("contentType")).toBe(
      "image/heic",
    );
    expect(await readFile(fileId)).toMatchObject({
      state: "sending",
      content_hash: HASH,
      storage_key: key,
      presigned_until: EXPIRES_AT,
      multipart_upload_id: null,
      attempt_count: 1,
    });
    expect((await readSession()).last_activity_at).toBe(NOW);

    // An expired URL is presigned again, and that is another attempt.
    const again = await presign({
      fileId: fileId,
      payload: { contentHash: HASH, byteSize: 1024 },
    });
    expect(again.statusCode).toBe(200);
    expect(await readFile(fileId)).toMatchObject({
      storage_key: key,
      attempt_count: 2,
    });
    await close();
  });

  it("opens a multipart upload once, and re-signs only the parts asked for", async () => {
    const { b2, sessionId, seedFile, presign, readFile, close } =
      await setUpUploadTestContext();
    const fileId = await seedFile({
      position: 1,
      original_filename: "IMG_0002.MOV",
      declared_content_type: "video/quicktime",
      declared_bytes: MULTIPART_BYTES,
    });

    const first = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: MULTIPART_BYTES,
      },
    });

    expect(first.statusCode).toBe(200);
    const opened = first.json<PresignMultipart>();
    expect(opened).toMatchObject({
      mode: "multipart",
      fileId,
      partSizeBytes: appConfig.upload.multipartPartSizeBytes,
      partCount: MULTIPART_PART_COUNT,
      method: "PUT",
      expiresAt: EXPIRES_AT,
    });
    expect(opened.headers).toEqual({});
    expect(
      opened.parts.map((part) => {
        return part.partNumber;
      }),
    ).toEqual(
      Array.from({ length: MULTIPART_PART_COUNT }, (_unused, index) => {
        return index + 1;
      }),
    );
    expect(await readFile(fileId)).toMatchObject({
      state: "sending",
      storage_key: `uploads/${sessionId}/${fileId}/original.mov`,
      multipart_upload_id: opened.multipartUploadId,
      attempt_count: 1,
    });

    const second = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: MULTIPART_BYTES,
        partNumbers: [3],
      },
    });

    const resigned = second.json<PresignMultipart>();
    expect(resigned.multipartUploadId).toBe(opened.multipartUploadId);
    expect(
      resigned.parts.map((part) => {
        return part.partNumber;
      }),
    ).toEqual([3]);
    expect(
      b2.calls.filter((operation) => {
        return operation === "presignMultipart";
      }),
    ).toHaveLength(1);
    expect(b2.calls).toContain("signParts");
    expect((await readFile(fileId)).attempt_count).toBe(2);
    await close();
  });

  it("refuses a part the file does not have, and parts for a single PUT", async () => {
    const { b2, seedFile, presign, readFile, close } =
      await setUpUploadTestContext();
    const largeId = await seedFile({
      position: 1,
      declared_content_type: "video/mp4",
      declared_bytes: MULTIPART_BYTES,
    });
    const smallId = await seedFile({ position: 2 });

    const pastTheEnd = await presign({
      fileId: largeId,
      payload: {
        contentHash: HASH,
        byteSize: MULTIPART_BYTES,
        partNumbers: [MULTIPART_PART_COUNT + 1],
      },
    });
    const onASingle = await presign({
      fileId: smallId,
      payload: {
        contentHash: HASH,
        byteSize: 1024,
        partNumbers: [1],
      },
    });

    expect(pastTheEnd.statusCode).toBe(400);
    expect(onASingle.statusCode).toBe(400);
    expect(b2.calls).toEqual([]);
    expect((await readFile(largeId)).state).toBe("waiting");
    await close();
  });

  it("rides a derivative on the original's presign without counting it", async () => {
    const { sessionId, seedFile, presign, readFile, close } =
      await setUpUploadTestContext();
    const fileId = await seedFile({ position: 1 });

    const early = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: 1024,
        purpose: "thumb",
      },
    });
    await presign({
      fileId: fileId,
      payload: { contentHash: HASH, byteSize: 1024 },
    });
    const display = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: 1024,
        purpose: "display",
      },
    });
    const transcode = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: 1024,
        purpose: "video_mp4",
      },
    });

    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({
      error: "upload_file_conflict",
      details: { state: "waiting" },
    });
    expect(display.statusCode).toBe(200);
    const body = display.json<PresignSingle>();
    expect(body.mode).toBe("single");
    expect(body.headers).toEqual({ "Content-Type": "image/jpeg" });
    expect(body.url).toContain(
      encodeURIComponent(`uploads/${sessionId}/${fileId}/display.jpg`),
    );
    expect(new URL(body.url).searchParams.get("contentType")).toBe(
      "image/jpeg",
    );
    expect(transcode.statusCode).toBe(400);
    expect(await readFile(fileId)).toMatchObject({
      storage_key: `uploads/${sessionId}/${fileId}/original.jpg`,
      attempt_count: 1,
    });
    await close();
  });

  it("bumps the file's own updated_at on a derivative's presign, not only the batch's", async () => {
    const { sessionId, seedFile, presign, readFile, readSession, close } =
      await setUpUploadTestContext();
    // Retried after its batch settled, the row's own clock is what the sweep
    // reads, so every presign of it must move that clock.
    const fileId = await seedFile({
      position: 1,
      state: "sending",
      content_hash: HASH,
      storage_key: `uploads/${sessionId}/file/original.jpg`,
      updated_at: EARLIER,
    });

    const response = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: 1024,
        purpose: "thumb",
      },
    });

    expect(response.statusCode).toBe(200);
    expect((await readFile(fileId)).updated_at).toBe(NOW);
    expect((await readSession()).last_activity_at).toBe(NOW);
    await close();
  });
});
