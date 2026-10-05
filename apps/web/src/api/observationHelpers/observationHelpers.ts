import {
  activityResponseSchema,
  itemViewersResponseSchema,
  presenceResponseSchema,
  type ActivityRequest,
  type ActivityResponse,
  type PresenceResponse,
  type ItemViewersResponse,
} from "@memory-shoebox/shared";
import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import { makeItemPathFromItemId } from "@/api/items/items";
/**
 * All authorized member participation records, already ordered by the server.
 */
export function presenceQueryOptions(): ReturnType<
  typeof queryOptions<PresenceResponse, Error, PresenceResponse, string[]>
> {
  return queryOptions({
    queryKey: ["presence"],
    queryFn: () => {
      return apiFetch({ path: "/presence", schema: presenceResponseSchema });
    },
  });
}
/** Eligible members and recorded full-size opens for one item. */
export function makeItemViewersQueryOptionsFromItemId(
  itemId: string,
): ReturnType<
  typeof queryOptions<ItemViewersResponse, Error, ItemViewersResponse, string[]>
> {
  return queryOptions({
    queryKey: ["observations", "item-viewers", itemId],
    queryFn: () => {
      return apiFetch({
        path: `${makeItemPathFromItemId(itemId)}/viewers`,
        schema: itemViewersResponseSchema,
      });
    },
  });
}
/**
 * Encodes exact combined history filters and the server's opaque page cursor.
 */
export function makeActivityPathFromRequest(
  request: Readonly<ActivityRequest>,
): string {
  const searchParams = new URLSearchParams();
  (
    ["family", "actorMemberId", "subjectId", "limit", "cursor"] as const
  ).forEach((key) => {
    const value = request[key];
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  });
  return makePathFromSearchParams({ basePath: "/activity", searchParams });
}
/**
 * Pages history in server order, keeping every combined filter in its cache
 * key.
 */
export function makeActivityQueryOptionsFromFilters(
  filters: Readonly<Omit<ActivityRequest, "cursor">>,
): ReturnType<
  typeof infiniteQueryOptions<
    ActivityResponse,
    Error,
    InfiniteData<ActivityResponse, string | undefined>,
    string[],
    string | undefined
  >
> {
  return infiniteQueryOptions({
    queryKey: ["activity", makeActivityPathFromRequest(filters)],
    queryFn: ({ pageParam }) => {
      return apiFetch({
        path: makeActivityPathFromRequest({ ...filters, cursor: pageParam }),
        schema: activityResponseSchema,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ActivityResponse): string | undefined => {
      return page.nextCursor ?? undefined;
    },
  });
}
