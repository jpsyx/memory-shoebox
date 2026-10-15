import { useVisibleThumbnail } from "@/media/useVisibleThumbnail";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import { useState, type ReactNode } from "react";
import type { StrayItem } from "../../../MilestoneFix";
import classes from "./MilestoneFixThumbnail.module.css";
type Props = { stray: StrayItem };
/** Replaces failed media without losing its reconciliation row identity. */
export function MilestoneFixThumbnail({ stray }: Readonly<Props>): ReactNode {
  const [failedUrl, setFailedUrl] = useState<string>();
  const thumbnail = useVisibleThumbnail({
    itemId: stray.itemId,
    source: stray.media.thumb,
  });
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
      ref={thumbnail.ref}
      className={classes.milestoneFixThumbnail}
      src={thumbnail.source?.url}
      alt={stray.media.altText}
      loading={thumbnail.loading}
      onError={() => {
        return setFailedUrl(stray.media.thumb?.url);
      }}
    />
  );
}
