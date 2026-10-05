import type { ItemDetail } from "@memory-shoebox/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { memberDate } from "@/surfaces/Members/memberCopy";
import classes from "./Presence.module.css";

/** Real item context, retaining the thumbnail's original proportions. */
export function ViewerItemPreview({
  detail,
  timezone,
}: Readonly<{ detail: ItemDetail; timezone: string }>): ReactNode {
  return (
    <div className={classes.preview}>
      <img
        src={detail.media.thumb.url}
        alt={detail.media.altText}
        width={detail.media.thumb.width}
        height={detail.media.thumb.height}
      />
      <div>
        <p>{memberDate({ timestamp: detail.capturedAt, timezone })}</p>
        <Link to="/items/$itemId" params={{ itemId: detail.itemId }}>
          Open this item
        </Link>
      </div>
    </div>
  );
}
