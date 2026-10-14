import type { UploadFileDto } from "@memory-shoebox/shared";
import type {
  UploadFileActivity,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";

/** Only unfinished, non-duplicate originals are eligible for another transfer. */
export function isMissingUploadOriginal(
  file: Readonly<UploadFileDto>,
  activity?: UploadFileActivity,
): boolean {
  return (
    !file.duplicateReason &&
    activity?.kind !== "duplicate" &&
    (file.state === "waiting" ||
      file.state === "sending" ||
      file.state === "failed")
  );
}

/** The batch action includes available unfinished originals and blocks uncertain state. */
export function getResumeActionFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): {
  retainedIds: string[];
  hasUnavailableOriginals: boolean;
  isDisabled: boolean;
  label: string;
} {
  const missing = snapshot.detail!.files.filter((file) => {
    return isMissingUploadOriginal(
      file,
      snapshot.fileActivityById.get(file.fileId),
    );
  });
  const retainedIds = missing
    .filter((file) => {
      return snapshot.filesById.has(file.fileId);
    })
    .map((file) => {
      return file.fileId;
    });
  return {
    retainedIds,
    hasUnavailableOriginals: missing.length > retainedIds.length,
    isDisabled:
      snapshot.isBusy ||
      snapshot.isRunning ||
      snapshot.phase === "loading" ||
      snapshot.phase === "checking" ||
      Boolean(snapshot.hasUnconfirmedRemoval) ||
      snapshot.recoveryMatches.ambiguous.length > 0,
    label: missing.every((file) => {
      return file.state === "failed";
    })
      ? "Retry upload"
      : "Resume upload",
  };
}
