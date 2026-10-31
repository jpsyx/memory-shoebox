import { BurstFanHeader } from "@/system/Pile/BurstFanHeader/BurstFanHeader";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { useContext, type ReactNode } from "react";
import { BurstPhoto } from "../BurstPhoto/BurstPhoto";
import { PileSelectionContext } from "../../PileSelection/PileSelection";
import classes from "./BurstFan.module.css";

type Props = {
  frames: readonly BurstFrameRef[];
  span: string;
  seed: number;
  burstId?: string;
  onCollapse: () => void;
  onOpenFrame?: (itemId: string) => void;
  onRemoveFrame?: (itemId: string) => void;
};

/** Draws a wrapping burst fan without inserting wrappers around its prints. */
export function BurstFan({
  frames,
  span,
  seed,
  burstId,
  onCollapse,
  onOpenFrame,
  onRemoveFrame,
}: Readonly<Props>): ReactNode {
  const selection = useContext(PileSelectionContext);
  const isFullySelected =
    frames.length > 0 &&
    frames.every((frame) => {
      return selection?.selectedItemIds.has(frame.itemId);
    });
  return (
    <div className={classes.burstFan} data-burst-fan>
      <BurstFanHeader
        label={span}
        selectionAction={
          selection?.onSelectBurst && burstId
            ? {
                isFullySelected,
                isDisabled: selection.isBusy,
                onSelect: () => {
                  return selection.onSelectBurst?.(burstId);
                },
              }
            : undefined
        }
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
