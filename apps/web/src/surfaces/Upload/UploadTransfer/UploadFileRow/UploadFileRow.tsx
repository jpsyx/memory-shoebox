import classes from "@/system/system.module.css";
import type { UploadFileActivity } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { IconTrash } from "@tabler/icons-react";
import { ActionIcon, Button } from "@mantine/core";
import type { UploadFileDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { UploadFileDescription } from "./UploadFileDescription/UploadFileDescription";
import uploadClasses from "./UploadFileRow.module.css";
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
  onRemove?: (trigger: HTMLElement) => void;
  isDisabled: boolean;
};

/** Confirmed file state and local wire progress stay separate. */
export function UploadFileRow({
  file,
  activity,
  onRetry,
  onRemove,
  isDisabled,
}: Readonly<Props>): ReactNode {
  return (
    <div className={`${classes.fileRow} ${uploadClasses.uploadFileRowFileRow}`}>
      <span className={classes.fileState}>
        {_fileStatus({ file: file, activity: activity })}
      </span>
      <UploadFileDescription file={file} activity={activity} />
      {onRemove ? (
        <ActionIcon
          variant="default"
          size={48}
          aria-label={`Remove ${file.originalFilename}`}
          disabled={isDisabled}
          onClick={(event) => {
            onRemove(event.currentTarget);
          }}
        >
          <IconTrash {...ICON_PROPS_SMALL} />
        </ActionIcon>
      ) : null}
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
