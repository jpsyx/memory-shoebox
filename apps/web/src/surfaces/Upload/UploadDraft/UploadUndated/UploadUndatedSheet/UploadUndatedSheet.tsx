import { Sheet } from "@/system/Chrome/Sheet";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { UploadDateReview } from "@/upload/getUploadDateReviewFromDetail/getUploadDateReviewFromDetail";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadDateReviewHeader } from "./UploadDateReviewHeader";
import { UploadDateReviewRow } from "./UploadDateReviewRow";
import { useUploadDateReviewBatchForm } from "./useUploadDateReviewBatchForm";
import classes from "./UploadUndatedSheet.module.css";

type Props = {
  rows: readonly UploadDateReview[];
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
};

/** A visible diagnostic queue; guesses never count as approved dates. */
export function UploadUndatedSheet({
  rows,
  snapshot,
  controller,
  previews,
}: Readonly<Props>): ReactNode {
  const form = useUploadDateReviewBatchForm({
    rows,
    controller,
    isDisabled: snapshot.isBusy,
  });
  return (
    <Sheet wide label="Review capture dates" className={classes.reviewSheet}>
      <Stack gap="sm">
        <UploadDateReviewHeader
          count={rows.length}
          form={form}
          isDisabled={snapshot.isBusy}
        />
        <div className={classes.reviewRows}>
          {rows.map((row) => {
            return (
              <UploadDateReviewRow
                key={row.file.fileId}
                {...{ row, snapshot, controller, previews }}
                capturedOn={form.chosenDays[row.file.fileId] ?? row.capturedOn}
                setChosenDay={(capturedOn) => {
                  form.setChosenDay({ fileId: row.file.fileId, capturedOn });
                }}
              />
            );
          })}
        </div>
      </Stack>
    </Sheet>
  );
}
