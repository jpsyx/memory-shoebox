import type { ItemSummary } from "@memory-shoebox/shared";
import type { ReactNode, RefObject } from "react";
import classes from "./MilestonePickerUnavailable.module.css";
type Props = {
  item: ItemSummary;
  isAttached: boolean;
  ownedFocus: RefObject<boolean>;
  onToggle: () => void;
};
/** Keeps an unreadable photograph selectable and restores its owned focus. */
export function MilestonePickerUnavailable({
  item,
  isAttached,
  ownedFocus,
  onToggle,
}: Readonly<Props>): ReactNode {
  return (
    <button
      type="button"
      ref={(element) => {
        if (element && ownedFocus.current) {
          ownedFocus.current = false;
          element.focus();
        }
      }}
      className={classes.milestonePickerUnavailable}
      aria-label={`Unavailable photograph: ${item.media.altText}`}
      aria-pressed={isAttached}
      onClick={onToggle}
    >
      Photograph unavailable.
    </button>
  );
}
