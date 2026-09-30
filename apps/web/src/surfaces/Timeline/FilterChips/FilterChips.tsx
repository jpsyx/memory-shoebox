import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { DateChip } from "@/surfaces/Timeline/FilterChips/DateChip";
import { PeopleChips } from "@/surfaces/Timeline/FilterChips/PeopleChips";
import { TagChips } from "@/surfaces/Timeline/FilterChips/TagChips";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
};

/**
 * Every filter as a chip carrying its own way out.
 *
 * Nothing is ever on without being visible, which is the rule this strip
 * exists for.
 */
export function FilterChips({
  selection,
  facets,
  onChange,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <PeopleChips selection={selection} facets={facets} onChange={onChange} />
      <TagChips selection={selection} facets={facets} onChange={onChange} />
      <DateChip selection={selection} onChange={onChange} />
    </>
  );
}
