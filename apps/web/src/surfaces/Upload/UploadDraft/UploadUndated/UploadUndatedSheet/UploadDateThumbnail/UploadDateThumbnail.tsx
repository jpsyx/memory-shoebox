import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types.ts";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { IconPhoto } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useUploadDateThumbnail } from "../useUploadDateThumbnail";
import classes from "./UploadDateThumbnail.module.css";

type Props = {
  file: UploadFileDto;
  localFile?: File;
  previews: UploadPreviewQueue;
};

/**
 * Bounded local previews with independent ownership from the day-group prints.
 */
export function UploadDateThumbnail({
  file,
  localFile,
  previews,
}: Readonly<Props>): ReactNode {
  const { holder, preview } = useUploadDateThumbnail({
    file,
    localFile,
    previews,
  });
  return (
    <figure
      ref={holder}
      className={classes.thumbnail}
      aria-label={`Photo ${file.position}`}
    >
      {preview?.kind === "ready" ? (
        <img
          src={preview.url}
          width={preview.width}
          height={preview.height}
          alt={`Photo ${file.position} to date`}
        />
      ) : (
        <span className={classes.previewFallback}>
          <IconPhoto aria-hidden="true" size={28} />
          {preview?.kind === "unavailable"
            ? "Preview unavailable"
            : localFile
              ? "Preparing preview"
              : "Choose the files again to preview"}
        </span>
      )}
    </figure>
  );
}
