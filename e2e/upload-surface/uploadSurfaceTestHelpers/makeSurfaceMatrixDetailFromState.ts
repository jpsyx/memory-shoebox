import {
  type MilestoneRef,
  uploadSessionDetailSchema,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { makeSurfaceContractDetail } from "./makeSurfaceContractDetail.ts";

const OCCASION: MilestoneRef = {
  milestoneId: "018f0000-0000-7000-8000-000000008000",
  name: "Home from the hospital",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};

function _getMatrixFilesFromState({
  detail,
  state,
}: Readonly<{
  detail: UploadSessionDetail;
  state: string;
}>): UploadSessionDetail["files"] {
  return detail.files.map((file, position) => {
    return {
      ...file,
      state:
        state === "partial" && position === 262
          ? "failed"
          : state === "partial" && position === 263
            ? "refused"
            : "done",
      problemCode:
        state === "partial" && position >= 262
          ? position === 262
            ? "connection_lost"
            : "unsupported_type"
          : null,
    };
  });
}

function _makeMatrixSettledOutcomeFromDetail({
  detail,
  state,
}: Readonly<{
  detail: UploadSessionDetail;
  state: string;
}>): UploadSessionDetail {
  const isSettled = state === "done" || state === "partial";
  const progress = isSettled
    ? {
        ...detail.progress,
        waitingCount: 0,
        doneCount: state === "done" ? 264 : 262,
        failedCount: state === "partial" ? 1 : 0,
        refusedCount: state === "partial" ? 1 : 0,
        doneBytes: state === "done" ? 264000 : 262000,
      }
    : detail.progress;
  const summary = isSettled
    ? {
        itemCount: progress.doneCount,
        dayCount: 3,
        milestoneCount: 2,
        burstCount: 1,
        burstFrameCount: 45,
        notifiedMemberCount: 4,
      }
    : detail.summary;
  return {
    ...detail,
    state: isSettled ? "settled" : detail.state,
    files: isSettled
      ? _getMatrixFilesFromState({ detail, state })
      : detail.files,
    progress,
    summary,
  };
}

function _makeMatrixOutcomeFromDetail({
  detail,
  state,
}: Readonly<{
  detail: UploadSessionDetail;
  state: string;
}>): UploadSessionDetail {
  const isResuming = state === "resume";
  const resumed = {
    ...detail,
    state: isResuming ? ("uploading" as const) : detail.state,
    files: isResuming
      ? detail.files.map((file, position) => {
          return {
            ...file,
            state: position < 200 ? ("done" as const) : ("waiting" as const),
          };
        })
      : detail.files,
    progress: isResuming
      ? {
          ...detail.progress,
          waitingCount: 64,
          doneCount: 200,
          doneBytes: 200000,
        }
      : detail.progress,
  };
  return _makeMatrixSettledOutcomeFromDetail({ detail: resumed, state });
}

function _makeMatrixDateGroupsFromDetail({
  detail,
  state,
}: Readonly<{
  detail: UploadSessionDetail;
  state: string;
}>): UploadSessionDetail {
  const mismatches =
    state === "milestone-fix"
      ? [
          {
            milestone: OCCASION,
            files: detail.files
              .slice(12, 16)
              .map(({ fileId, originalFilename, capturedOn }) => {
                return { fileId, originalFilename, capturedOn: capturedOn! };
              }),
          },
        ]
      : detail.mismatches;
  const firstFile = detail.files[0]!;
  const undated =
    state === "undated"
      ? {
          fileCount: 1,
          captureSource: "file_mtime" as const,
          files: [
            {
              fileId: firstFile.fileId,
              originalFilename: firstFile.originalFilename,
              capturedOn: "2026-09-17",
            },
          ],
        }
      : detail.undated;
  const files =
    state === "undated"
      ? detail.files.map((file, position) => {
          return position === 0
            ? { ...file, captureSource: "file_mtime" as const }
            : file;
        })
      : detail.files;
  return { ...detail, mismatches, undated, files };
}

function _makeMatrixPlanFromDetail({
  detail,
  state,
}: Readonly<{
  detail: UploadSessionDetail;
  state: string;
}>): UploadSessionDetail {
  const kinds =
    state === "tagged"
      ? ["tag"]
      : state === "people-tagged"
        ? ["tag", "person"]
        : ["milestone-assigned", "milestone-fix", "resume"].includes(state)
          ? ["tag", "person", "milestone"]
          : [];
  const edits = kinds.map((kind, position) => {
    return {
      editId: `018f0000-0000-7000-8000-${(position + 900).toString(16).padStart(12, "0")}`,
      kind: kind as "tag" | "person" | "milestone",
      label:
        kind === "tag"
          ? "hospital"
          : kind === "person"
            ? "Mateo"
            : OCCASION.name,
      tag: null,
      person: null,
      milestone: kind === "milestone" ? OCCASION : null,
      targetCount: 12,
      createdAt: "2026-10-03T00:00:00.000Z",
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    };
  });
  const days = kinds.includes("milestone")
    ? detail.days.map((day, position) => {
        return position === 0 ? { ...day, milestones: [OCCASION] } : day;
      })
    : detail.days;
  return _makeMatrixDateGroupsFromDetail({
    detail: { ...detail, edits, days },
    state,
  });
}

/** Validated complete manifest for browser-only visual comparisons. */
export function makeSurfaceMatrixDetailFromState(
  state: string,
): UploadSessionDetail {
  const detail = makeSurfaceContractDetail();
  const template = detail.files[0]!;
  const files = Array.from({ length: 264 }, (_, position) => {
    return {
      ...template,
      fileId: `018f0000-0000-7000-8000-${(position + 100).toString(16).padStart(12, "0")}`,
      position,
      originalFilename: `Family-${position + 1}.jpg`,
      capturedOn:
        position < 12
          ? "2026-09-17"
          : position < 138
            ? "2026-09-15"
            : "2026-09-12",
    };
  });
  const completeDetail = {
    ...detail,
    files,
    fileCount: 264,
    totalBytes: 264000,
    progress: { ...detail.progress, waitingCount: 264 },
    days: [
      { capturedOn: "2026-09-17", fileCount: 12, milestones: [] },
      { capturedOn: "2026-09-15", fileCount: 126, milestones: [] },
      { capturedOn: "2026-09-12", fileCount: 126, milestones: [] },
    ],
  };
  const planned = _makeMatrixPlanFromDetail({ detail: completeDetail, state });
  return uploadSessionDetailSchema.parse(
    _makeMatrixOutcomeFromDetail({ detail: planned, state }),
  );
}
