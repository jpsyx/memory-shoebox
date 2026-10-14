import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { IconPhoto, IconVideo } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useUploadTransferPreview } from "./useUploadTransferPreview";
import classes from "./UploadFileThumbnail.module.css";

type Props = {
  file: UploadFileDto;
  localFile?: File;
  previews?: UploadPreviewQueue;
};

/** An uncropped local thumbnail, or authorized landed media after refresh. */
export function UploadFileThumbnail({
  file,
  localFile,
  previews,
}: Readonly<Props>): ReactNode {
  const { holder, preview } = useUploadTransferPreview({
    file,
    localFile,
    previews,
  });
  const MediaIcon = file.declaredContentType.startsWith("video/")
    ? IconVideo
    : IconPhoto;
  return (
    <div ref={holder} className={classes.thumbnail}>
      {file.media?.thumb ? (
        <img
          src={file.media.thumb.url}
          width={file.media.thumb.width}
          height={file.media.thumb.height}
          alt={file.originalFilename}
          loading="lazy"
        />
      ) : file.media ? (
        <MediaPlaceholder
          altText={file.media.altText}
          width={file.media.width}
          height={file.media.height}
          state={file.media.previewState}
        />
      ) : preview?.kind === "ready" ? (
        <img
          src={preview.url}
          width={preview.width}
          height={preview.height}
          alt={file.originalFilename}
        />
      ) : (
        <span className={classes.fallback}>
          <MediaIcon aria-hidden="true" size={24} />
          {preview?.kind === "unavailable"
            ? "Preview unavailable"
            : localFile
              ? "Preparing preview"
              : "Original unavailable here"}
        </span>
      )}
    </div>
  );
}
