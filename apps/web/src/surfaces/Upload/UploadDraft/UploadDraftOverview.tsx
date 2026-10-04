import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
import { Sheet } from "@/system/Chrome/Sheet";
import { Banner } from "@/system/Chrome/Banner";
import { Stat } from "@/system/typography/Stat";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";
/** Whole-batch totals and the selection explanation. */
export function UploadDraftOverview({
  snapshot,
}: Readonly<{ snapshot: UploadSnapshot }>): ReactNode {
  const detail = snapshot.detail!;
  return (
    <Sheet wide label="What is going up">
      <Stack gap="md">
        <div className={classes.uploadFigureRow}>
          <Stat
            figure={detail.fileCount.toLocaleString("en-GB")}
            label="Chosen"
          />
          <Stat figure={detail.days.length} label="Days" />
          <Stat
            figure={`${(detail.totalBytes / 1024 / 1024).toLocaleString("en-GB", { maximumFractionDigits: 1 })} MB`}
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
