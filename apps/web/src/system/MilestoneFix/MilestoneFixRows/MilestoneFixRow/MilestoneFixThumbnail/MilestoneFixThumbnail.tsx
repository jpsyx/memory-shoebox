import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import { useState, type ReactNode } from "react";
import type { StrayItem } from "../../../MilestoneFix";
import classes from "./MilestoneFixThumbnail.module.css";
type Props = { stray: StrayItem };
/** Replaces failed media without losing its reconciliation row identity. */
export function MilestoneFixThumbnail({ stray }: Readonly<Props>): ReactNode {
  const [failedUrl, setFailedUrl] = useState<string>();
  return stray.media.thumb === null || failedUrl === stray.media.thumb.url ? (
    <MediaPlaceholder
      altText={stray.media.altText}
      width={stray.media.width}
      height={stray.media.height}
      state={
        stray.media.thumb === null ? stray.media.previewState : "unavailable"
      }
    />
  ) : (
    <img
      className={classes.milestoneFixThumbnail}
      src={stray.media.thumb.url}
      alt={stray.media.altText}
      loading="lazy"
      onError={() => {
        return setFailedUrl(stray.media.thumb?.url);
      }}
    />
  );
}
