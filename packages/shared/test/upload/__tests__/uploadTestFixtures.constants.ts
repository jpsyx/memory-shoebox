/**
 * Stable upload-session id used by the fixtures.
 */
export const SESSION_ID = "0199c0a0-0000-7000-8000-000000000001";

/**
 * Stable upload-file id used by the fixtures.
 */
export const FILE_ID = "0199c0a0-0000-7000-8000-000000000002";

/**
 * Stable member id used by the fixtures.
 */
export const MEMBER_ID = "0199c0a0-0000-7000-8000-000000000003";

/**
 * Stable tag id used by the fixtures.
 */
export const TAG_ID = "0199c0a0-0000-7000-8000-000000000004";

/**
 * Stable milestone id used by the fixtures.
 */
export const MILESTONE_ID = "0199c0a0-0000-7000-8000-000000000005";

/**
 * Deterministic SHA-256 checksum used by the fixtures.
 */
export const HASH = "a".repeat(64);

/**
 * Upload-file response used by schema validation fixtures.
 */
export const FILE = {
  fileId: FILE_ID,
  position: 0,
  originalFilename: "IMG_20260914_064132.jpg",
  declaredContentType: "image/jpeg",
  declaredBytes: 2_400_000,
  contentHash: null,
  state: "waiting",
  attemptCount: 0,
  problemCode: null,
  problemDetail: null,
  capturedAt: "2026-09-14T04:41:32.000Z",
  capturedOn: "2026-09-14",
  captureOffsetMinutes: null,
  captureSource: "filename",
  itemId: null,
  media: null,
};

/**
 * Draft upload-session response used by schema validation fixtures.
 */
export const DRAFT_DETAIL = {
  sessionId: SESSION_ID,
  state: "draft",
  uploadedBy: { memberId: MEMBER_ID, displayName: "Papá" },
  visibility: {
    visibilityRuleId: "visibility-rule-everyone",
    mode: "everyone",
    label: null,
    subjects: [],
  },
  clientTimezone: "Europe/Madrid",
  fileCount: 0,
  totalBytes: 0,
  createdAt: "2026-09-27T10:00:00.000Z",
  committedAt: null,
  settledAt: null,
  lastActivityAt: "2026-09-27T10:00:00.000Z",
  notifiedAt: null,
  notifiedMemberCount: null,
  progress: {
    waitingCount: 1,
    sendingCount: 0,
    doneCount: 0,
    failedCount: 0,
    refusedCount: 0,
    cancelledCount: 0,
    doneBytes: 0,
  },
  days: [{ capturedOn: "2026-09-14", fileCount: 1, milestones: [] }],
  edits: [],
  mismatches: [],
  undated: null,
  pendingFiles: [
    { fileId: FILE_ID, originalFilename: "IMG_0001.jpg", declaredBytes: 10 },
  ],
  summary: null,
  files: [FILE],
  nextCursor: null,
};

/**
 * Manifest entry used by request-schema validation fixtures.
 */
export const ENTRY = {
  clientRef: "picked-1",
  originalFilename: "IMG_0001.jpg",
  declaredContentType: "image/jpeg",
  declaredBytes: 2_400_000,
};
