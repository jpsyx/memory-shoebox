import { describe, expect, it } from "vitest";
import {
  insertItem,
  insertMember,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  HASH,
  MULTIPART_BYTES,
  setUpUploadTestContext,
} from "./uploadPresignTestHelpers.ts";

describe("archive duplicate detection", () => {
  it.each([1024, MULTIPART_BYTES])(
    "skips an identical original before storage signing (%s bytes)",
    async (byteSize) => {
      const fixture = await setUpUploadTestContext();
      try {
        const otherMemberId = await insertMember(fixture.database);
        const itemId = await insertItem(fixture.database, {
          uploadedBy: otherMemberId,
          checksum: HASH,
          byte_size: byteSize,
          original_filename: "private-original.jpg",
        });
        const fileId = await fixture.seedFile({
          position: 0,
          declared_bytes: byteSize,
          original_filename: "renamed.jpg",
        });
        const response = await fixture.presign({
          fileId,
          payload: { contentHash: HASH, byteSize },
        });
        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          error: "upload_file_conflict",
          details: { fileId, state: "cancelled" },
        });
        expect(response.body).not.toContain(itemId);
        expect(response.body).not.toContain("private-original.jpg");
        expect(fixture.b2.calls).toEqual([]);
        expect(await fixture.readFile(fileId)).toMatchObject({
          state: "cancelled",
          duplicate_reason: "archive",
          item_id: null,
          attempt_count: 0,
        });
        expect((await fixture.readSession()).state).toBe("settled");
        const detail = await fixture.app.inject({
          method: "GET",
          url: `/api/upload-sessions/${fixture.sessionId}`,
          headers: { cookie: fixture.cookie },
        });
        expect(detail.json().files[0]).toMatchObject({
          state: "cancelled",
          duplicateReason: "archive",
        });
        expect(
          await fixture.database.selectFrom("items").select("id").execute(),
        ).toEqual([{ id: itemId }]);
        expect(
          await fixture.database
            .selectFrom("outbound_emails")
            .select("id")
            .execute(),
        ).toEqual([]);
      } finally {
        await fixture.close();
      }
    },
  );

  it("rechecks an already hashed retry against the archive", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      await insertItem(fixture.database, {
        uploadedBy: fixture.memberId,
        checksum: HASH,
        byte_size: 1024,
      });
      const fileId = await fixture.seedFile({
        position: 0,
        content_hash: HASH,
      });
      expect(
        (
          await fixture.presign({
            fileId,
            payload: { contentHash: HASH, byteSize: 1024 },
          })
        ).statusCode,
      ).toBe(409);
      expect((await fixture.readFile(fileId)).state).toBe("cancelled");
      expect(fixture.b2.calls).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it("uploads different bytes with the same name and size, and permits reupload after deletion", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      const itemId = await insertItem(fixture.database, {
        uploadedBy: fixture.memberId,
        checksum: "a".repeat(64),
        byte_size: 1024,
        original_filename: "same.jpg",
      });
      const fileId = await fixture.seedFile({
        position: 0,
        original_filename: "same.jpg",
      });
      expect(
        (
          await fixture.presign({
            fileId,
            payload: { contentHash: HASH, byteSize: 1024 },
          })
        ).statusCode,
      ).toBe(200);
      await fixture.database
        .deleteFrom("items")
        .where("id", "=", itemId)
        .execute();
      const secondId = await fixture.seedFile({ position: 1 });
      expect(
        (
          await fixture.presign({
            fileId: secondId,
            payload: { contentHash: "a".repeat(64), byteSize: 1024 },
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await fixture.close();
    }
  });

  it("aborts a previous multipart attempt when its retry now duplicates the archive", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      await insertItem(fixture.database, {
        uploadedBy: fixture.memberId,
        checksum: HASH,
        byte_size: MULTIPART_BYTES,
      });
      const fileId = await fixture.seedFile({
        position: 0,
        declared_bytes: MULTIPART_BYTES,
        content_hash: HASH,
        state: "sending",
        storage_key: "unfinished-original",
        multipart_upload_id: "unfinished-multipart",
      });
      const response = await fixture.presign({
        fileId,
        payload: { contentHash: HASH, byteSize: MULTIPART_BYTES },
      });
      expect(response.statusCode).toBe(409);
      expect(fixture.b2.calls).toEqual(["abortMultipart"]);
      expect(await fixture.readFile(fileId)).toMatchObject({
        state: "cancelled",
        multipart_upload_id: null,
      });
      const queued = await fixture.database
        .selectFrom("pending_object_deletions")
        .select("storage_key")
        .execute();
      expect(
        queued.map((row) => {
          return row.storage_key;
        }),
      ).toContain("unfinished-original");
    } finally {
      await fixture.close();
    }
  });

  it("rechecks after signing when another batch lands during the storage call", async () => {
    const fixture = await setUpUploadTestContext();
    try {
      const presignMultipart = fixture.b2.presignMultipart;
      fixture.b2.presignMultipart = async (options) => {
        await insertItem(fixture.database, {
          uploadedBy: fixture.memberId,
          checksum: HASH,
          byte_size: MULTIPART_BYTES,
        });
        return presignMultipart(options);
      };
      const fileId = await fixture.seedFile({
        position: 0,
        declared_bytes: MULTIPART_BYTES,
      });
      expect(
        (
          await fixture.presign({
            fileId,
            payload: { contentHash: HASH, byteSize: MULTIPART_BYTES },
          })
        ).statusCode,
      ).toBe(409);
      expect(await fixture.readFile(fileId)).toMatchObject({
        state: "cancelled",
        duplicate_reason: "archive",
      });
      expect(fixture.b2.calls).toEqual(["presignMultipart", "abortMultipart"]);
    } finally {
      await fixture.close();
    }
  });
});
