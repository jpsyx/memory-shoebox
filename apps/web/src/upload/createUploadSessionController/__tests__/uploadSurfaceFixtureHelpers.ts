import type { MilestoneDetailResponse } from "@/api/milestoneHelpers/milestoneHelpers.types";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import type {
  UploadFileDto,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import type { UploadSnapshot } from "../createUploadSessionController.types";

/** Complete manifest row with stable ids and server capture days. */
export function makeUploadFileFromPosition(position: number): UploadFileDto {
  return {
    fileId: `018f0000-0000-7000-8000-${position.toString(16).padStart(12, "0")}`,
    position,
    originalFilename: `IMG_${position}.jpg`,
    declaredContentType: "image/jpeg",
    declaredBytes: 1000,
    contentHash: null,
    state: "waiting",
    attemptCount: 0,
    problemCode: null,
    problemDetail: null,
    capturedAt: "2026-10-02T10:00:00.000Z",
    capturedOn: position < 100 ? "2026-10-01" : "2026-10-02",
    captureOffsetMinutes: 0,
    captureSource: "exif",
    itemId: null,
    media: null,
  };
}

/** Whole 264-file manifest, with aggregate counts independent of its pages. */
export function makeUploadSurfaceDetail(
  overrides: Readonly<Partial<UploadSessionDetail>> = {},
): UploadSessionDetail {
  const empty = makeUploadSessionDetail();
  return {
    ...empty,
    fileCount: 264,
    totalBytes: 264000,
    progress: { ...empty.progress, waitingCount: 264 },
    files: Array.from({ length: 264 }, (_, position) => {
      return makeUploadFileFromPosition(position);
    }),
    ...overrides,
  };
}

/** Browser state containing only the supplied authoritative session. */
export function makeUploadSnapshotFromDetail(
  detail: Readonly<UploadSessionDetail>,
): UploadSnapshot {
  return {
    phase: "sending",
    detail,
    filesById: new Map(),
    selectedFileIds: new Set(),
    fileActivityById: new Map(),
    editTargets: new Map(),
    declaredCount: 264,
    declarationTotal: 264,
    checkingCount: 0,
    checkingTotal: 0,
    recoveryMatches: {
      knownMatches: [],
      ambiguous: [],
      alreadyUpClientRefs: [],
      refusedClientRefs: [],
      unmatchedClientRefs: [],
    },
    isBusy: false,
    isRunning: true,
  };
}

/** Memory-backed browser storage without a browser-global dependency. */
export function makeUploadRecoveryStorage(): Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => {
      return values.get(key) ?? null;
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

/** Returns a milestone detail response for upload occasion tests. */
export function makeUploadMilestoneDetail(): MilestoneDetailResponse {
  return {
    milestone: {
      milestoneId: "018f0000-0000-7000-8000-000000008000",
      name: "Home from the hospital",
      startsOn: "2026-09-17",
      endsOn: "2026-09-17",
      blurb: null,
    },
    itemCount: 12,
    dayCount: 1,
    canEdit: true,
    canDelete: true,
    mismatchCount: 0,
    createdBy: null,
    createdAt: "2026-10-03T00:00:00.000Z",
    updatedAt: "2026-10-03T00:00:00.000Z",
  };
}
