import { Print } from "@/system/Pile/Print/Print";
import type { ItemSummary } from "@memory-shoebox/shared";
import type { MouseEvent, ReactNode } from "react";
import { BurstSelectionCheckbox } from "./BurstSelectionCheckbox";
import classes from "./BurstCover.module.css";

type Props = {
  cover: ItemSummary;
  seed: number;
  frameCount: number;
  hasUnseenFrames?: boolean;
  burstId?: string;
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
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
  burstId,
}: Readonly<Props>): ReactNode {
  return (
    <Print
      media={cover.media}
      seed={seed}
      itemId={undefined}
      mediaItemId={cover.itemId}
      unseen={hasUnseenFrames}
      onClick={onOpen}
      overlays={
        burstId ? <BurstSelectionCheckbox burstId={burstId} /> : undefined
      }
    >
      <span className={classes.burstCoverCount}>
        {frameCount} <small>photos</small>
      </span>
    </Print>
  );
}
