import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { Explanation } from "@/surfaces/Timeline/NoResults/Explanation";
import { WaysOut } from "@/surfaces/Timeline/NoResults/WaysOut";
import { Ghosts } from "@/system/Pile/Ghosts";
import { Lede } from "@/system/typography/Lede";

type Props = {
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
  /** Clearing the lot, which keeps the jump the same way the strip does. */
  onClear: () => void;
};

/**
 * Surface 6's `none` state.
 *
 * It says which filter is doing the excluding and offers to drop it. A bare
 * no-results page leaves people stuck, and the pile is still drawn under this
 * (empty), because removing it would make the page jump as a filter narrows
 * to nothing and back.
 */
export function NoResults({
  selection,
  facets,
  onChange,
  onClear,
}: Readonly<Props>): ReactNode {
  const chosenPeople = (facets?.people ?? []).filter((facet) => {
    return facet.isSelected;
  });
  const chosenTags = (facets?.tags ?? []).filter((facet) => {
    return facet.isSelected;
  });
  const hasDates =
    selection.from !== undefined || selection.until !== undefined;

  return (
    <Stack gap="md">
      <Lede>Nothing matches all of them.</Lede>
      <Explanation
        people={chosenPeople}
        tags={chosenTags}
        hasDates={hasDates}
      />
      <WaysOut
        people={chosenPeople}
        tags={chosenTags}
        hasDates={hasDates}
        selection={selection}
        onChange={onChange}
        onClear={onClear}
      />
      <Ghosts />
    </Stack>
  );
}
