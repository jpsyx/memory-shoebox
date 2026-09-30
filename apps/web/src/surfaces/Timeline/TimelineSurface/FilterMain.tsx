import type { ReactNode } from "react";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { isSelectionActive } from "@/api/timeline/selection/selection";
import type { ArchiveTotals } from "@/api/timeline/timeline";
import { FilterSheet } from "@/surfaces/Timeline/FilterSheet/FilterSheet";
import { NoResults } from "@/surfaces/Timeline/NoResults/NoResults";
import { WholeArchive } from "@/surfaces/Timeline/TimelineSurface/WholeArchive";
import classes from "@/system/system.module.css";

type Props = {
  isOpen: boolean;
  hasNoResults: boolean;
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  totals: ArchiveTotals;
  onChange: (selection: TimelineSelection) => void;
  onClear: () => void;
};

/**
 * Surface 6's own landmark: the filter sheet, the dead end, or both.
 *
 * `Archive` gives its own `<main>` up when this is on the page, by taking
 * `component="section"`, which `hasOwnMain` decides. Two `<main>` elements on
 * one page is invalid and hands a screen reader two landmarks called "main".
 * The pile is still drawn under this, deliberately: it costs one spine-less
 * grid when it is empty, and removing it would make the page jump as a
 * filter narrows to nothing and back.
 */
export function FilterMain({
  isOpen,
  hasNoResults,
  selection,
  facets,
  totals,
  onChange,
  onClear,
}: Readonly<Props>): ReactNode {
  if (!isOpen && !hasNoResults) {
    return null;
  }
  return (
    <main className={classes.pageWide}>
      {isOpen ? (
        <FilterSheet
          selection={selection}
          facets={facets}
          onChange={onChange}
        />
      ) : null}
      {isOpen && !isSelectionActive(selection) ? (
        <WholeArchive totals={totals} />
      ) : null}
      {hasNoResults ? (
        <NoResults
          selection={selection}
          facets={facets}
          onChange={onChange}
          onClear={onClear}
        />
      ) : null}
    </main>
  );
}
