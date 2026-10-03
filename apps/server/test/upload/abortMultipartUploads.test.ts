import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { abortMultipartUploads } from "../../src/upload/abortMultipartUploads.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";
import {
  insertMember,
  insertUploadFile,
  insertUploadSession,
} from "../helpers/seedHelpers/seedHelpers.ts";

const createContext = async () => {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const sessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  const seedOpenUpload = async (position: number) => {
    const fileId = await insertUploadFile(database, {
      uploadSessionId: sessionId,
      position,
      state: "cancelled",
      storage_key: `uploads/${sessionId}/file-${position}/original.mov`,
      multipart_upload_id: `upload-${position}`,
    });
    return {
      fileId,
      storageKey: `uploads/${sessionId}/file-${position}/original.mov`,
      multipartUploadId: `upload-${position}`,
    };
  };
  const readUploadId = async (fileId: string) => {
    const row = await database
      .selectFrom("upload_files")
      .select("multipart_upload_id")
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    return row.multipart_upload_id;
  };
  return { database, seedOpenUpload, readUploadId };
};

describe("abortMultipartUploads", () => {
  it("aborts each upload and forgets its id once Backblaze has", async () => {
    const { database, seedOpenUpload, readUploadId } = await createContext();
    const first = await seedOpenUpload(1);
    const second = await seedOpenUpload(2);
    const b2 = createFakeB2Client();

    const result = await abortMultipartUploads({
      database,
      b2,
      uploads: [first, second],
      logger: { warn: vi.fn() },
    });

    expect(result).toEqual({ abortedCount: 2 });
    expect(
      b2.calls.filter((operation) => {
        return operation === "abortMultipart";
      }),
    ).toHaveLength(2);
    expect(await readUploadId(first.fileId)).toBeNull();
    expect(await readUploadId(second.fileId)).toBeNull();
    await database.destroy();
  });

  it("keeps the id of an upload Backblaze would not abort, and says so", async () => {
    const { database, seedOpenUpload, readUploadId } = await createContext();
    const upload = await seedOpenUpload(1);
    const b2 = createFakeB2Client();
    b2.onCall = (operation) => {
      if (operation === "abortMultipart") {
        throw new Error("Backblaze is not answering");
      }
    };
    const warn = vi.fn();

    const result = await abortMultipartUploads({
      database,
      b2,
      uploads: [upload],
      logger: { warn },
    });

    expect(result).toEqual({ abortedCount: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    // A retry clears the column before it aborts, so the log line is then the
    // only record of which upload is still open.
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: upload.fileId,
        storageKey: upload.storageKey,
        uploadId: upload.multipartUploadId,
      }),
      expect.any(String),
    );
    expect(await readUploadId(upload.fileId)).toBe(upload.multipartUploadId);
    await database.destroy();
  });

  it("never clears an id that changed since the abort was planned", async () => {
    const { database, seedOpenUpload, readUploadId } = await createContext();
    const upload = await seedOpenUpload(1);
    // A retry and a fresh presign opened a new upload in between.
    await database
      .updateTable("upload_files")
      .set({ multipart_upload_id: "upload-new" })
      .where("id", "=", upload.fileId)
      .execute();

    await abortMultipartUploads({
      database,
      b2: createFakeB2Client(),
      uploads: [upload],
      logger: { warn: vi.fn() },
    });

    expect(await readUploadId(upload.fileId)).toBe("upload-new");
    await database.destroy();
  });

  it("reports, rather than throws, when it cannot forget an id it aborted", async () => {
    const { database, seedOpenUpload } = await createContext();
    const upload = await seedOpenUpload(1);
    const b2 = createFakeB2Client();
    const warn = vi.fn();
    // The write that clears the id fails: the handle is gone.
    await database.destroy();

    const result = await abortMultipartUploads({
      database,
      b2,
      uploads: [upload],
      logger: { warn },
    });

    // Backblaze did abort it, and the id the row keeps is NoSuchUpload to the
    // next caller, which counts as aborted.
    expect(result).toEqual({ abortedCount: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("counts an upload Backblaze no longer knows as aborted", async () => {
    const { database, seedOpenUpload, readUploadId } = await createContext();
    const upload = await seedOpenUpload(1);
    const b2 = createFakeB2Client();
    b2.onCall = (operation) => {
      if (operation === "abortMultipart") {
        throw Object.assign(new Error("The upload does not exist."), {
          name: "NoSuchUpload",
        });
      }
    };
    const warn = vi.fn();

    const result = await abortMultipartUploads({
      database,
      b2,
      uploads: [upload],
      logger: { warn },
    });

    expect(result).toEqual({ abortedCount: 1 });
    expect(warn).not.toHaveBeenCalled();
    expect(await readUploadId(upload.fileId)).toBeNull();
    await database.destroy();
  });

  it("counts an abort Backblaze answers with a bare 404 as aborted", async () => {
    const { database, seedOpenUpload, readUploadId } = await createContext();
    const upload = await seedOpenUpload(1);
    const b2 = createFakeB2Client();
    b2.onCall = (operation) => {
      if (operation === "abortMultipart") {
        // What the SDK raises when Backblaze's 404 carries no S3 error code.
        throw Object.assign(new Error("UnknownError"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        });
      }
    };
    const warn = vi.fn();

    const result = await abortMultipartUploads({
      database,
      b2,
      uploads: [upload],
      logger: { warn },
    });

    expect(result).toEqual({ abortedCount: 1 });
    expect(warn).not.toHaveBeenCalled();
    expect(await readUploadId(upload.fileId)).toBeNull();
    await database.destroy();
  });

  it("counts a 404 that names another S3 error, like NoSuchBucket, as a failed abort", async () => {
    const { database, seedOpenUpload, readUploadId } = await createContext();
    const upload = await seedOpenUpload(1);
    const b2 = createFakeB2Client();
    b2.onCall = (operation) => {
      if (operation === "abortMultipart") {
        // The bucket is missing or misnamed: the upload may well still be open.
        throw Object.assign(new Error("The specified bucket does not exist"), {
          name: "NoSuchBucket",
          $metadata: { httpStatusCode: 404 },
        });
      }
    };
    const warn = vi.fn();

    const result = await abortMultipartUploads({
      database,
      b2,
      uploads: [upload],
      logger: { warn },
    });

    expect(result).toEqual({ abortedCount: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(await readUploadId(upload.fileId)).toBe(upload.multipartUploadId);
    await database.destroy();
  });

  it("still counts any other status as a failed abort", async () => {
    const { database, seedOpenUpload, readUploadId } = await createContext();
    const upload = await seedOpenUpload(1);
    const b2 = createFakeB2Client();
    b2.onCall = (operation) => {
      if (operation === "abortMultipart") {
        throw Object.assign(new Error("Service unavailable"), {
          name: "ServiceUnavailable",
          $metadata: { httpStatusCode: 503 },
        });
      }
    };

    const result = await abortMultipartUploads({
      database,
      b2,
      uploads: [upload],
      logger: { warn: vi.fn() },
    });

    expect(result).toEqual({ abortedCount: 0 });
    expect(await readUploadId(upload.fileId)).toBe(upload.multipartUploadId);
    await database.destroy();
  });
});
