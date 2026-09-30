import type { ReactNode } from "react";
import type { ItemSummary } from "@memory-shoebox/shared";
import { visibilityLabel } from "@/system/labelHelpers/labelHelpers";
import { BurstStack } from "@/system/Pile/BurstStack";
import { Print } from "@/system/Pile/Print";

type Props = {
  items: readonly ItemSummary[];
  seedBase?: number;
  /** Frames for a burst that has been opened, keyed by burst id. */
  framesByBurstId?: ReadonlyMap<string, readonly ItemSummary[]>;
  onOpenBurst?: (burstId: string) => void;
  onOpenItem?: (itemId: string) => void;
};

/** Renders one day's items, collapsing any burst into a single stack. */
export function PileItems({
  items,
  seedBase = 0,
  framesByBurstId,
  onOpenBurst,
  onOpenItem,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {items.map((item, index) => {
        // Bound before the branch so the callback below keeps the narrowing.
        const burst = item.burst;
        return burst === null ? (
          <Print
            key={item.itemId}
            media={item.media}
            seed={seedBase + index}
            unseen={item.isUnseen}
            itemId={item.itemId}
            restrictedLabel={
              item.visibility.mode === "everyone"
                ? undefined
                : visibilityLabel(item.visibility)
            }
            eager={index < 4}
            onClick={() => {
              return onOpenItem?.(item.itemId);
            }}
          />
        ) : (
          <BurstStack
            key={item.itemId}
            cover={item}
            frames={framesByBurstId?.get(burst.burstId)}
            frameCount={burst.visibleFrameCount}
            span={`${burst.visibleFrameCount} frames`}
            seed={seedBase + index}
            burstId={burst.burstId}
            hasUnseenFrames={burst.hasUnseenFrames}
            onOpen={() => {
              return onOpenBurst?.(burst.burstId);
            }}
          />
        );
      })}
    </>
  );
}
