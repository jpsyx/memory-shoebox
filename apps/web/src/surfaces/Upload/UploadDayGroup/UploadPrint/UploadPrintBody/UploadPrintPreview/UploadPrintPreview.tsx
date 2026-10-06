import type { UploadPreview } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { IconPhoto, IconVideo } from "@tabler/icons-react";
import { type ReactNode } from "react";
import classes from "./UploadPrintPreview.module.css";
type Props = {
  file: Readonly<UploadFileDto>;
  preview: UploadPreview | undefined;
  hasLocalFile: boolean;
};

/** Displays the available preview or the original’s fallback. */
export function UploadPrintPreview({
  file,
  preview,
  hasLocalFile,
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
        <span className={classes.uploadPrintPreviewFallback}>
          <MediaIcon size="1.5rem" aria-hidden="true" />
          <span>{file.originalFilename}</span>
          <span className={classes.uploadPrintPreviewPreviewCopy}>
            {preview?.kind === "unavailable"
              ? "Preview unavailable"
              : hasLocalFile
                ? "Preparing preview"
                : "Choose the files again to preview"}
          </span>
        </span>
      )}
    </>
  );
}
