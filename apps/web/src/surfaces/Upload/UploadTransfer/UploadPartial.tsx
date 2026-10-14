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
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import { isMissingUploadOriginal } from "./uploadResumeHelpers";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews?: UploadPreviewQueue;
};
/**
 * Lists every missing or refused original from the complete server manifest.
 */
export function UploadPartial({
  snapshot,
  controller,
  previews,
}: Readonly<Props>): ReactNode {
  const detail = snapshot.detail!;
  return (
    <Sheet wide label="What did not arrive">
      <Stack gap="sm">
        <div className={classes.uploadFigureRow}>
          <Stat figure={detail.progress.doneCount} label="Went up" />
          <Stat
            figure={
              detail.files.filter((file) => {
                return isMissingUploadOriginal(
                  file,
                  snapshot.fileActivityById.get(file.fileId),
                );
              }).length
            }
            label="Did not arrive"
          />
          <Stat figure={detail.progress.refusedCount} label="Refused" />
        </div>
        <Prose>
          The files that arrived are saved. Missing or excluded files are listed
          below.
        </Prose>
        <UploadMissingFiles
          snapshot={snapshot}
          controller={controller}
          previews={previews}
        />
      </Stack>
    </Sheet>
  );
}
