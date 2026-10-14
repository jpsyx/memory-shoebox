import { Print } from "@/system/Pile/Print";
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
export function UploadFileThumbnail(props: Readonly<Props>): ReactNode {
  const { file, localFile } = props;
  const { holder, preview } = useUploadTransferPreview(props);
  const MediaIcon = file.declaredContentType.startsWith("video/")
    ? IconVideo
    : IconPhoto;
  return (
    <div ref={holder} className={classes.thumbnail}>
      {file.media ? (
        <Print
          media={{ ...file.media, altText: file.originalFilename }}
          seed={file.position}
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
