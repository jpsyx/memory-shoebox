import { Print } from "@/system/Pile/Print/Print";
import type { ItemSummary } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import classes from "./BurstCover.module.css";

type Props = {
  cover: ItemSummary;
  seed: number;
  frameCount: number;
  hasUnseenFrames?: boolean;
  onOpen: () => void;
};

/**
 * Keeps the cover button directly inside its stack and counts visible frames.
 */
export function BurstCover({
  cover,
  seed,
  frameCount,
  hasUnseenFrames,
  onOpen,
}: Readonly<Props>): ReactNode {
  return (
    <Print
      media={cover.media}
      seed={seed}
      itemId={undefined}
      mediaItemId={cover.itemId}
      unseen={hasUnseenFrames}
      onClick={onOpen}
    >
      <span className={classes.burstCoverCount}>
        {frameCount} <small>photos</small>
      </span>
    </Print>
  );
}
