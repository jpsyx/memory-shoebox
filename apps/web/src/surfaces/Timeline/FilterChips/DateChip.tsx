import type { ReactNode } from "react";
import type {
  TimelineSelection,
  TimelineSelectionUpdate,
} from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import { Chip } from "@/system/Chip/Chip";
import { dateRangeLabel, dayLabel } from "@/system/labelHelpers/labelHelpers";

type Props = {
  selection: TimelineSelection;
  onChange: (update: TimelineSelectionUpdate) => void;
};

/**
 * The dates as one chip rather than two.
 *
 * "1 Sep to 30 Sep" is one decision somebody made, and taking half of it off
 * is not something anybody means.
 */
export function DateChip({ selection, onChange }: Readonly<Props>): ReactNode {
  return selection.from === undefined &&
    selection.until === undefined ? null : (
    <Chip
      onPanel
      removeLabel="Clear the dates"
      onRemove={() => {
        onChange((current) => {
          return { ...current, from: undefined, until: undefined };
        });
      }}
    >
      {selection.from === undefined
        ? `Until ${dayLabel(selection.until ?? "")}`
        : selection.until === undefined
          ? `From ${dayLabel(selection.from)}`
          : dateRangeLabel({ from: selection.from, until: selection.until })}
    </Chip>
  );
}
