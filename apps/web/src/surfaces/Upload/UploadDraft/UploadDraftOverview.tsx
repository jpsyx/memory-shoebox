import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import classes from "@/system/system.module.css";
import { Prose } from "@/system/typography/Prose";
import { Stat } from "@/system/typography/Stat";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
type Props = { snapshot: UploadSnapshot };

/** Whole-batch totals and the selection explanation. */
export function UploadDraftOverview({ snapshot }: Readonly<Props>): ReactNode {
  const detail = snapshot.detail!;
  const eligibleBytes = detail.files.reduce((total, file) => {
    return file.state === "refused" || file.state === "cancelled"
      ? total
      : total + file.declaredBytes;
  }, 0);
  return (
    <Sheet wide label="What is going up">
      <Stack gap="md">
        <div className={classes.uploadFigureRow}>
          <Stat
            figure={detail.files.length.toLocaleString("en-GB")}
            label="Chosen"
          />
          <Stat figure={detail.days.length} label="Days" />
          <Stat
            figure={`${(eligibleBytes / 1024 / 1024).toLocaleString("en-GB", { maximumFractionDigits: 1 })} MB`}
            label="To send"
          />
        </div>
        <Banner>
          The batch is grouped by the day each file was captured on, which is
          where each one will land in the archive. Nothing here is one post.
        </Banner>
        <Prose>
          Press a print to tick it. Ticking several gives you the bar at the
          top: one tag, one person or one milestone applied to the lot, instead
          of the same thing done two hundred times.
        </Prose>
      </Stack>
    </Sheet>
  );
}
