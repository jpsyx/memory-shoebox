import { Sheet } from "@/system/Chrome/Sheet";
import classes from "@/system/system.module.css";
import { Prose } from "@/system/typography/Prose";
import { Stat } from "@/system/typography/Stat";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Stack } from "@mantine/core";
import type { UploadFileDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = { snapshot: UploadSnapshot };

function _getDraftFiguresFromFiles(files: readonly UploadFileDto[]): {
  photoCount: number;
  videoCount: number;
  eligibleBytes: number;
} {
  return files.reduce(
    (figures, file) => {
      return {
        photoCount:
          figures.photoCount +
          (file.declaredContentType.startsWith("image/") ? 1 : 0),
        videoCount:
          figures.videoCount +
          (file.declaredContentType.startsWith("video/") ? 1 : 0),
        eligibleBytes:
          file.state === "refused" || file.state === "cancelled"
            ? figures.eligibleBytes
            : figures.eligibleBytes + file.declaredBytes,
      };
    },
    { photoCount: 0, videoCount: 0, eligibleBytes: 0 },
  );
}

/** Whole-manifest media counts, eligible bytes and the selection explanation. */
export function UploadDraftOverview({ snapshot }: Readonly<Props>): ReactNode {
  const { photoCount, videoCount, eligibleBytes } = _getDraftFiguresFromFiles(
    snapshot.detail!.files,
  );
  return (
    <Sheet wide label="What is going up">
      <Stack gap="md">
        <div className={classes.uploadFigureRow}>
          {photoCount > 0 ? (
            <Stat
              figure={photoCount.toLocaleString("en-GB")}
              label={photoCount === 1 ? "Photo" : "Photos"}
            />
          ) : null}
          {videoCount > 0 ? (
            <Stat
              figure={videoCount.toLocaleString("en-GB")}
              label={videoCount === 1 ? "Video" : "Videos"}
            />
          ) : null}
          <Stat
            figure={`${(eligibleBytes / 1024 / 1024).toLocaleString("en-GB", { maximumFractionDigits: 1 })} MB`}
            label="To upload"
          />
        </div>
        <Prose>Tick files to add tags, people or a milestone to them.</Prose>
      </Stack>
    </Sheet>
  );
}
