import type { ItemSummary } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import {
  captureMomentLabel,
  getWallClockFromCapture,
} from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
import classes from "./RemovalItemPreview.module.css";
type Props = { item: ItemSummary; timezone: string };

/**
 * The history endpoint supplies a preview without counting another photograph
 * open.
 */
export function RemovalItemPreview({
  item,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.removalItemPreview}>
      <img src={item.media.thumb.url} alt={item.media.altText} />
      <Prose onPanel>
        {captureMomentLabel(
          getWallClockFromCapture({ capturedAt: item.capturedAt, timezone }),
        )}{" "}
        · Uploaded by {item.uploadedBy.displayName}
      </Prose>
    </div>
  );
}
