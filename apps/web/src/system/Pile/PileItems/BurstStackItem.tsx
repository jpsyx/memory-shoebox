import type { ReactNode } from "react";
import type {
  BurstFrameRef,
  BurstSummary,
  ItemSummary,
} from "@memory-shoebox/shared";
import { BurstStack } from "@/system/Pile/BurstStack/BurstStack";

type Props = {
  item: ItemSummary;
  burst: BurstSummary;
  seed: number;
  /** Frames for a burst that has been opened, keyed by burst id. */
  framesByBurstId?: ReadonlyMap<string, readonly BurstFrameRef[]>;
  onOpenBurst?: (burstId: string) => void;
  onOpenItem?: (itemId: string) => void;
};

/** One burst, collapsed to its stack and latched by its burst id. */
export function BurstStackItem({
  item,
  burst,
  seed,
  framesByBurstId,
  onOpenBurst,
  onOpenItem,
}: Readonly<Props>): ReactNode {
  return (
    <BurstStack
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
      onOpenFrame={onOpenItem}
    />
  );
}
