import { uploadSizeLabel } from "../uploadSizeLabel/uploadSizeLabel";
import classes from "@/system/system.module.css";
import { Prose } from "@/system/typography/Prose";
import { Progress } from "@mantine/core";
import type { UploadSessionDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = { detail: UploadSessionDetail };
/** Confirmed batch bytes never borrow per-file wire percentages. */
export function UploadProgress({ detail }: Readonly<Props>): ReactNode {
  const progress = detail.progress;
  return (
    <>
      <div className={classes.uploadFigureRow}>
        <span className={classes.uploadFigure}>{progress.doneCount}</span>
        <span className={classes.fileMeta}>
          of {detail.fileCount}, {uploadSizeLabel(progress.doneBytes)} of{" "}
          {uploadSizeLabel(detail.totalBytes)} confirmed up
        </span>
      </div>
      <Progress
        aria-label="Batch confirmed up"
        value={
          detail.totalBytes > 0
            ? (100 * progress.doneBytes) / detail.totalBytes
            : 0
        }
      />
      <Prose>
        Keep this tab open while they go up. If you close it, what arrived and
        everything you added stay saved. Return to this batch to resume anything
        missing.
      </Prose>
    </>
  );
}
