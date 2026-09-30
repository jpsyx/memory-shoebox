import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import type {
  FilterFacetsResponse,
  ItemSummary,
  MemberRole,
  RailDay,
  TimelineDay,
  TimelineResponse,
} from "@memory-shoebox/shared";
import { meQueryOptions } from "@/api/me/me";
import {
  getViewFromSearch,
  isSelectionActive,
  makeSearchFromSelection,
  type TimelineSearch,
  type TimelineSelection,
} from "@/api/timeline/selection";
import {
  getArchiveTotalsFromRail,
  timelineInfiniteQueryOptions,
  timelineRailQueryOptions,
} from "@/api/timeline/timeline";
import { filterFacetsQueryOptions } from "@/api/vocabularies/vocabularies";
import { ArchiveEnd } from "@/surfaces/Timeline/ArchiveEnd";
import { DayStream } from "@/surfaces/Timeline/DayStream";
import { EmptyArchive } from "@/surfaces/Timeline/EmptyArchive";
import { FilterChips } from "@/surfaces/Timeline/FilterChips";
import { FilterSheet } from "@/surfaces/Timeline/FilterSheet";
import { JumpRail } from "@/surfaces/Timeline/JumpRail";
import { NoResults } from "@/surfaces/Timeline/NoResults";
import { spineCountLabel } from "@/surfaces/Timeline/pileCopy/pileCopy";
import { FilterStrip } from "@/system/FilterStrip/FilterStrip";
import { Archive } from "@/system/Pile/Archive";
import classes from "@/system/system.module.css";

type Props = {
  search: TimelineSearch;
};

/** The selection the strip's "Clear, show everything" button sets. */
const EMPTY_SELECTION: TimelineSelection = {
  tags: [],
  people: [],
  from: undefined,
  until: undefined,
};

/**
 * A `TimelineSearch` in the shape `navigate`'s own `search` prop wants.
 *
 * `TimelineSearch` declares `tag` and `person` as `readonly string[]`, which
 * is right for a value this surface never mutates, but the route's search
 * type comes from its Zod schema's pre-transform input, which is a plain
 * array: a `readonly` array is never assignable to a mutable one, even one
 * nothing here goes on to change.
 */
function _toRouteSearch(search: Readonly<TimelineSearch>) {
  return {
    ...search,
    tag: search.tag === undefined ? undefined : [...search.tag],
    person: search.person === undefined ? undefined : [...search.person],
  };
}

/**
 * The two ways this surface edits the URL: a new selection, or a jump.
 *
 * Built here, from `navigate` as `useTimelineData` calls it directly, rather
 * than reading `navigate` back out of a stored `TimelineData` field: the
 * closures are the boundary, and everything past them deals in plain
 * callbacks.
 */
function _makeTimelineHandlers(options: {
  navigate: ReturnType<typeof useNavigate>;
  search: TimelineSearch;
}): {
  onSelectionChange: (next: TimelineSelection) => void;
  onRestart: (at: string) => void;
} {
  const { navigate, search } = options;
  return {
    // The jump is dropped whenever the selection changes: `at` is where the
    // old stream was standing, and it means nothing in a new one.
    onSelectionChange: (next) => {
      void navigate({
        to: "/",
        search: _toRouteSearch({
          ...makeSearchFromSelection(next),
          ...(search.find === true ? { find: true } : {}),
        }),
      });
    },
    onRestart: (at) => {
      void navigate({ to: "/", search: _toRouteSearch({ ...search, at }) });
    },
  };
}

/** Every loaded page's days, in order, burst frames counted once each. */
function _daysFromPages(
  pages: readonly TimelineResponse[] | undefined,
): TimelineDay[] {
  return (pages ?? []).flatMap((page) => {
    return page.days;
  });
}

/** Display names by person id, for the spine's "with Elena" label. */
function _personNamesFromFacets(
  facets: FilterFacetsResponse | undefined,
): ReadonlyMap<string, string> {
  return new Map(
    (facets?.people ?? []).map((facet) => {
      return [facet.person.personId, facet.person.displayName] as const;
    }),
  );
}

/** Everything the hooks below produce, reduced to what the JSX reads. */
type TimelineData = {
  role: MemberRole;
  isEmptyArchive: boolean;
  isFiltered: boolean;
  hasOwnMain: boolean;
  /** Filtered, resolved, and empty: surface 6's dead end. */
  hasNoResults: boolean;
  filterCount: number;
  facets: FilterFacetsResponse | undefined;
  selection: TimelineSelection;
  countLabel: string | undefined;
  days: TimelineDay[];
  railDays: readonly RailDay[];
  framesByBurstId: ReadonlyMap<string, readonly ItemSummary[]>;
  hasMore: boolean;
  onSelectionChange: (next: TimelineSelection) => void;
  onReachEnd: () => void;
  onRestart: (at: string) => void;
};

/**
 * What `_makeTimelineData` needs, in the raw shape the queries leave it.
 *
 * `onSelectionChange` and `onRestart` arrive already built rather than as a
 * `navigate` this function would call itself: `useNavigate`'s return only
 * type-checks a literal `to` at its own call site, and a copy of it threaded
 * through a plain parameter loses that and stops accepting this route's own
 * search type.
 */
type MakeTimelineDataOptions = {
  search: TimelineSearch;
  selection: TimelineSelection;
  role: MemberRole | undefined;
  days: TimelineDay[];
  railDays: readonly RailDay[];
  resultCount: number | null | undefined;
  facets: FilterFacetsResponse | undefined;
  framesByBurstId: ReadonlyMap<string, readonly ItemSummary[]>;
  isStreamSuccess: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onSelectionChange: (next: TimelineSelection) => void;
  onRestart: (at: string) => void;
};

/**
 * Turns the raw query results into the one object the JSX reads.
 *
 * A plain function rather than more of the hook, so the branching that
 * decides which empty state applies and what each handler does is not mixed
 * in with the calls to TanStack Query.
 */
function _makeTimelineData(
  options: Readonly<MakeTimelineDataOptions>,
): TimelineData {
  const { search, selection, days, railDays, facets } = options;
  const isFiltered = isSelectionActive(selection);
  const hasNoResults =
    isFiltered && options.isStreamSuccess && days.length === 0;

  return {
    role: options.role ?? "viewer",
    isEmptyArchive: options.isStreamSuccess && days.length === 0 && !isFiltered,
    isFiltered,
    hasOwnMain: search.find === true || hasNoResults,
    hasNoResults,
    filterCount: options.resultCount ?? facets?.resultCount ?? 0,
    facets,
    selection,
    countLabel: spineCountLabel({
      selection,
      personNames: _personNamesFromFacets(facets),
    }),
    days,
    railDays,
    framesByBurstId: options.framesByBurstId,
    hasMore: options.hasNextPage,
    onSelectionChange: options.onSelectionChange,
    onReachEnd: () => {
      if (options.hasNextPage && !options.isFetchingNextPage) {
        options.fetchNextPage();
      }
    },
    onRestart: options.onRestart,
  };
}

/**
 * Every query surfaces 2, 5 and 6 share, boiled down to one object.
 *
 * Kept apart from `TimelineSurface` itself so that function stays a plain
 * layout: this is the piece that talks to TanStack Query and the router, and
 * `_makeTimelineData` is the piece that decides what the results mean.
 */
function useTimelineData(search: TimelineSearch): TimelineData {
  const navigate = useNavigate();
  const view = getViewFromSearch(search);
  const { selection } = view;

  const me = useQuery(meQueryOptions);
  const stream = useInfiniteQuery(timelineInfiniteQueryOptions(view));
  const rail = useQuery(timelineRailQueryOptions(selection));
  const facets = useQuery({
    ...filterFacetsQueryOptions(selection),
    enabled: isSelectionActive(selection) || search.find === true,
  });
  // Frames arrive from the burst's own route, which step 5a owns. Held here
  // rather than in the stack so a fan survives the page refetching around it.
  const [framesByBurstId] = useState<Map<string, readonly ItemSummary[]>>(
    () => {
      return new Map();
    },
  );

  const { onSelectionChange, onRestart } = _makeTimelineHandlers({
    navigate,
    search,
  });

  return _makeTimelineData({
    search,
    selection,
    role: me.data?.me.role,
    days: _daysFromPages(stream.data?.pages),
    railDays: rail.data?.days ?? [],
    resultCount: stream.data?.pages[0]?.resultCount,
    facets: facets.data,
    framesByBurstId,
    isStreamSuccess: stream.isSuccess,
    hasNextPage: stream.hasNextPage,
    isFetchingNextPage: stream.isFetchingNextPage,
    fetchNextPage: () => {
      void stream.fetchNextPage();
    },
    onSelectionChange,
    onRestart,
  });
}

/**
 * What the pile is filtered to, and the way out of each piece of it.
 *
 * `onClear` is the strip's own "show everything" button; `onChange` is what
 * one chip's own remove button calls, which is a narrower edit than clearing
 * everything.
 */
function _filterStrip(options: {
  selection: TimelineSelection;
  count: number;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
  onClear: () => void;
}): ReactNode {
  const { selection, count, facets, onChange, onClear } = options;
  return (
    <FilterStrip count={count} onClear={onClear}>
      <FilterChips selection={selection} facets={facets} onChange={onChange} />
    </FilterStrip>
  );
}

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
function _filterMain(options: {
  isOpen: boolean;
  hasNoResults: boolean;
  selection: TimelineSelection;
  facets: FilterFacetsResponse | undefined;
  onChange: (selection: TimelineSelection) => void;
}): ReactNode {
  const { isOpen, hasNoResults, selection, facets, onChange } = options;
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
      {hasNoResults ? (
        <NoResults selection={selection} facets={facets} onChange={onChange} />
      ) : null}
    </main>
  );
}

/**
 * The rail, the stream, and the end of the archive, in that order.
 *
 * This is everything `Archive` holds once the surface is past the two empty
 * states: surface 2 and the tail of surface 6 both end here.
 */
function _archiveBody(options: {
  days: readonly TimelineDay[];
  railDays: readonly RailDay[];
  countLabel: string | undefined;
  framesByBurstId: ReadonlyMap<string, readonly ItemSummary[]>;
  hasMore: boolean;
  onReachEnd: () => void;
  onRestart: (at: string) => void;
}): ReactNode {
  const {
    days,
    railDays,
    countLabel,
    framesByBurstId,
    hasMore,
    onReachEnd,
    onRestart,
  } = options;
  return (
    <>
      <JumpRail
        days={railDays}
        loadedDays={days.map((day) => {
          return day.capturedOn;
        })}
        standingOn={days[0]?.capturedOn}
        onRestart={onRestart}
      />
      <div aria-hidden="true" />
      <DayStream
        days={days}
        countLabel={countLabel}
        framesByBurstId={framesByBurstId}
        onOpenBurst={() => {
          // Step 5a owns `GET /api/bursts/:burstId/frames`. Task 23 wires it.
        }}
        onReachEnd={onReachEnd}
        hasMore={hasMore}
      />
      {hasMore || days.length === 0 ? null : (
        <ArchiveEnd totals={getArchiveTotalsFromRail(railDays)} />
      )}
    </>
  );
}

/**
 * Surfaces 2, 5 and 6's results: the pile, filtered by whatever the URL says.
 *
 * **A filtered pile is the pile with search parameters on it**, not a second
 * surface: same spine, same prints, same stacks, and one route with query
 * parameters rather than a second results shape.
 *
 * `Archive` is the page's own landmark and renders `<main>` by default. When
 * the filter sheet or the dead end is on the page, that `<main>` is theirs
 * and the pile becomes a plain section under it: two `<main>` elements on one
 * page is invalid and gives a screen reader two "main" landmarks to choose
 * between.
 */
export function TimelineSurface({ search }: Readonly<Props>): ReactNode {
  const data = useTimelineData(search);

  if (data.isEmptyArchive) {
    return <EmptyArchive role={data.role} />;
  }

  return (
    <>
      {data.isFiltered
        ? _filterStrip({
            selection: data.selection,
            count: data.filterCount,
            facets: data.facets,
            onChange: data.onSelectionChange,
            onClear: () => {
              data.onSelectionChange(EMPTY_SELECTION);
            },
          })
        : null}
      {_filterMain({
        isOpen: search.find === true,
        hasNoResults: data.hasNoResults,
        selection: data.selection,
        facets: data.facets,
        onChange: data.onSelectionChange,
      })}
      <Archive component={data.hasOwnMain ? "section" : "main"}>
        {_archiveBody({
          days: data.days,
          railDays: data.railDays,
          countLabel: data.countLabel,
          framesByBurstId: data.framesByBurstId,
          hasMore: data.hasMore,
          onReachEnd: data.onReachEnd,
          onRestart: data.onRestart,
        })}
      </Archive>
    </>
  );
}
