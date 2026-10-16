import { getPhotoCandidateFromViewport } from "@/media/getPhotoCandidateFromViewport/getPhotoCandidateFromViewport";
import type { PhotoViewport } from "@/media/photoViewportHelpers";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import classes from "./PhotoThumbnail.module.css";
import type { MediaRef } from "@memory-shoebox/shared";
import { type ReactNode } from "react";

type Props = { media: MediaRef; viewport: PhotoViewport };
/** Shows the available thumbnail or an accessible preview status. */
export function PhotoThumbnail({
  media,
  viewport,
}: Readonly<Props>): ReactNode {
  const thumbnail = getPhotoCandidateFromViewport({
    ...viewport,
    candidates: media.thumb === null ? [] : [media.thumb],
  });
  return thumbnail !== undefined ? (
    <img
      src={thumbnail.url}
      alt={media.altText}
      width={media.width}
      height={media.height}
    />
  ) : (
    <MediaPlaceholder
      className={classes.photoThumbnailPlaceholder}
      altText={media.altText}
      width={media.width}
      height={media.height}
      state={media.previewState}
    />
  );
}
