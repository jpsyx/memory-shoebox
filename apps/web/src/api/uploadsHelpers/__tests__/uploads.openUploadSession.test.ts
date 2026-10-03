import {
  SESSION_ID,
  FILE_ID,
  HASH,
  AT,
  PROGRESS,
  SESSION_DETAIL,
  FILE_DTO,
  respondWith,
  onlyCall,
} from "./uploadsTestHelpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  cancelUploadSession,
  commitUploadSession,
  completeUploadFile,
  getCurrentUploadSession,
  getUploadSession,
  openUploadSession,
  presignUploadFile,
  putUploadManifest,
  retryUploadFile,
} from "@/api/uploadsHelpers/uploadsHelpers";

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openUploadSession", () => {
  it("posts the browser's zone and parses the new draft", async () => {
    respondWith({ body: SESSION_DETAIL, status: 201 });

    const detail = await openUploadSession({ clientTimezone: "Europe/Madrid" });

    expect(detail.state).toBe("draft");
    const { url, init } = onlyCall();
    expect(url).toBe("/api/upload-sessions");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ clientTimezone: "Europe/Madrid" }));
  });

  it("keeps the open batch's id off a 409, so the caller can pick it up", async () => {
    respondWith({
      body: {
        error: "upload_session_conflict",
        message: "Already open.",
        details: { sessionId: SESSION_ID },
      },
      status: 409,
    });

    const failure = await openUploadSession({ clientTimezone: "UTC" }).catch(
      (error: unknown) => {
        return error;
      },
    );

    expect(failure).toBeInstanceOf(ApiRequestError);
    expect(failure).toMatchObject({
      status: 409,
      code: "upload_session_conflict",
      details: { sessionId: SESSION_ID },
    });
  });
});

describe("getCurrentUploadSession", () => {
  it("answers null for the 204 that means nothing is in flight", async () => {
    respondWith({ body: undefined, status: 204 });

    await expect(getCurrentUploadSession()).resolves.toBeNull();
    expect(onlyCall().url).toBe("/api/upload-sessions/current");
  });

  it("answers the session when there is one to pick up", async () => {
    respondWith({
      body: { ...SESSION_DETAIL, state: "uploading" },
      status: 200,
    });

    const detail = await getCurrentUploadSession();

    expect(detail?.sessionId).toBe(SESSION_ID);
    expect(detail?.state).toBe("uploading");
  });
});

describe("getUploadSession", () => {
  it("asks for the bare path when no page is named", async () => {
    respondWith({ body: SESSION_DETAIL, status: 200 });

    await getUploadSession({ sessionId: SESSION_ID });

    expect(onlyCall().url).toBe(`/api/upload-sessions/${SESSION_ID}`);
  });

  it("puts the page and the states on the query, states comma-joined", async () => {
    respondWith({ body: SESSION_DETAIL, status: 200 });

    await getUploadSession({
      sessionId: SESSION_ID,
      limit: 50,
      cursor: "opaque",
      states: ["failed", "refused"],
    });

    expect(onlyCall().url).toBe(
      `/api/upload-sessions/${SESSION_ID}?limit=50&cursor=opaque&states=failed%2Crefused`,
    );
  });
});

describe("putUploadManifest", () => {
  it("patches the entries under files and parses the outcomes", async () => {
    respondWith({
      body: {
        sessionId: SESSION_ID,
        fileCount: 1,
        totalBytes: 2048,
        outcomes: [
          {
            clientRef: "0",
            fileId: FILE_ID,
            disposition: "created",
            state: "waiting",
            capturedOn: "2026-10-02",
            captureSource: "exif",
            problemCode: null,
          },
        ],
      },
      status: 200,
    });
    const entry = {
      clientRef: "0",
      originalFilename: "IMG_0001.HEIC",
      declaredContentType: "image/heic",
      declaredBytes: 2048,
    };

    const response = await putUploadManifest({
      sessionId: SESSION_ID,
      files: [entry],
    });

    expect(response.outcomes[0]?.disposition).toBe("created");
    const { url, init } = onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/manifest`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ files: [entry] }));
  });
});

describe("presignUploadFile", () => {
  it("posts the hash and size to the file's presign route", async () => {
    respondWith({
      body: {
        mode: "single",
        fileId: FILE_ID,
        method: "PUT",
        url: "https://s3.example.com/bucket/key?signature=x",
        headers: { "Content-Type": "image/heic" },
        expiresAt: AT,
      },
      status: 200,
    });

    const presigned = await presignUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      body: { contentHash: HASH, byteSize: 2048, purpose: "original" },
    });

    expect(presigned.mode).toBe("single");
    const { url, init } = onlyCall();
    expect(url).toBe(
      `/api/upload-sessions/${SESSION_ID}/files/${FILE_ID}/presign`,
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({
        contentHash: HASH,
        byteSize: 2048,
        purpose: "original",
      }),
    );
  });

  it("surfaces a 503 with its status, which is what the engine retries on", async () => {
    respondWith({
      body: {
        error: "upload_storage_unavailable",
        message: "Backblaze is down.",
      },
      status: 503,
    });

    const failure = await presignUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      body: { contentHash: HASH, byteSize: 2048, purpose: "original" },
    }).catch((error: unknown) => {
      return error;
    });

    expect(failure).toMatchObject({
      status: 503,
      code: "upload_storage_unavailable",
    });
  });
});

describe("completeUploadFile", () => {
  it("posts the done outcome and returns the settlement latch", async () => {
    respondWith({
      body: {
        file: FILE_DTO,
        progress: PROGRESS,
        sessionState: "settled",
        didSettle: true,
      },
      status: 200,
    });

    const response = await completeUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      body: { outcome: "done", contentHash: HASH, byteSize: 2048 },
    });

    expect(response.didSettle).toBe(true);
    const { url, init } = onlyCall();
    expect(url).toBe(
      `/api/upload-sessions/${SESSION_ID}/files/${FILE_ID}/complete`,
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ outcome: "done", contentHash: HASH, byteSize: 2048 }),
    );
  });
});

describe("commitUploadSession", () => {
  it("posts the arm intent as the body and parses the batch", async () => {
    respondWith({
      body: { ...SESSION_DETAIL, state: "uploading" },
      status: 200,
    });

    const detail = await commitUploadSession({
      sessionId: SESSION_ID,
      intent: "arm",
    });

    expect(detail.state).toBe("uploading");
    const { url, init } = onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/commit`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ intent: "arm" }));
  });

  it("posts the close intent, which is a resume's send what did arrive", async () => {
    respondWith({ body: { ...SESSION_DETAIL, state: "settled" }, status: 200 });

    const detail = await commitUploadSession({
      sessionId: SESSION_ID,
      intent: "close",
    });

    expect(detail.state).toBe("settled");
    expect(onlyCall().init.body).toBe(JSON.stringify({ intent: "close" }));
  });
});

describe("the bodiless writes", () => {
  it("retries a file with a POST that claims no body", async () => {
    respondWith({
      body: { file: FILE_DTO, isIncludedInEmail: false },
      status: 200,
    });

    const response = await retryUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
    });

    expect(response.isIncludedInEmail).toBe(false);
    const { url, init } = onlyCall();
    expect(url).toBe(
      `/api/upload-sessions/${SESSION_ID}/files/${FILE_ID}/retry`,
    );
    expect(init).toEqual({ credentials: "same-origin", method: "POST" });
  });

  it("cancels with a DELETE and accepts the 204", async () => {
    respondWith({ body: undefined, status: 204 });

    await expect(cancelUploadSession(SESSION_ID)).resolves.toBeUndefined();
    const { url, init } = onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}`);
    expect(init.method).toBe("DELETE");
  });
});
