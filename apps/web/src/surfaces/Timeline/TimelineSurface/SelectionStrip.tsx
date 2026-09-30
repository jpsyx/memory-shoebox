import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { FilterChips } from "@/surfaces/Timeline/FilterChips/FilterChips";
import { FilterStrip } from "@/system/FilterStrip/FilterStrip";

type Props = {
  selection: TimelineSelection;
  count: number;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
  onClear: () => void;
};

/**
 * What the pile is filtered to, and the way out of each piece of it.
 *
 * `onClear` is the strip's own "show everything" button; `onChange` is what
 * one chip's own remove button calls, which is a narrower edit than clearing
 * everything.
 */
export function SelectionStrip({
  selection,
  count,
  facets,
  onChange,
  onClear,
}: Readonly<Props>): ReactNode {
  return (
    <FilterStrip count={count} onClear={onClear}>
      <FilterChips selection={selection} facets={facets} onChange={onChange} />
    </FilterStrip>
  );
}
