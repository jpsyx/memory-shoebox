import { useState, type ReactNode } from "react";
import type { StrayItem } from "../../MilestoneFix";
import classes from "./MilestoneFixThumbnail.module.css";
/** Replaces failed media without losing its reconciliation row identity. */
export function MilestoneFixThumbnail({
  stray,
}: Readonly<{ stray: StrayItem }>): ReactNode {
  const [failedUrl, setFailedUrl] = useState<string>();
  if (failedUrl === stray.media.thumb.url) {
    return (
      <span className={classes.milestoneFixThumbnailUnavailable}>
        Photograph unavailable.
      </span>
    );
  }
  return (
    <img
      className={classes.milestoneFixThumbnail}
      src={stray.media.thumb.url}
      alt={stray.media.altText}
      loading="lazy"
      onError={() => {
        return setFailedUrl(stray.media.thumb.url);
      }}
    />
  );
}
