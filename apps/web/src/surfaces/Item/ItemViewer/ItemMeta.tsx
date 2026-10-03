import { IconLock } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ICON_PROPS } from "@/system/icons";
import {
  captureMomentLabel,
  framePositionLabel,
  getWallClockFromCapture,
  runtimeLabel,
  visibilityLabel,
} from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  detail: ItemDetail;
  timezone: string;
};

/**
 * The line under the frame: when, which frame of the run or how long, who
 * put it up, and, for whoever may change it, who can see it.
 *
 * "Frame 7 of 45" reads `burstPosition` against `burst.visibleFrameCount`,
 * both counted over the visible siblings on the server, never against the
 * strip, which is capped.
 */
export function ItemMeta({ detail, timezone }: Readonly<Props>): ReactNode {
  const wallClock = getWallClockFromCapture({
    capturedAt: detail.capturedAt,
    offsetMinutes: detail.capturedAtOffsetMinutes ?? undefined,
    timezone,
  });
  return (
    <p className={classes.viewerMeta}>
      <span>{captureMomentLabel(wallClock)}</span>
      {detail.burst === null || detail.burstPosition === null ? null : (
        <span>
          {framePositionLabel({
            position: detail.burstPosition,
            frameCount: detail.burst.visibleFrameCount,
          })}
        </span>
      )}
      {detail.kind === "video" && detail.media.durationMs !== null ? (
        <span>{runtimeLabel(detail.media.durationMs)}</span>
      ) : null}
      <span>{`Uploaded by ${detail.uploadedBy.displayName}`}</span>
      {detail.capabilities.canSetVisibility ? (
        <span>
          <IconLock {...ICON_PROPS} aria-hidden="true" />
          {visibilityLabel(detail.visibility)}
        </span>
      ) : null}
    </p>
  );
}
