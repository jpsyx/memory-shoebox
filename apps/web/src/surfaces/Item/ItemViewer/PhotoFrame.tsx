import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import { usePhotoArrival } from "@/system/motion/usePhotoArrival";
import type { ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import classes from "@/system/system.module.css";

type Props = {
  media: MediaRef;
  itemId: string;
};

/**
 * A photograph full frame, never cropped, with the alt text the server
 * composed or the override somebody typed. Missing display pixels retain the
 * catalog aspect ratio and the same accessible description.
 */
export function PhotoFrame({ media, itemId }: Readonly<Props>): ReactNode {
  const photoRef = usePhotoArrival<HTMLDivElement>(
    itemId,
    media.display?.url ?? "",
  );
  return (
    <div
      ref={photoRef}
      className={classes.frame}
      data-photo-surface="viewer"
      data-photo-item={itemId}
    >
      {media.display === null ? (
        <MediaPlaceholder
          altText={media.altText}
          width={media.width}
          height={media.height}
          state={media.previewState}
        />
      ) : (
        <img
          src={media.display.url}
          alt={media.altText}
          width={media.display.width}
          height={media.display.height}
        />
      )}
    </div>
  );
}
