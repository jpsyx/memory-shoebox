import type { ReactNode } from "react";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { Chip } from "@/system/Chip/Chip";
import { dateRangeLabel, dayLabel } from "@/system/labelHelpers/labelHelpers";

type Props = {
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
};

/** What one date chip reads, whether one end is set or both. */
function _dateChipLabel(selection: Readonly<TimelineSelection>): string {
  return selection.from === undefined
    ? `Until ${dayLabel(selection.until ?? "")}`
    : selection.until === undefined
      ? `From ${dayLabel(selection.from)}`
      : dateRangeLabel({ from: selection.from, until: selection.until });
}

/**
 * The dates as one chip rather than two.
 *
 * "1 Sep to 30 Sep" is one decision somebody made, and taking half of it off
 * is not something anybody means.
 */
export function DateChip({ selection, onChange }: Readonly<Props>): ReactNode {
  if (selection.from === undefined && selection.until === undefined) {
    return null;
  }
  return (
    <Chip
      onPanel
      removeLabel="Clear the dates"
      onRemove={() => {
        onChange({ ...selection, from: undefined, until: undefined });
      }}
    >
      {_dateChipLabel(selection)}
    </Chip>
  );
}
