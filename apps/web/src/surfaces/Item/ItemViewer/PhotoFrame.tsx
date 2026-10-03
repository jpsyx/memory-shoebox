import type { ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import classes from "@/system/system.module.css";

type Props = {
  media: MediaRef;
};

/**
 * A photograph full frame, never cropped, with the alt text the server
 * composed or the override somebody typed. It is never null
 * (`items.md` transformation 2), so there is nothing to fall back to here.
 */
export function PhotoFrame({ media }: Readonly<Props>): ReactNode {
  return (
    <div className={classes.frame}>
      <img
        src={media.display.url}
        alt={media.altText}
        width={media.display.width}
        height={media.display.height}
      />
    </div>
  );
}
