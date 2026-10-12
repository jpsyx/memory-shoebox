import classes from "@/system/system.module.css";
import type { UploadFileActivity } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Progress } from "@mantine/core";
import type { UploadFileDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { uploadProblemCopy } from "../../../uploadCopyHelpers/uploadCopyHelpers";
import uploadClasses from "./UploadFileDescription.module.css";
type Props = {
  file: UploadFileDto;
  activity?: UploadFileActivity;
  isComplete?: boolean;
};

function _duplicateExplanation({
  file,
  activity,
  isComplete,
}: Readonly<Props>): string | undefined {
  if (!file.duplicateReason && activity?.kind !== "duplicate") {
    return undefined;
  }
  const reason =
    file.duplicateReason === "archive"
      ? "already in the shoebox"
      : file.duplicateReason === "batch"
        ? "already selected in this batch"
        : undefined;
  if (isComplete) {
    return reason ? `Skipped duplicate: ${reason}.` : "Skipped duplicate file.";
  }
  return reason
    ? `Duplicate: ${reason}. This file will be skipped.`
    : "Duplicate file. This file will be skipped.";
}

/**
 * Filenames, failure reasons, local wire bytes and silent retry explanation.
 */
export function UploadFileDescription({
  file,
  activity,
  isComplete,
}: Readonly<Props>): ReactNode {
  const duplicateExplanation = _duplicateExplanation({
    file,
    activity,
    isComplete,
  });
  const needsExplanation =
    Boolean(duplicateExplanation) ||
    file.state === "failed" ||
    file.state === "refused" ||
    file.state === "cancelled" ||
    activity?.kind === "unconfirmed";
  return (
    <div className={uploadClasses.uploadFileDescriptionFileDescription}>
      <span className={classes.fileName}>{file.originalFilename}</span>
      <span className={classes.fileMeta}>
        {file.capturedOn ?? "Capture day unavailable"}
      </span>
      {needsExplanation ? (
        <p className={classes.fileMeta}>
          {duplicateExplanation ??
            uploadProblemCopy(
              activity?.kind === "unconfirmed"
                ? (activity.problemCode ?? undefined)
                : (file.problemCode ?? undefined),
            )}
        </p>
      ) : null}
      {!duplicateExplanation && activity?.kind === "transferring" ? (
        <Progress
          aria-label={`Sending ${file.originalFilename}`}
          value={
            activity.totalBytes > 0
              ? (100 * activity.sentBytes) / activity.totalBytes
              : 0
          }
        />
      ) : null}
      {!duplicateExplanation && activity?.isIncludedInEmail === false ? (
        <p className={classes.fileMeta}>
          This photograph will appear on its day without another email.
        </p>
      ) : null}
    </div>
  );
}
