import { getNavigationSelectionFromView } from "@/media/getNavigationSelectionFromView";

import {
  getViewFromSearch,
  isSelectionActive,
  makeSearchFromSelection,
  type TimelineSearch,
  type TimelineSelection,
} from "@/api/timeline/selection/selection";

import { spineCountLabel } from "@/surfaces/Timeline/pileCopy/pileCopy";

import type {
  FilterFacetsResponse,
  TimelineDay,
  TimelineResponse,
} from "@memory-shoebox/shared";

import { useNavigate } from "@tanstack/react-router";

import {
  type MakeTimelineDataOptions,
  type TimelineData,
} from "./useTimelineData.types";

/** No tag, person or date restriction; used when clearing the active selection. */
export const EMPTY_SELECTION: TimelineSelection = {
  tags: [],
  people: [],
  from: undefined,
  until: undefined,
};

/** Copies readonly tag/person arrays into mutable router search arrays without changing their values. */
export function makeRouteSearchFromTimelineSearch(
  search: Readonly<TimelineSearch>,
): Omit<TimelineSearch, "tag" | "person"> & {
  tag: string[] | undefined;
  person: string[] | undefined;
} {
  return {
    ...search,
    tag: search.tag === undefined ? undefined : [...search.tag],
    person: search.person === undefined ? undefined : [...search.person],
  };
}

/** Creates navigation handlers that compose search updates against the router's current pending search. Selection changes drop jumps; clear-all preserves them, and item opens carry the effective selection. */
export function makeTimelineHandlersFromOptions(options: {
  navigate: ReturnType<typeof useNavigate>;
  search: TimelineSearch;
}): Pick<
  TimelineData,
  "onSelectionChange" | "onClearFilters" | "onRestart" | "onOpenItem"
> {
  const { navigate, search } = options;
  return {
    // The jump is dropped whenever the selection changes, and only then: `at`
    // has no chip, so carried into a narrowed selection it can fake a dead end.
    onSelectionChange: (update) => {
      void navigate({
        to: "/",
        search: (current) => {
          return makeRouteSearchFromTimelineSearch({
            ...makeSearchFromSelection(
              update(getViewFromSearch(current).selection),
            ),
            ...(current.find === true ? { find: true } : {}),
          });
        },
      });
    },
    // Clear-all keeps the jump: it is where the reader stands in a 948-day
    // archive, not a filter (`selection.ts`, `docs/web.md`), and
    // the day `at` names is one the rail listed, so no dead end can follow.
    onClearFilters: () => {
      void navigate({
        to: "/",
        search: (current) => {
          return makeRouteSearchFromTimelineSearch({
            ...makeSearchFromSelection(EMPTY_SELECTION),
            ...(current.find === true ? { find: true } : {}),
            ...(current.at === undefined ? {} : { at: current.at }),
          });
        },
      });
    },
    onRestart: (at) => {
      void navigate({
        to: "/",
        search: (current) => {
          return makeRouteSearchFromTimelineSearch({ ...current, at });
        },
      });
    },
    // A print is a button that navigates, so intent preloading never sees it,
    // and the item route has no loader: a hover is not an open.
    onOpenItem: (itemId) => {
      void navigate({
        to: "/items/$itemId",
        params: { itemId },
        state: {
          itemNavigationSelection: getNavigationSelectionFromView(
            getViewFromSearch(search),
          ),
        },
      });
    },
  };
}

/** Flattens retained timeline pages in their existing order; an unanswered query yields no days. */
export function getDaysFromTimelinePages(
  pages: readonly TimelineResponse[] | undefined,
): TimelineDay[] {
  return (pages ?? []).flatMap((page) => {
    return page.days;
  });
}

/** Indexes available person facets by ID for filter labels; missing facets yield an empty map. */
export function getPersonNamesFromFacets(
  facets: FilterFacetsResponse | undefined,
): Map<string, string> {
  return new Map(
    (facets?.people ?? []).map((facet) => {
      return [facet.person.personId, facet.person.displayName] as const;
    }),
  );
}

/** Indexes standalone items by item ID and burst covers by burst ID with their aggregate unseen state. */
export function getUnseenStateFromDays(
  days: readonly TimelineDay[],
): Map<string, boolean> {
  return new Map(
    days.flatMap((day) => {
      return day.items.map((item) => {
        return item.burst === null
          ? ([item.itemId, item.isUnseen] as const)
          : ([item.burst.burstId, item.burst.hasUnseenFrames] as const);
      });
    }),
  );
}

/** Combines settled stream, facet and selection inputs into display data; route and burst ownership stay with the hook. */
export function makeTimelineDataFromQuery(
  options: Readonly<MakeTimelineDataOptions>,
): Omit<
  TimelineData,
  | "onOpenBurst"
  | "restoreBurst"
  | "onClearBursts"
  | "onOpenItem"
  | "archiveRef"
  | "isFetching"
  | "hasPrevious"
  | "viewKey"
  | "pageCursors"
  | "expanded"
  | "onCollapseBurst"
  | "recoverPage"
> {
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
      personNames: getPersonNamesFromFacets(facets),
    }),
    days,
    railDays,
    framesByBurstId: options.framesByBurstId,
    hasMore: options.hasNextPage,
    onSelectionChange: options.onSelectionChange,
    onClearFilters: options.onClearFilters,
    onReachEnd: options.onReachEnd,
    onReachStart: options.onReachStart,
    onRestart: options.onRestart,
  };
}
