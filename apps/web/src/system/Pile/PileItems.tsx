import type { ReactNode } from "react";
import type { BurstSummary, ItemSummary } from "@memory-shoebox/shared";
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

/** One plain print, latched by its own item id. */
function _plainPrint(options: {
  item: ItemSummary;
  seed: number;
  eager: boolean;
  onOpenItem?: (itemId: string) => void;
}): ReactNode {
  const { item, seed, eager, onOpenItem } = options;
  return (
    <Print
      key={item.itemId}
      media={item.media}
      seed={seed}
      unseen={item.isUnseen}
      itemId={item.itemId}
      restrictedLabel={
        item.visibility.mode === "everyone"
          ? undefined
          : visibilityLabel(item.visibility)
      }
      eager={eager}
      onClick={() => {
        return onOpenItem?.(item.itemId);
      }}
    />
  );
}

/** One burst, collapsed to its stack and latched by its burst id. */
function _burstStackItem(options: {
  item: ItemSummary;
  burst: BurstSummary;
  seed: number;
  framesByBurstId?: ReadonlyMap<string, readonly ItemSummary[]>;
  onOpenBurst?: (burstId: string) => void;
}): ReactNode {
  const { item, burst, seed, framesByBurstId, onOpenBurst } = options;
  return (
    <BurstStack
      key={item.itemId}
      cover={item}
      frames={framesByBurstId?.get(burst.burstId)}
      frameCount={burst.visibleFrameCount}
      span={`${burst.visibleFrameCount} frames`}
      seed={seed}
      burstId={burst.burstId}
      hasUnseenFrames={burst.hasUnseenFrames}
      onOpen={() => {
        return onOpenBurst?.(burst.burstId);
      }}
    />
  );
}

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
        // Bound before the branch so the helpers below keep the narrowing.
        const burst = item.burst;
        const seed = seedBase + index;
        return burst === null
          ? _plainPrint({ item, seed, eager: index < 4, onOpenItem })
          : _burstStackItem({
              item,
              burst,
              seed,
              framesByBurstId,
              onOpenBurst,
            });
      })}
    </>
  );
}
