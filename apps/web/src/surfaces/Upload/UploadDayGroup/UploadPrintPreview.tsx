import type { UploadPreview } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { IconPhoto, IconVideo } from "@tabler/icons-react";
import { type ReactNode } from "react";
import classes from "../upload.module.css";
type Props = {
  file: Readonly<UploadFileDto>;
  preview: UploadPreview | undefined;
};

/** Displays the available preview or the original’s fallback. */
export function UploadPrintPreview({
  file,
  preview,
}: Readonly<Props>): ReactNode {
  const MediaIcon = file.declaredContentType.startsWith("video/")
    ? IconVideo
    : IconPhoto;
  return (
    <>
      {preview?.kind === "ready" ? (
        <img
          src={preview.url}
          alt={file.originalFilename}
          width={preview.width}
          height={preview.height}
        />
      ) : (
        <span className={classes.fallback}>
          <MediaIcon size="1.5rem" aria-hidden="true" />
          <span>{file.originalFilename}</span>
          <span className={classes.previewCopy}>
            {preview?.kind === "preparing"
              ? "Preparing preview"
              : "Preview unavailable"}
          </span>
        </span>
      )}
    </>
  );
}
