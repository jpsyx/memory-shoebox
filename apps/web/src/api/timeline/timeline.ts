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
} from "@tanstack/react-query";
import { apiFetch, makePathFromSearchParams } from "@/api/client/client";
import {
  makeQueryFromSelection,
  makeQueryFromView,
  type TimelineSelection,
  type TimelineView,
} from "@/api/timeline/selection";

/** The day stream. Every page of every selection hangs below this key. */
export const TIMELINE_QUERY_KEY = ["timeline"] as const;

/** The jump rail, which is a different shape of the same day stream. */
export const TIMELINE_RAIL_QUERY_KEY = ["timeline", "rail"] as const;

/** The exact path one page of the day stream is asked for at. */
export function makeTimelinePathFromView(options: {
  view: TimelineView;
  cursor?: string;
}): string {
  const query = makeQueryFromView(options.view);
  if (options.cursor !== undefined) {
    query.set("cursor", options.cursor);
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
  selection: TimelineSelection,
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
export function timelineInfiniteQueryOptions(
  view: TimelineView,
): ReturnType<
  typeof infiniteQueryOptions<
    TimelineResponse,
    Error,
    InfiniteData<TimelineResponse, string | null>,
    string[],
    string | null
  >
> {
  const query = makeQueryFromView(view).toString();
  return infiniteQueryOptions({
    queryKey: [...TIMELINE_QUERY_KEY, query],
    queryFn: ({ pageParam }): Promise<TimelineResponse> => {
      return apiFetch({
        path: makeTimelinePathFromView({
          view,
          cursor: pageParam ?? undefined,
        }),
        schema: timelineResponseSchema,
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: TimelineResponse) => {
      return lastPage.nextCursor;
    },
  });
}

/** Every visible day with its count, for the rail and for the end figures. */
export function timelineRailQueryOptions(
  selection: TimelineSelection,
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
  readonly itemTotal: number;
  readonly dayCount: number;
  /** The oldest day anything is on. Null on an archive with no days. */
  readonly firstCapturedOn: string | null;
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
    firstCapturedOn: days[days.length - 1]?.capturedOn ?? null,
  };
}
