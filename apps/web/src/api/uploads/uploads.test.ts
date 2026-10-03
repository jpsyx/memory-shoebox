import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateUploadEditRequest } from "@memory-shoebox/shared";
import { ZodError } from "zod";
import { ApiRequestError } from "@/api/client/client";
import {
  cancelUploadSession,
  commitUploadSession,
  completeUploadFile,
  createUploadEdit,
  getCurrentUploadSession,
  getUploadSession,
  openUploadSession,
  presignUploadFile,
  putUploadManifest,
  retryUploadFile,
  setUploadVisibility,
  undoUploadEdit,
} from "@/api/uploads/uploads";

const SESSION_ID = "018f0000-0000-7000-8000-00000000c001";
const FILE_ID = "018f0000-0000-7000-8000-00000000f001";
const EDIT_ID = "018f0000-0000-7000-8000-00000000e001";
const MEMBER_ID = "018f0000-0000-7000-8000-000000000001";
const HASH = "a".repeat(64);
const AT = "2026-10-02T10:00:00.000Z";

const PROGRESS = {
  waitingCount: 0,
  sendingCount: 0,
  doneCount: 1,
  failedCount: 0,
  refusedCount: 0,
  cancelledCount: 0,
  doneBytes: 2048,
};

/** The smallest body `uploadSessionDetailSchema` accepts: a fresh draft. */
const SESSION_DETAIL = {
  sessionId: SESSION_ID,
  state: "draft",
  uploadedBy: { memberId: MEMBER_ID, displayName: "Abuela" },
  visibility: {
    visibilityRuleId: "visibility-rule-everyone",
    mode: "everyone",
    label: null,
    subjects: [],
  },
  clientTimezone: "Europe/Madrid",
  fileCount: 0,
  totalBytes: 0,
  createdAt: AT,
  committedAt: null,
  settledAt: null,
  lastActivityAt: AT,
  notifiedAt: null,
  notifiedMemberCount: null,
  progress: { ...PROGRESS, doneCount: 0, doneBytes: 0 },
  days: [],
  edits: [],
  mismatches: [],
  undated: null,
  pendingFiles: [],
  summary: null,
  files: [],
  nextCursor: null,
};

const FILE_DTO = {
  fileId: FILE_ID,
  position: 0,
  originalFilename: "IMG_0001.HEIC",
  declaredContentType: "image/heic",
  declaredBytes: 2048,
  contentHash: HASH,
  state: "done",
  attemptCount: 1,
  problemCode: null,
  problemDetail: null,
  capturedAt: AT,
  capturedOn: "2026-10-02",
  captureOffsetMinutes: 120,
  captureSource: "exif",
  itemId: "018f0000-0000-7000-8000-00000000a001",
  media: null,
};

const EDIT_DTO = {
  editId: EDIT_ID,
  kind: "tag",
  label: "Hospital",
  tag: null,
  person: null,
  milestone: null,
  targetCount: 12,
  createdAt: AT,
  undoneAt: null,
  appliedAt: null,
  canUndo: true,
};

/** One canned response, so a test states only what it is about. */
function _respondWith(body: unknown, status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/** The URL and init of the one call the function under test made. */
function _onlyCall(): { url: string; init: RequestInit } {
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls).toHaveLength(1);
  const [url, init] = calls[0] ?? [];
  return { url: String(url), init: init ?? {} };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openUploadSession", () => {
  it("posts the browser's zone and parses the new draft", async () => {
    _respondWith(SESSION_DETAIL, 201);

    const detail = await openUploadSession({ clientTimezone: "Europe/Madrid" });

    expect(detail.state).toBe("draft");
    const { url, init } = _onlyCall();
    expect(url).toBe("/api/upload-sessions");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ clientTimezone: "Europe/Madrid" }));
  });

  it("keeps the open batch's id off a 409, so the caller can pick it up", async () => {
    _respondWith(
      {
        error: "upload_session_conflict",
        message: "Already open.",
        details: { sessionId: SESSION_ID },
      },
      409,
    );

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
    _respondWith(undefined, 204);

    await expect(getCurrentUploadSession()).resolves.toBeNull();
    expect(_onlyCall().url).toBe("/api/upload-sessions/current");
  });

  it("answers the session when there is one to pick up", async () => {
    _respondWith({ ...SESSION_DETAIL, state: "uploading" }, 200);

    const detail = await getCurrentUploadSession();

    expect(detail?.sessionId).toBe(SESSION_ID);
    expect(detail?.state).toBe("uploading");
  });
});

describe("getUploadSession", () => {
  it("asks for the bare path when no page is named", async () => {
    _respondWith(SESSION_DETAIL, 200);

    await getUploadSession({ sessionId: SESSION_ID });

    expect(_onlyCall().url).toBe(`/api/upload-sessions/${SESSION_ID}`);
  });

  it("puts the page and the states on the query, states comma-joined", async () => {
    _respondWith(SESSION_DETAIL, 200);

    await getUploadSession({
      sessionId: SESSION_ID,
      limit: 50,
      cursor: "opaque",
      states: ["failed", "refused"],
    });

    expect(_onlyCall().url).toBe(
      `/api/upload-sessions/${SESSION_ID}?limit=50&cursor=opaque&states=failed%2Crefused`,
    );
  });
});

describe("putUploadManifest", () => {
  it("patches the entries under files and parses the outcomes", async () => {
    _respondWith(
      {
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
      200,
    );
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
    const { url, init } = _onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/manifest`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ files: [entry] }));
  });
});

describe("presignUploadFile", () => {
  it("posts the hash and size to the file's presign route", async () => {
    _respondWith(
      {
        mode: "single",
        fileId: FILE_ID,
        method: "PUT",
        url: "https://s3.example.com/bucket/key?signature=x",
        headers: { "Content-Type": "image/heic" },
        expiresAt: AT,
      },
      200,
    );

    const presigned = await presignUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      body: { contentHash: HASH, byteSize: 2048, purpose: "original" },
    });

    expect(presigned.mode).toBe("single");
    const { url, init } = _onlyCall();
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
    _respondWith(
      { error: "upload_storage_unavailable", message: "Backblaze is down." },
      503,
    );

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
  it("posts the outcome and parses progress and the latch", async () => {
    _respondWith(
      {
        file: FILE_DTO,
        progress: PROGRESS,
        sessionState: "settled",
        didSettle: true,
      },
      200,
    );

    const response = await completeUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      body: { outcome: "done", contentHash: HASH, byteSize: 2048 },
    });

    expect(response.didSettle).toBe(true);
    const { url, init } = _onlyCall();
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
    _respondWith({ ...SESSION_DETAIL, state: "uploading" }, 200);

    const detail = await commitUploadSession({
      sessionId: SESSION_ID,
      intent: "arm",
    });

    expect(detail.state).toBe("uploading");
    const { url, init } = _onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/commit`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ intent: "arm" }));
  });

  it("posts the close intent, which is a resume's send what did arrive", async () => {
    _respondWith({ ...SESSION_DETAIL, state: "settled" }, 200);

    const detail = await commitUploadSession({
      sessionId: SESSION_ID,
      intent: "close",
    });

    expect(detail.state).toBe("settled");
    expect(_onlyCall().init.body).toBe(JSON.stringify({ intent: "close" }));
  });
});

describe("the bodiless writes", () => {
  it("retries a file with a POST that claims no body", async () => {
    _respondWith({ file: FILE_DTO, isIncludedInEmail: false }, 200);

    const response = await retryUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
    });

    expect(response.isIncludedInEmail).toBe(false);
    const { url, init } = _onlyCall();
    expect(url).toBe(
      `/api/upload-sessions/${SESSION_ID}/files/${FILE_ID}/retry`,
    );
    expect(init).toEqual({ credentials: "same-origin", method: "POST" });
  });

  it("cancels with a DELETE and accepts the 204", async () => {
    _respondWith(undefined, 204);

    await expect(cancelUploadSession(SESSION_ID)).resolves.toBeUndefined();
    const { url, init } = _onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}`);
    expect(init.method).toBe("DELETE");
  });
});

describe("the plan and the rule", () => {
  it("patches the visibility rule and parses the summary", async () => {
    _respondWith(SESSION_DETAIL.visibility, 200);

    const summary = await setUploadVisibility({
      sessionId: SESSION_ID,
      body: { mode: "everyone", subjects: [] },
    });

    expect(summary.mode).toBe("everyone");
    const { url, init } = _onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/visibility`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ mode: "everyone", subjects: [] }));
  });

  it("posts one bulk action and parses the edit", async () => {
    _respondWith(EDIT_DTO, 201);

    const body: CreateUploadEditRequest = {
      kind: "tag",
      targetFileIds: [FILE_ID],
      labelSnapshot: "Hospital",
    };

    const edit = await createUploadEdit({ sessionId: SESSION_ID, body });

    expect(edit.targetCount).toBe(12);
    const { url, init } = _onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/edits`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(body));
  });

  it("undoes one with a DELETE that still answers the edit", async () => {
    _respondWith({ ...EDIT_DTO, undoneAt: AT, canUndo: false }, 200);

    const edit = await undoUploadEdit({
      sessionId: SESSION_ID,
      editId: EDIT_ID,
    });

    expect(edit.canUndo).toBe(false);
    const { url, init } = _onlyCall();
    expect(url).toBe(`/api/upload-sessions/${SESSION_ID}/edits/${EDIT_ID}`);
    expect(init.method).toBe("DELETE");
  });
});

describe("a response that has drifted from its schema", () => {
  it("throws at the boundary rather than handing back a partial detail", async () => {
    const { progress: _progress, ...detailWithoutProgress } = SESSION_DETAIL;
    _respondWith(detailWithoutProgress, 200);

    await expect(
      getUploadSession({ sessionId: SESSION_ID }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
