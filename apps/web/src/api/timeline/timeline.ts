import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import {
  makeQueryFromSelection,
  makeQueryFromView,
  type TimelineSelection,
  type TimelineView,
} from "@/api/timeline/selection/selection";
import {
  timelineRailResponseSchema,
  timelineResponseSchema,
  type RailDay,
  type TimelineRailResponse,
  type TimelineResponse,
} from "@memory-shoebox/shared";
import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryFunction,
} from "@tanstack/react-query";
/** The day stream. Every page of every selection hangs below this key. */
export const TIMELINE_QUERY_KEY = ["timeline"] as const;

/** The jump rail, which is a different shape of the same day stream. */
export const TIMELINE_RAIL_QUERY_KEY = ["timeline", "rail"] as const;

/** Web-only page provenance, retained unchanged by appends and media-only edits. */
export type TimelineQueryPage = TimelineResponse & {
  /** Start of this page's actual metadata request, never an aggregate cache write. */
  metadataUpdatedAt: number;
  /** Count from this view's uncursored request or latest explicit refresh head. */
  selectionResultCount: number | null;
};

/** Count ownership is limited to one actual sequential fetch operation. */
type TimelineCountOperation = {
  signal: AbortSignal;
  resultCount: number | null;
};

/** A separate count object for each actual fetch, including canceled reads. */
function _makeCountOperationFromPageData(
  options: Readonly<{
    signal: AbortSignal;
    cached: InfiniteData<TimelineQueryPage, string | null> | undefined;
  }>,
): TimelineCountOperation {
  return {
    signal: options.signal,
    resultCount:
      options.cached?.pages[0]?.selectionResultCount ??
      options.cached?.pages[0]?.resultCount ??
      null,
  };
}

/** Produces pages while carrying count state only within one signal's fetch. */
function _makeTimelinePageReaderFromView(
  view: Readonly<TimelineView>,
): QueryFunction<TimelineQueryPage, string[], string | null> {
  let countOperation: TimelineCountOperation | undefined;
  return async ({ pageParam, signal, client, queryKey }) => {
    const metadataUpdatedAt = Date.now();
    const cached =
      client.getQueryData<InfiniteData<TimelineQueryPage, string | null>>(
        queryKey,
      );
    if (countOperation?.signal !== signal) {
      countOperation = _makeCountOperationFromPageData({ signal, cached });
    }
    const operation = countOperation;
    const isRefreshHead =
      pageParam !== null &&
      cached?.pageParams[0] === pageParam &&
      client.getQueryState(queryKey)?.fetchMeta?.fetchMore === undefined;
    const page = await apiFetch({
      path: makeTimelinePathFromView({
        view,
        cursor: pageParam ?? undefined,
        includeResultCount: isRefreshHead && makeQueryFromView(view).size > 0,
      }),
      schema: timelineResponseSchema,
      init: { signal },
    });
    if (pageParam === null || isRefreshHead) {
      operation.resultCount = page.resultCount;
    }
    return {
      ...page,
      metadataUpdatedAt,
      selectionResultCount: operation.resultCount,
    };
  };
}

/** The exact path one page of the day stream is asked for at. */
export function makeTimelinePathFromView(
  options: Readonly<{
    view: Readonly<TimelineView>;
    cursor?: string;
    includeResultCount?: boolean;
  }>,
): string {
  const query = makeQueryFromView(options.view);
  if (options.cursor !== undefined) {
    query.set("cursor", options.cursor);
  }
  if (options.includeResultCount) {
    query.set("includeResultCount", "true");
  }
  return makePathFromSearchParams({
    basePath: "/timeline",
    searchParams: query,
  });
}

/**
 * The exact path the rail is asked for at.
 *
 * It takes the selection and never the jump: the rail's whole job is to be
 * complete, and a rail clipped to where the pile happens to be standing cannot
 * be jumped through. `limit` and `cursor` are rejected by the route rather
 * than ignored, so neither is ever sent.
 */
export function makeRailPathFromSelection(
  selection: Readonly<TimelineSelection>,
): string {
  return makePathFromSearchParams({
    basePath: "/timeline/rail",
    searchParams: makeQueryFromSelection(selection),
  });
}

/**
 * The paged day stream for one view.
 *
 * `nextCursor` is the page parameter and null is the end. The cursor carries a
 * digest of the filter, so a view change must produce a different query key or
 * the server answers `400`; deriving the key from the same string the request
 * is built from is what guarantees it does.
 */
export function makeTimelineQueryOptionsFromView({
  view,
  memberId,
}: Readonly<{ view: Readonly<TimelineView>; memberId?: string }>): ReturnType<
  typeof infiniteQueryOptions<
    TimelineQueryPage,
    Error,
    InfiniteData<TimelineQueryPage, string | null>,
    string[],
    string | null
  >
> {
  const query = makeQueryFromView(view).toString();
  return infiniteQueryOptions({
    queryKey: [
      ...TIMELINE_QUERY_KEY,
      ...(memberId === undefined ? [] : [memberId]),
      query,
    ],
    queryFn: _makeTimelinePageReaderFromView(view),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: TimelineResponse) => {
      return lastPage.nextCursor;
    },
    getPreviousPageParam: (firstPage: TimelineResponse) => {
      return firstPage.previousCursor;
    },
    maxPages: 5,
  });
}

/** Every visible day with its count, for the rail and for the end figures. */
export function timelineRailQueryOptions(
  selection: Readonly<TimelineSelection>,
): ReturnType<
  typeof queryOptions<
    TimelineRailResponse,
    Error,
    TimelineRailResponse,
    string[]
  >
> {
  return queryOptions({
    queryKey: [
      ...TIMELINE_RAIL_QUERY_KEY,
      makeQueryFromSelection(selection).toString(),
    ],
    queryFn: (): Promise<TimelineRailResponse> => {
      return apiFetch({
        path: makeRailPathFromSelection(selection),
        schema: timelineRailResponseSchema,
      });
    },
  });
}

/** The three figures the end of the archive prints. */
export type ArchiveTotals = {
  itemTotal: number;
  dayCount: number;
  /** The oldest day anything is on. Undefined on an archive with no days. */
  firstCapturedOn: string | undefined;
};

/**
 * The end block's figures, and the first-sign-in line's count.
 *
 * Summed here rather than served as a field. `timeline.md` transformation 10
 * refuses a totals object precisely because it would be a second place a
 * brand-new archive and a fully restricted viewer could drift apart, and the
 * rail has already scanned exactly these rows.
 */
export function getArchiveTotalsFromRail(
  days: readonly RailDay[],
): ArchiveTotals {
  return {
    itemTotal: days.reduce((total, day) => {
      return total + day.itemCount;
    }, 0),
    dayCount: days.length,
    // The rail runs newest first, so the first day anything went up is last.
    firstCapturedOn: days[days.length - 1]?.capturedOn ?? undefined,
  };
}
