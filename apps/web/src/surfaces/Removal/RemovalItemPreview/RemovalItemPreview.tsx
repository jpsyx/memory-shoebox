import type { ItemSummary } from "@memory-shoebox/shared";
import { useEffect, useState, type ReactNode } from "react";
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
  const url = item.media.thumb.url;
  const [failedUrl, setFailedUrl] = useState<string>();
  useEffect(
    function resetRemovalThumbnailFailure() {
      setFailedUrl(undefined);
    },
    [url],
  );
  return (
    <div className={classes.removalItemPreview}>
      {failedUrl === url ? (
        <Prose onPanel role="status">
          Unavailable
        </Prose>
      ) : (
        <img
          src={url}
          alt={item.media.altText}
          onError={() => {
            setFailedUrl(url);
          }}
        />
      )}
      <Prose onPanel>
        {captureMomentLabel(
          getWallClockFromCapture({ capturedAt: item.capturedAt, timezone }),
        )}{" "}
        · Uploaded by {item.uploadedBy.displayName}
      </Prose>
    </div>
  );
}
