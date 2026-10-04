import classes from "@/system/system.module.css";
import type { UploadFileActivity } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Progress } from "@mantine/core";
import type { UploadFileDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { uploadProblemCopy } from "../../../uploadCopyHelpers/uploadCopyHelpers";
import uploadClasses from "./UploadFileDescription.module.css";
type Props = { file: UploadFileDto; activity?: UploadFileActivity };
/**
 * Filenames, failure reasons, local wire bytes and silent retry explanation.
 */
export function UploadFileDescription({
  file,
  activity,
}: Readonly<Props>): ReactNode {
  const needsExplanation =
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
          {activity?.kind === "duplicate"
            ? "This was already in the Shoebox. It was not uploaded twice."
            : uploadProblemCopy(
                activity?.kind === "unconfirmed"
                  ? (activity.problemCode ?? undefined)
                  : (file.problemCode ?? undefined),
              )}
        </p>
      ) : null}
      {activity?.kind === "transferring" ? (
        <Progress
          aria-label={`Sending ${file.originalFilename}`}
          value={
            activity.totalBytes > 0
              ? (100 * activity.sentBytes) / activity.totalBytes
              : 0
          }
        />
      ) : null}
      {activity?.isIncludedInEmail === false ? (
        <p className={classes.fileMeta}>
          This photograph will appear on its day without another email.
        </p>
      ) : null}
    </div>
  );
}
