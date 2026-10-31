import { useMediaIntent } from "@/media/useMediaIntent/useMediaIntent";
import { stagePhotoTransition } from "@/system/motion/photoTransition/photoTransition";
import { PileSelectionContext } from "@/system/Pile/PileSelection/PileSelection";
import { useContext, type MouseEventHandler } from "react";
import type { Props } from "./Print.types";

type Interaction = {
  intent: ReturnType<typeof useMediaIntent>;
  isSelectable: boolean;
  isSelected: boolean | undefined;
  isDisabled: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
};

/** Selection owns a print's click while browsing stages photo navigation. */
export function usePrintInteraction({
  itemId,
  selected,
  onClick,
  durationMs,
}: Readonly<
  Pick<Props, "itemId" | "selected" | "onClick"> & {
    durationMs: number | undefined;
  }
>): Interaction {
  const selection = useContext(PileSelectionContext);
  const intent = useMediaIntent(itemId ?? "", selection === undefined);
  const isSelectable = selection !== undefined && itemId !== undefined;
  const isSelected = isSelectable
    ? selection.selectedItemIds.has(itemId)
    : selected;
  return {
    intent,
    isSelectable,
    isSelected,
    isDisabled: isSelectable && selection.isBusy,
    onClick: isSelectable
      ? (event) => {
          if (selection.onSelect) {
            selection.onSelect(
              { kind: "item", itemId },
              { shiftKey: event.shiftKey },
            );
          } else {
            selection.onToggle(itemId);
          }
        }
      : (event) => {
          if (itemId && onClick && durationMs === undefined) {
            stagePhotoTransition(
              event.currentTarget.closest<HTMLElement>(
                "[data-photo-surface]",
              ) ?? event.currentTarget,
              itemId,
            );
          }
          onClick?.(event);
        },
  };
}
