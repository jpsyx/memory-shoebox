import type {
  UploadFileDto,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import type { UploadSnapshot } from "../uploadSessionController.types";

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
  detail: UploadSessionDetail,
): UploadSnapshot {
  return {
    phase: "sending",
    detail,
    filesById: {},
    selectedFileIds: new Set(),
    fileActivityById: {},
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
