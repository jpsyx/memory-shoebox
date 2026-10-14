import { ICON_PROPS_SMALL } from "@/system/icons";
import { ActionIcon, Button } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import classes from "./UploadFileRow.module.css";

type Props = {
  filename: string;
  isDisabled: boolean;
  onRetry?: () => void;
  onRemove?: (trigger: HTMLElement) => void;
};

/** Row actions retain the original filename and the removal trigger. */
export function UploadFileActions({
  filename,
  isDisabled,
  onRetry,
  onRemove,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.actions}>
      {onRemove ? (
        <ActionIcon
          variant="default"
          size={48}
          aria-label={`Remove ${filename}`}
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
          classNames={{ label: classes.retryLabel }}
          disabled={isDisabled}
          onClick={onRetry}
        >
          Retry {filename}
        </Button>
      ) : null}
    </div>
  );
}
