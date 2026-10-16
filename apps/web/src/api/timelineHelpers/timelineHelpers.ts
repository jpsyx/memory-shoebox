import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import {
  makeQueryFromSelection,
  makeQueryFromView,
  type TimelineSelection,
  type TimelineView,
} from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
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
  replaceEqualDeep,
} from "@tanstack/react-query";
/** The day stream. Every page of every selection hangs below this key. */
export const TIMELINE_QUERY_KEY = ["timeline"] as const;

/** The jump rail, which is a different shape of the same day stream. */
export const TIMELINE_RAIL_QUERY_KEY = ["timeline", "rail"] as const;

/**
 * Web-only page provenance, retained unchanged by appends and media-only edits.
 */
export type TimelineQueryPage = TimelineResponse & {
  /**
   * Start of this page's actual metadata request, never an aggregate cache
   * write.
   */
  metadataUpdatedAt: number;
  /**
   * Count from this view's uncursored request or latest explicit refresh head.
   */
  selectionResultCount: number | undefined;
  /** Actual request cursor; undefined requests the uncursored head. */
  requestCursorKnown?: true;
  /** Preserved alongside requestCursorKnown through structural sharing. */
  requestCursor?: string;
};

/** A fetched page before this operation's count is attached. */
type TimelineMetadataPage = TimelineResponse & {
  metadataUpdatedAt: number;
  requestCursorKnown: true;
  requestCursor: string | undefined;
};

/** One real request and its optional one-time empty-head recovery. */
type TimelinePageReadOptions = {
  view: Readonly<TimelineView>;
  cursor: string | undefined;
  signal: AbortSignal;
  includeResultCount: boolean;
  canRestartWhenEmpty: boolean;
};

/**
 * Reads one actual cursor and stamps that request's own metadata provenance.
 */
async function _readTimelinePageFromCursor(
  options: Readonly<TimelinePageReadOptions>,
): Promise<TimelineMetadataPage> {
  const metadataUpdatedAt = Date.now();
  const page = await apiFetch({
    path: makeTimelinePathFromView({
      view: options.view,
      cursor: options.cursor,
      includeResultCount: options.includeResultCount,
    }),
    schema: timelineResponseSchema,
    init: { signal: options.signal },
  });
  return options.canRestartWhenEmpty && page.days.length === 0
    ? _readTimelinePageFromCursor({
        ...options,
        cursor: undefined,
        includeResultCount: false,
        canRestartWhenEmpty: false,
      })
    : {
        ...page,
        metadataUpdatedAt,
        requestCursorKnown: true,
        requestCursor: options.cursor,
      };
}

/**
 * Publishes truthful cursor provenance atomically, preserving unchanged refs.
 */
function _shareTimelineQueryData(oldData: unknown, newData: unknown): unknown {
  const data = newData as InfiniteData<TimelineQueryPage, string | undefined>;
  const pageParams = data.pages.map((page, index) => {
    return page.requestCursorKnown || page.requestCursor !== undefined
      ? page.requestCursor
      : data.pageParams[index];
  });
  return replaceEqualDeep(oldData, { ...data, pageParams });
}

/** Count ownership is limited to one actual sequential fetch operation. */
type TimelineCountOperation = {
  resultCount: number | undefined;
};

/** A separate count object for each actual fetch, including canceled reads. */
function _makeCountOperationFromPageData(
  cached: InfiniteData<TimelineQueryPage, string | undefined> | undefined,
): TimelineCountOperation {
  return {
    resultCount:
      cached?.pages[0]?.selectionResultCount ??
      cached?.pages[0]?.resultCount ??
      undefined,
  };
}

/** Produces pages while carrying count state only within one signal's fetch. */
function _makeTimelinePageReaderFromView({
  view,
  isRecovery = false,
}: {
  view: Readonly<TimelineView>;
  isRecovery?: boolean;
}): QueryFunction<TimelineQueryPage, string[], string | undefined> {
  const operations = new WeakMap<AbortSignal, TimelineCountOperation>();
  return async ({ pageParam, signal, client, queryKey }) => {
    const cached =
      client.getQueryData<InfiniteData<TimelineQueryPage, string | undefined>>(
        queryKey,
      );
    const operation =
      operations.get(signal) ?? _makeCountOperationFromPageData(cached);
    operations.set(signal, operation);
    const isRefreshHead =
      pageParam !== undefined &&
      (isRecovery ||
        ((!cached?.pages.length || cached.pageParams[0] === pageParam) &&
          client.getQueryState(queryKey)?.fetchMeta?.fetchMore === undefined));
    const page = await _readTimelinePageFromCursor({
      view,
      cursor: pageParam,
      signal,
      includeResultCount: isRefreshHead && makeQueryFromView(view).size > 0,
      canRestartWhenEmpty: isRefreshHead,
    });
    if (page.requestCursor === undefined || isRefreshHead) {
      operation.resultCount = page.resultCount ?? undefined;
    }
    return {
      ...page,
      selectionResultCount: operation.resultCount,
    };
  };
}

/**
 * Reuses the page producer for one explicit cursor recovery with fresh count
 * provenance.
 */
export function readTimelinePageFromCursor(
  options: Readonly<
    Pick<TimelinePageReadOptions, "view" | "cursor" | "signal"> & {
      client: import("@tanstack/react-query").QueryClient;
      queryKey: string[];
    }
  >,
): Promise<TimelineQueryPage> {
  return Promise.resolve(
    _makeTimelinePageReaderFromView({ view: options.view, isRecovery: true })({
      client: options.client,
      queryKey: options.queryKey,
      signal: options.signal,
      pageParam: options.cursor,
      direction: "forward",
      meta: undefined,
    }),
  );
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
 * `nextCursor` is normalized to an optional page parameter. The cursor carries
 * a
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
    InfiniteData<TimelineQueryPage, string | undefined>,
    string[],
    string | undefined
  >
> {
  const query = makeQueryFromView(view).toString();
  return infiniteQueryOptions({
    queryKey: [
      ...TIMELINE_QUERY_KEY,
      ...(memberId === undefined ? [] : [memberId]),
      query,
    ],
    queryFn: _makeTimelinePageReaderFromView({ view }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: TimelineResponse) => {
      return lastPage.nextCursor ?? undefined;
    },
    getPreviousPageParam: (firstPage: TimelineResponse) => {
      return firstPage.previousCursor ?? undefined;
    },
    maxPages: 5,
    structuralSharing: _shareTimelineQueryData,
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
