import { useTimelineRecovery } from "./useTimelineRecovery";
import { useContext } from "react";
import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import { createTimelineMemory } from "../windowing/createTimelineMemory";
import type {
  TimelineAnchor,
  TimelineExpansion,
} from "../windowing/timelineWindow.types";
import { getNavigationSelectionFromView } from "@/media/getNavigationSelectionFromView";
import {
  useTimelinePaging,
  type TimelinePaging,
} from "@/api/timeline/useTimelinePaging/useTimelinePaging";
import { meQueryOptions } from "@/api/me/me";
import { markItemsSeen } from "@/api/seen/seen";
import {
  getViewFromSearch,
  isSelectionActive,
  makeSearchFromSelection,
  type TimelineSearch,
  type TimelineSelection,
  type TimelineView,
} from "@/api/timeline/selection/selection";
import {
  makeTimelineQueryOptionsFromView,
  timelineRailQueryOptions,
  type TimelineQueryPage,
} from "@/api/timeline/timeline";
import { makeFilterFacetsQueryOptionsFromSelection } from "@/api/vocabularies/vocabularies";
import { spineCountLabel } from "@/surfaces/Timeline/pileCopy/pileCopy";
import { useBurstFan } from "@/surfaces/Timeline/TimelineSurface/useBurstFan/useBurstFan";
import { useSeenLatch } from "@/surfaces/Timeline/useSeenLatch/useSeenLatch";
import type {
  BurstFrameRef,
  FilterFacetsResponse,
  ItemsSeenRequest,
  MemberRole,
  RailDay,
  TimelineDay,
  TimelineResponse,
} from "@memory-shoebox/shared";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type RefCallback } from "react";
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
  isFetching: boolean;
  hasPrevious: boolean;
  viewKey: string;
  pageCursors: ReadonlyMap<string, string | null>;
  recoverPage: (anchor: TimelineAnchor) => Promise<void>;
  expanded: ReadonlyMap<string, TimelineExpansion>;
  onCollapseBurst: (burstId: string) => void;
  onSelectionChange: (next: TimelineSelection) => void;
  /** Either "show everything" button, both of which keep the jump. */
  onClearFilters: () => void;
  onReachEnd: () => void;
  /** Guarded newer-page entry point; C3 owns the measured start trigger. */
  onReachStart: () => void;
  onRestart: (at: string) => void;
  onOpenBurst: (burstId: string) => void;
  onClearBursts: () => void;
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
}): Pick<
  TimelineData,
  "onSelectionChange" | "onClearFilters" | "onRestart" | "onOpenItem"
> {
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
    // archive, not a filter (`selection.ts`, `docs/web.md`), and
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
  viewKey: string;
  memory: ReturnType<typeof createTimelineMemory>;
}): {
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  onOpenBurst: (burstId: string) => void;
  onClearBursts: () => void;
  archiveRef: RefCallback<HTMLElement>;
  expanded: ReadonlyMap<string, TimelineExpansion>;
  onCollapseBurst: (burstId: string) => void;
} {
  const {
    framesByBurstId,
    onOpenBurst,
    onClearBursts,
    expanded,
    onCollapseBurst,
  } = useBurstFan(options.queryClient, {
    memory: options.memory,
    viewKey: options.viewKey,
    retainedBurstIds: new Set(
      options.days.flatMap((day) => {
        return day.items.flatMap((item) => {
          return item.burst ? [item.burst.burstId] : [];
        });
      }),
    ),
  });
  const archiveRef = useSeenLatch({
    unseenById: _unseenByIdFromDays(options.days),
    onLatch: _onSeenLatch,
  });
  return {
    framesByBurstId,
    onOpenBurst,
    onClearBursts,
    archiveRef,
    expanded,
    onCollapseBurst,
  };
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
  onReachEnd: () => void;
  onReachStart: () => void;
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
): Omit<
  TimelineData,
  | "onOpenBurst"
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
      personNames: _personNamesFromFacets(facets),
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

/**
 * The member-bound stream and both callbacks sharing its current fetch slot.
 */
function useTimelineStream(view: Readonly<TimelineView>): {
  stream: UseInfiniteQueryResult<
    InfiniteData<TimelineQueryPage, string | null>
  >;
  paging: TimelinePaging;
  role: MemberRole | undefined;
  queryKey: string[];
  isRecovering: boolean;
  recoverPage: (anchor: TimelineAnchor) => Promise<void>;
} {
  const me = useQuery(meQueryOptions);
  const memberId = me.data?.me.member.memberId;
  const streamOptions = makeTimelineQueryOptionsFromView({ view, memberId });
  const recovery = useTimelineRecovery({
    view,
    queryKey: streamOptions.queryKey,
  });
  const resources = useContext(MediaLoadingContext);
  const saved = resources?.timeline.get(
    JSON.stringify(streamOptions.queryKey),
  ).anchor;
  const stream = useInfiniteQuery({
    ...streamOptions,
    initialPageParam: saved?.pageCursor ?? null,
    enabled: memberId !== undefined && !recovery.isRecovering,
  });
  const paging = useTimelinePaging({
    queryKey: streamOptions.queryKey,
    stream,
  });
  return {
    stream,
    paging: {
      onReachStart: () => {
        if (!recovery.isPending()) paging.onReachStart();
      },
      onReachEnd: () => {
        if (!recovery.isPending()) paging.onReachEnd();
      },
    },
    isRecovering: recovery.isRecovering,
    role: me.data?.me.role,
    queryKey: streamOptions.queryKey,
    recoverPage: recovery.recoverPage,
  };
}

/** The member-bound stream, complete rail, facets and pile controls. */
export function useTimelineData(search: TimelineSearch): TimelineData {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const view = getViewFromSearch(search);
  const { selection } = view;
  const { stream, paging, role, queryKey, recoverPage, isRecovering } =
    useTimelineStream(view);
  const resources = useContext(MediaLoadingContext);
  const viewKey = JSON.stringify(queryKey);
  const rail = useQuery(timelineRailQueryOptions(selection));
  const facets = useQuery({
    ...makeFilterFacetsQueryOptionsFromSelection({ selection }),
    enabled: isSelectionActive(selection) || search.find === true,
  });
  const days = _daysFromPages(stream.data?.pages);
  const {
    framesByBurstId,
    onOpenBurst,
    onClearBursts,
    archiveRef,
    expanded,
    onCollapseBurst,
  } = usePileControls({
    memory: resources?.timeline ?? createTimelineMemory(),
    viewKey,
    queryClient,
    days,
  });
  const { onSelectionChange, onClearFilters, onRestart, onOpenItem } =
    _makeTimelineHandlers({ navigate, search });
  return {
    ..._makeTimelineData({
      search,
      selection,
      role,
      days,
      railDays: rail.data?.days ?? [],
      resultCount:
        stream.data?.pages[0]?.selectionResultCount ??
        stream.data?.pages[0]?.resultCount,
      facets: facets.data,
      framesByBurstId,
      isStreamSuccess: stream.isSuccess,
      hasNextPage: stream.hasNextPage,
      ...paging,
      onSelectionChange,
      onClearFilters,
      onRestart,
    }),
    onOpenBurst,
    onClearBursts,
    onOpenItem,
    archiveRef,
    hasPrevious: stream.hasPreviousPage,
    isFetching: stream.isFetching || isRecovering,
    viewKey,
    expanded,
    onCollapseBurst,
    recoverPage,
    pageCursors: new Map(
      stream.data?.pages.flatMap((page, index) => {
        return page.days.map((day) => {
          return [
            day.capturedOn,
            stream.data!.pageParams[index] ?? null,
          ] as const;
        });
      }),
    ),
  };
}
