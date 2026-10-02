import type { ReactNode } from "react";
import type { TimelineSearch } from "@/api/timeline/selection/selection";
import { getArchiveTotalsFromRail } from "@/api/timeline/timeline";
import { ArchiveBody } from "@/surfaces/Timeline/TimelineSurface/ArchiveBody";
import { FilterMain } from "@/surfaces/Timeline/TimelineSurface/FilterMain";
import { SelectionStrip } from "@/surfaces/Timeline/TimelineSurface/SelectionStrip";
import type { TimelineData } from "@/surfaces/Timeline/TimelineSurface/useTimelineData";
import { Archive } from "@/system/Pile/Archive";

type Props = {
  data: TimelineData;
  search: TimelineSearch;
};

/**
 * The populated pile: the strip, the filter's own landmark, and the archive.
 *
 * `Archive` is the page's own landmark and renders `<main>` by default. When
 * the filter sheet or the dead end is on the page, that `<main>` is theirs
 * and the pile becomes a plain section under it: two `<main>` elements on one
 * page is invalid and gives a screen reader two "main" landmarks to choose
 * between.
 *
 * Split out of `TimelineSurface` so that function stays a plain dispatch
 * between the empty states and this one.
 */
export function TimelinePile({ data, search }: Readonly<Props>): ReactNode {
  return (
    <>
      {data.isFiltered ? (
        <SelectionStrip
          selection={data.selection}
          count={data.filterCount}
          facets={data.facets}
          onChange={data.onSelectionChange}
          onClear={data.onClearFilters}
        />
      ) : null}
      <FilterMain
        isOpen={search.find === true}
        hasNoResults={data.hasNoResults}
        selection={data.selection}
        facets={data.facets}
        totals={getArchiveTotalsFromRail(data.railDays)}
        onChange={data.onSelectionChange}
        onClear={data.onClearFilters}
      />
      <Archive
        component={data.hasOwnMain ? "section" : "main"}
        ref={data.archiveRef}
      >
        <ArchiveBody
          days={data.days}
          railDays={data.railDays}
          countLabel={data.countLabel}
          framesByBurstId={data.framesByBurstId}
          hasMore={data.hasMore}
          onOpenBurst={data.onOpenBurst}
          onOpenItem={data.onOpenItem}
          onReachEnd={data.onReachEnd}
          onRestart={data.onRestart}
        />
      </Archive>
    </>
  );
}
