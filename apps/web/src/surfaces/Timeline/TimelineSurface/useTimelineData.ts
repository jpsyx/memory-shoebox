import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, type RefCallback } from "react";
import type {
  BurstFrameRef,
  FilterFacetsResponse,
  ItemsSeenRequest,
  MemberRole,
  RailDay,
  TimelineDay,
  TimelineResponse,
} from "@memory-shoebox/shared";
import { markItemsSeen } from "@/api/seen/seen";
import { meQueryOptions } from "@/api/me/me";
import {
  getViewFromSearch,
  isSelectionActive,
  makeSearchFromSelection,
  type TimelineSearch,
  type TimelineSelection,
} from "@/api/timeline/selection/selection";
import {
  TIMELINE_QUERY_KEY,
  timelineInfiniteQueryOptions,
  timelineRailQueryOptions,
} from "@/api/timeline/timeline";
import { filterFacetsQueryOptions } from "@/api/vocabularies/vocabularies";
import { spineCountLabel } from "@/surfaces/Timeline/pileCopy/pileCopy";
import { useBurstFan } from "@/surfaces/Timeline/TimelineSurface/useBurstFan/useBurstFan";
import { useReSigning } from "@/surfaces/Timeline/useReSigning/useReSigning";
import { useSeenLatch } from "@/surfaces/Timeline/useSeenLatch/useSeenLatch";

/** The selection the strip's "Clear, show everything" button sets. */
const EMPTY_SELECTION: TimelineSelection = {
  tags: [],
  people: [],
  from: undefined,
  until: undefined,
};

/** Everything the hooks below produce, reduced to what the JSX reads. */
export type TimelineData = {
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
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  hasMore: boolean;
  onSelectionChange: (next: TimelineSelection) => void;
  /** Either "show everything" button, both of which keep the jump. */
  onClearFilters: () => void;
  onReachEnd: () => void;
  onRestart: (at: string) => void;
  onOpenBurst: (burstId: string) => void;
  /** A print or a fanned frame was pressed: the item viewer opens. */
  onOpenItem: (itemId: string) => void;
  /** The seen latch's own ref, put on `Archive`. */
  archiveRef: RefCallback<HTMLElement>;
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
 * The four ways this surface edits the URL: a new selection, clearing the
 * strip, a jump, and opening an item.
 *
 * Built here, from `navigate` as `useTimelineData` calls it directly, rather
 * than reading `navigate` back out of a stored `TimelineData` field: the
 * closures are the boundary, and everything past them deals in plain
 * callbacks.
 *
 * **`navigate`'s `search` replaces rather than merges** when it is given an
 * object, which is why `find` is re-added by hand below and why `at` has to
 * be too wherever it is meant to survive.
 */
function _makeTimelineHandlers(options: {
  navigate: ReturnType<typeof useNavigate>;
  search: TimelineSearch;
}): {
  onSelectionChange: (next: TimelineSelection) => void;
  onClearFilters: () => void;
  onRestart: (at: string) => void;
  onOpenItem: (itemId: string) => void;
} {
  const { navigate, search } = options;
  return {
    // The jump is dropped whenever the selection changes, and only then: `at`
    // has no chip, so carried into a narrowed selection it can fake a dead end.
    onSelectionChange: (next) => {
      void navigate({
        to: "/",
        search: _toRouteSearch({
          ...makeSearchFromSelection(next),
          ...(search.find === true ? { find: true } : {}),
        }),
      });
    },
    // Clear-all keeps the jump: it is where the reader stands in a 948-day
    // archive, not a filter (`selection.ts`, `docs/web.md`, Decision 4), and
    // the day `at` names is one the rail listed, so no dead end can follow.
    onClearFilters: () => {
      void navigate({
        to: "/",
        search: _toRouteSearch({
          ...makeSearchFromSelection(EMPTY_SELECTION),
          ...(search.find === true ? { find: true } : {}),
          ...(search.at === undefined ? {} : { at: search.at }),
        }),
      });
    },
    onRestart: (at) => {
      void navigate({ to: "/", search: _toRouteSearch({ ...search, at }) });
    },
    // A print is a button that navigates, so intent preloading never sees it,
    // and the item route has no loader: a hover is not an open.
    onOpenItem: (itemId) => {
      void navigate({ to: "/items/$itemId", params: { itemId } });
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
): Map<string, string> {
  return new Map(
    (facets?.people ?? []).map((facet) => {
      return [facet.person.personId, facet.person.displayName] as const;
    }),
  );
}

/**
 * Whether each item or burst on the page is unseen, keyed by its own id.
 *
 * A plain print is keyed by its item id; a collapsed stack by its burst id,
 * since the burst id is the one thing the DOM carries for it.
 */
function _unseenByIdFromDays(
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

/**
 * Posts a latched batch, and never bothers anybody when it fails.
 *
 * The latch is one-way, so nothing is refetched here: the client already
 * knows the answer, and asking for it again would be the write it avoided
 * plus a read. A failed post is not worth surfacing either: the dots stay on
 * and the next pass over the same print tries again.
 */
function _onSeenLatch(body: ItemsSeenRequest): void {
  void markItemsSeen(body).catch(() => {
    // Silently retried the next time the print or stack is on screen.
  });
}

/**
 * The burst fan and the seen latch: the two things this surface reaches into
 * the rendered DOM for, rather than only reading from TanStack Query.
 *
 * Bundled so `useTimelineData` needs one more call rather than three.
 */
function usePileControls(options: {
  queryClient: QueryClient;
  days: readonly TimelineDay[];
}): {
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  onOpenBurst: (burstId: string) => void;
  archiveRef: RefCallback<HTMLElement>;
} {
  const { framesByBurstId, onOpenBurst } = useBurstFan(options.queryClient);
  const archiveRef = useSeenLatch({
    unseenById: _unseenByIdFromDays(options.days),
    onLatch: _onSeenLatch,
  });
  return { framesByBurstId, onOpenBurst, archiveRef };
}

/**
 * Refetches the timeline in place once its earliest signature nears expiry.
 *
 * Kept apart from `useTimelineData` so that function holds one more call
 * rather than the callback and the timer hook it feeds.
 */
function useTimelineReSigning(options: {
  queryClient: QueryClient;
  days: readonly TimelineDay[];
}): void {
  const { queryClient, days } = options;
  const refetchInPlace = useCallback(() => {
    void queryClient.refetchQueries({
      queryKey: [...TIMELINE_QUERY_KEY],
      exact: false,
    });
  }, [queryClient]);
  useReSigning({ days, onExpire: refetchInPlace });
}

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
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  isStreamSuccess: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onSelectionChange: (next: TimelineSelection) => void;
  onClearFilters: () => void;
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
): Omit<TimelineData, "onOpenBurst" | "onOpenItem" | "archiveRef"> {
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
    onClearFilters: options.onClearFilters,
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
export function useTimelineData(search: TimelineSearch): TimelineData {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const view = getViewFromSearch(search);
  const { selection } = view;
  const me = useQuery(meQueryOptions);
  const stream = useInfiniteQuery(timelineInfiniteQueryOptions(view));
  const rail = useQuery(timelineRailQueryOptions(selection));
  const facets = useQuery({
    ...filterFacetsQueryOptions(selection),
    enabled: isSelectionActive(selection) || search.find === true,
  });
  const days = _daysFromPages(stream.data?.pages);
  const { framesByBurstId, onOpenBurst, archiveRef } = usePileControls({
    queryClient,
    days,
  });
  useTimelineReSigning({ queryClient, days });
  const { onSelectionChange, onClearFilters, onRestart, onOpenItem } =
    _makeTimelineHandlers({ navigate, search });
  return {
    ..._makeTimelineData({
      search,
      selection,
      role: me.data?.me.role,
      days,
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
      onClearFilters,
      onRestart,
    }),
    onOpenBurst,
    onOpenItem,
    archiveRef,
  };
}
