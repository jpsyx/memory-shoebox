import { Sheet } from "@/system/Chrome/Sheet";
import classes from "@/system/system.module.css";
import { Prose } from "@/system/typography/Prose";
import { Stat } from "@/system/typography/Stat";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadMissingFiles } from "./UploadMissingFiles";
type Props = { snapshot: UploadSnapshot; controller: UploadSessionController };
/**
 * Lists every missing or refused original from the complete server manifest.
 */
export function UploadPartial({
  snapshot,
  controller,
}: Readonly<Props>): ReactNode {
  const detail = snapshot.detail!;
  return (
    <Sheet wide label="What did not arrive">
      <Stack gap="sm">
        <div className={classes.uploadFigureRow}>
          <Stat figure={detail.progress.doneCount} label="Went up" />
          <Stat figure={detail.progress.failedCount} label="Did not arrive" />
          <Stat figure={detail.progress.refusedCount} label="Refused" />
        </div>
        <Prose>
          The files that arrived are saved on their days. These are the whole of
          what is missing or was left out.
        </Prose>
        <UploadMissingFiles snapshot={snapshot} controller={controller} />
      </Stack>
    </Sheet>
  );
}
