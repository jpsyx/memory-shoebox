import { BurstFanHeader } from "@/system/Pile/BurstFanHeader/BurstFanHeader";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { BurstPhoto } from "../BurstPhoto/BurstPhoto";
import classes from "./BurstFan.module.css";

type Props = {
  frames: readonly BurstFrameRef[];
  span: string;
  seed: number;
  isPinned: boolean;
  onCollapse: () => void;
  onOpenFrame?: (itemId: string) => void;
  onRemoveFrame?: (itemId: string) => void;
};

/** Draws a wrapping burst fan without inserting wrappers around its prints. */
export function BurstFan({
  frames,
  span,
  seed,
  isPinned,
  onCollapse,
  onOpenFrame,
  onRemoveFrame,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.burstFan} data-burst-fan>
      <BurstFanHeader
        label={span}
        isDisabled={isPinned}
        onCollapse={onCollapse}
      />
      {frames.map((frame, index) => {
        return (
          <BurstPhoto
            key={frame.itemId}
            frame={frame}
            seed={seed + index + 1}
            onOpen={onOpenFrame}
            onRemove={onRemoveFrame}
          />
        );
      })}
    </div>
  );
}
