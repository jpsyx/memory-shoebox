import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { UploadFileDto } from "@memory-shoebox/shared";
import type { UploadFileActivity } from "@/upload/uploadSessionController/uploadSessionController.types";
import { UploadFileDescription } from "./UploadFileDescription";
import classes from "@/system/system.module.css";
import uploadClasses from "../upload.module.css";
const STATE_WORD: Record<UploadFileDto["state"], string> = {
  waiting: "Waiting",
  sending: "Sending",
  done: "Up",
  failed: "Did not arrive",
  refused: "Refused",
  cancelled: "Left out",
};
function _fileStatus(
  file: Readonly<UploadFileDto>,
  activity: UploadFileActivity | undefined,
): string {
  return activity?.kind === "preparing"
    ? "Preparing"
    : activity?.kind === "transferring"
      ? "Sending"
      : activity?.kind === "unconfirmed"
        ? "Not confirmed up"
        : activity?.kind === "duplicate"
          ? "Duplicate pick"
          : STATE_WORD[file.state];
}
type Props = {
  file: UploadFileDto;
  activity?: UploadFileActivity;
  onRetry?: () => void;
  isDisabled: boolean;
};
/** Confirmed file state and local wire progress stay separate. */
export function UploadFileRow({
  file,
  activity,
  onRetry,
  isDisabled,
}: Readonly<Props>): ReactNode {
  return (
    <div className={`${classes.fileRow} ${uploadClasses.fileRow}`}>
      <span className={classes.fileState}>{_fileStatus(file, activity)}</span>
      <UploadFileDescription file={file} activity={activity} />
      {onRetry ? (
        <Button
          variant="default"
          size="sm"
          disabled={isDisabled}
          onClick={onRetry}
        >
          Retry {file.originalFilename}
        </Button>
      ) : null}
    </div>
  );
}
