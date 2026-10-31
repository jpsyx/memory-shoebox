import { Checkbox, Tooltip } from "@mantine/core";
import { useContext, type ReactNode } from "react";
import { PileSelectionContext } from "../../PileSelection/PileSelection";
import classes from "./BurstCover.module.css";

type Props = { burstId: string };

/** Whole-burst selection stays separate from the cover's expansion button. */
export function BurstSelectionCheckbox({
  burstId,
}: Readonly<Props>): ReactNode {
  const selection = useContext(PileSelectionContext);
  if (!selection?.onSelectBurst) {
    return null;
  }
  const frames = selection.framesByBurstId.get(burstId);
  const selectedCount =
    frames?.filter((frame) => {
      return selection.selectedItemIds.has(frame.itemId);
    }).length ?? 0;
  const isChecked =
    frames !== undefined &&
    frames.length > 0 &&
    selectedCount === frames.length;
  const label = isChecked ? "Deselect full burst" : "Select full burst";
  return (
    <Tooltip label={label}>
      <Checkbox
        className={classes.burstSelection}
        aria-label={label}
        data-selected={selectedCount > 0 || undefined}
        checked={isChecked}
        indeterminate={selectedCount > 0 && !isChecked}
        disabled={selection.isBusy}
        onChange={() => {
          if (isChecked) {
            selection.onDeselectBurst?.(burstId);
          } else {
            selection.onSelectBurst?.(burstId);
          }
        }}
      />
    </Tooltip>
  );
}
