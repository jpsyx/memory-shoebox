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
 * composed or the override somebody typed. It is never null
 * (`items.md` transformation 2), so there is nothing to fall back to here.
 */
export function PhotoFrame({ media, itemId }: Readonly<Props>): ReactNode {
  const photoRef = usePhotoArrival<HTMLDivElement>(itemId, media.display.url);
  return (
    <div
      ref={photoRef}
      className={classes.frame}
      data-photo-surface="viewer"
      data-photo-item={itemId}
    >
      <img
        src={media.display.url}
        alt={media.altText}
        width={media.display.width}
        height={media.display.height}
      />
    </div>
  );
}
