import classes from "@/system/system.module.css";
import type { UploadFileActivity } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { UploadFileDescription } from "./UploadFileDescription/UploadFileDescription";
import uploadClasses from "./UploadFileRow.module.css";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import { UploadFileThumbnail } from "./UploadFileThumbnail/UploadFileThumbnail";
import { isMissingUploadOriginal } from "../uploadResumeHelpers";
import { UploadFileActions } from "./UploadFileActions";
const STATE_WORD: Record<UploadFileDto["state"], string> = {
  waiting: "Waiting",
  sending: "Sending",
  done: "Up",
  failed: "Did not arrive",
  refused: "Refused",
  cancelled: "Left out",
} as const;
function _fileStatus({
  file,
  activity,
}: Readonly<{
  file: Readonly<UploadFileDto>;
  activity: UploadFileActivity | undefined;
}>): string {
  if (file.duplicateReason || activity?.kind === "duplicate") {
    return "Duplicate";
  }
  return activity?.kind === "preparing"
    ? "Preparing"
    : activity?.kind === "transferring"
      ? "Sending"
      : activity?.kind === "unconfirmed"
        ? "Not confirmed up"
        : STATE_WORD[file.state];
}
type Props = {
  file: UploadFileDto;
  activity?: UploadFileActivity;
  onRetry?: () => void;
  onRemove?: (trigger: HTMLElement) => void;
  isDisabled: boolean;
  isComplete?: boolean;
  localFile?: File;
  previews?: UploadPreviewQueue;
};

/** Confirmed file state and local wire progress stay separate. */
export function UploadFileRow({
  file,
  activity,
  onRetry,
  onRemove,
  isDisabled,
  isComplete,
  localFile,
  previews,
}: Readonly<Props>): ReactNode {
  return (
    <div className={`${classes.fileRow} ${uploadClasses.uploadFileRowFileRow}`}>
      <UploadFileThumbnail
        file={file}
        localFile={localFile}
        previews={previews}
      />
      <div className={uploadClasses.description}>
        <span className={classes.fileState}>
          {_fileStatus({ file: file, activity: activity })}
        </span>
        <UploadFileDescription
          file={file}
          activity={activity}
          isComplete={isComplete}
        />
      </div>
      <UploadFileActions
        filename={file.originalFilename}
        isDisabled={isDisabled}
        onRemove={onRemove}
        onRetry={isMissingUploadOriginal(file, activity) ? onRetry : undefined}
      />
    </div>
  );
}
