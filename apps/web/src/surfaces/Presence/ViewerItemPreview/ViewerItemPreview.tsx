import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { memberDate } from "@/surfaces/Members/memberCopyHelpers";
import classes from "./ViewerItemPreview.module.css";
type Props = { detail: ItemDetail; timezone: string };

/** Real item context, retaining the thumbnail's original proportions. */
export function ViewerItemPreview({
  detail,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.viewerItemPreviewPreview}>
      {detail.media.thumb === null ? (
        <MediaPlaceholder
          className={classes.viewerItemPreviewMedia}
          altText={detail.media.altText}
          width={detail.media.width}
          height={detail.media.height}
          state={detail.media.previewState}
        />
      ) : (
        <img
          src={detail.media.thumb.url}
          alt={detail.media.altText}
          width={detail.media.thumb.width}
          height={detail.media.thumb.height}
        />
      )}
      <div>
        <p>{memberDate({ timestamp: detail.capturedAt, timezone })}</p>
        <Link to="/items/$itemId" params={{ itemId: detail.itemId }}>
          Open this item
        </Link>
      </div>
    </div>
  );
}
