import { expect, vi } from "vitest";

/**
 * Stable upload-session id used by the fixtures.
 */
export const SESSION_ID = "018f0000-0000-7000-8000-00000000c001";

/**
 * Stable upload-file id used by the fixtures.
 */
export const FILE_ID = "018f0000-0000-7000-8000-00000000f001";

/**
 * Stable upload-edit id used by the fixtures.
 */
export const EDIT_ID = "018f0000-0000-7000-8000-00000000e001";

/**
 * Stable member id used by the fixtures.
 */
export const MEMBER_ID = "018f0000-0000-7000-8000-000000000001";

/**
 * Deterministic SHA-256 checksum used by the fixtures.
 */
export const HASH = "a".repeat(64);

/**
 * Timestamp used by the API fixtures.
 */
export const AT = "2026-10-02T10:00:00.000Z";

/**
 * Progress totals returned by the API fixture.
 */
export const PROGRESS = {
  waitingCount: 0,
  sendingCount: 0,
  doneCount: 1,
  failedCount: 0,
  refusedCount: 0,
  cancelledCount: 0,
  doneBytes: 2048,
};

/** The smallest body `uploadSessionDetailSchema` accepts: a fresh draft. */
export const SESSION_DETAIL = {
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

/**
 * File response returned by the upload API fixture.
 */
export const FILE_DTO = {
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

/**
 * Batch-edit response returned by the upload API fixture.
 */
export const EDIT_DTO = {
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
export function respondWith(
  functionOptions: Readonly<{ body: unknown; status: number }>,
): void {
  const { body, status } = functionOptions;

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
export function onlyCall(): { url: string; init: RequestInit } {
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls).toHaveLength(1);
  const [url, init] = calls[0] ?? [];
  return { url: String(url), init: init ?? {} };
}
