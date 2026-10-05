import { useState, type ReactNode } from "react";
import type { StrayItem } from "../../../MilestoneFix";
import classes from "./MilestoneFixThumbnail.module.css";
type Props = { stray: StrayItem };
/** Replaces failed media without losing its reconciliation row identity. */
export function MilestoneFixThumbnail({ stray }: Readonly<Props>): ReactNode {
  const [failedUrl, setFailedUrl] = useState<string>();
  return failedUrl === stray.media.thumb.url ? (
    <span className={classes.milestoneFixThumbnailUnavailable}>
      Photograph unavailable.
    </span>
  ) : (
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
