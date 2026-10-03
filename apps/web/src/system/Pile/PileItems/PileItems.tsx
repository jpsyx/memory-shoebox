import type { ReactNode } from "react";
import type { BurstFrameRef, ItemSummary } from "@memory-shoebox/shared";
import { BurstStackItem } from "@/system/Pile/PileItems/BurstStackItem";
import { PlainPrint } from "@/system/Pile/PileItems/PlainPrint";

type Props = {
  items: readonly ItemSummary[];
  seedBase?: number;
  /** Frames for a burst that has been opened, keyed by burst id. */
  framesByBurstId?: ReadonlyMap<string, readonly BurstFrameRef[]>;
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
        // Bound before the branch so the components below keep the narrowing.
        const burst = item.burst;
        const seed = seedBase + index;
        return burst === null ? (
          <PlainPrint
            key={item.itemId}
            item={item}
            seed={seed}
            eager={index < 4}
            onOpenItem={onOpenItem}
          />
        ) : (
          <BurstStackItem
            key={item.itemId}
            item={item}
            burst={burst}
            seed={seed}
            framesByBurstId={framesByBurstId}
            onOpenBurst={onOpenBurst}
            onOpenItem={onOpenItem}
          />
        );
      })}
    </>
  );
}
