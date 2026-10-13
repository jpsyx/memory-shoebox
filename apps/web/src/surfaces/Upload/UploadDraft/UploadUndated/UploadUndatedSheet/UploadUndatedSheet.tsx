import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { UploadDateReview } from "@/upload/getUploadDateReviewFromDetail/getUploadDateReviewFromDetail";
import { Stack } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { UploadDateReviewRow } from "./UploadDateReviewRow";
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
  return (
    <Sheet wide label="Review capture dates" className={classes.reviewSheet}>
      <Stack gap="sm">
        <LabelText component="h2" className={classes.reviewHeading}>
          <IconAlertTriangle size={24} aria-hidden="true" />
          {rows.length} {rows.length === 1 ? "date needs" : "dates need"}{" "}
          confirmation
        </LabelText>
        <Prose>
          These files have no reliable capture date. Check each suggested day or
          change it, then confirm to continue.
        </Prose>
        <div className={classes.reviewRows}>
          {rows.map((row) => {
            return (
              <UploadDateReviewRow
                key={row.file.fileId}
                {...{ row, snapshot, controller, previews }}
              />
            );
          })}
        </div>
      </Stack>
    </Sheet>
  );
}
