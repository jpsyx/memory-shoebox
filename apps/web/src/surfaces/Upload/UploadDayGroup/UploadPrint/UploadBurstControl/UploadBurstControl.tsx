import { Button } from "@mantine/core";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { type ReactNode } from "react";
import classes from "./UploadBurstControl.module.css";
import { useUploadBurstChange } from "./useUploadBurstChange";

type Props = {
  file: UploadFileDto;
  onChange?: (excluded: boolean) => Promise<void>;
  isDisabled?: boolean;
};

/** Keeps reversible burst grouping distinct from removing an upload file. */
export function UploadBurstControl({
  file,
  onChange,
  isDisabled,
}: Readonly<Props>): ReactNode {
  const { isPending, hasError, onClick } = useUploadBurstChange({
    onChange,
    isExcluded: file.burst?.isExcluded ?? false,
  });
  if (!file.burst) {
    return null;
  }
  const { isExcluded, photoCount, canRestore } = file.burst;
  const label = isExcluded ? "Return to burst" : "Make standalone";
  return (
    <div className={classes.uploadBurstControl}>
      <span aria-live="polite">
        {isExcluded
          ? "Standalone photo"
          : `Burst · ${photoCount} ${photoCount === 1 ? "photo" : "photos"}`}
      </span>
      {onChange && (!isExcluded || canRestore !== false) ? (
        <Button
          variant="subtle"
          className={classes.uploadBurstButton}
          classNames={{ label: classes.uploadBurstButtonLabel }}
          aria-label={`${label}: ${file.originalFilename}`}
          loading={isPending}
          disabled={isDisabled || isPending}
          onClick={onClick}
        >
          {label}
        </Button>
      ) : null}
      {hasError ? (
        <span role="alert">This change could not be saved. Try again.</span>
      ) : null}
    </div>
  );
}
