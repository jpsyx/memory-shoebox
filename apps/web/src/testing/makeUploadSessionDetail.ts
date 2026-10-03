import type {
  UploadSessionDetail,
  UploadSessionState,
} from "@memory-shoebox/shared";

/**
 * A complete `UploadSessionDetail` with nothing in it yet, for a test that
 * needs a session to exist rather than any particular figure in one.
 *
 * Only the id and the state vary across call sites; everything else is the
 * empty draft `POST /api/upload-sessions` answers.
 */
export function makeUploadSessionDetail(
  overrides: Readonly<{ sessionId?: string; state?: UploadSessionState }> = {},
): UploadSessionDetail {
  const at = "2026-10-02T10:00:00.000Z";
  return {
    sessionId: overrides.sessionId ?? "018f0000-0000-7000-8000-00000000c001",
    state: overrides.state ?? "draft",
    uploadedBy: {
      memberId: "018f0000-0000-7000-8000-000000000001",
      displayName: "Abuela",
    },
    visibility: {
      visibilityRuleId: "visibility-rule-everyone",
      mode: "everyone",
      label: null,
      subjects: [],
    },
    clientTimezone: "Europe/Madrid",
    fileCount: 0,
    totalBytes: 0,
    createdAt: at,
    committedAt: null,
    settledAt: null,
    lastActivityAt: at,
    notifiedAt: null,
    notifiedMemberCount: null,
    progress: {
      waitingCount: 0,
      sendingCount: 0,
      doneCount: 0,
      failedCount: 0,
      refusedCount: 0,
      cancelledCount: 0,
      doneBytes: 0,
    },
    days: [],
    edits: [],
    mismatches: [],
    undated: null,
    pendingFiles: [],
    summary: null,
    files: [],
    nextCursor: null,
  };
}
