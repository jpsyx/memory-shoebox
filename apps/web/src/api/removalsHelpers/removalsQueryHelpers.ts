import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import {
  listItemRemovalRequestsResponseSchema,
  listRemovalRequestsResponseSchema,
  type ListItemRemovalRequestsResponse,
  type ListRemovalRequestsResponse,
} from "@memory-shoebox/shared";
import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
} from "@tanstack/react-query";
import type { RemovalQueueState } from "./removalsHelpers.types";
/** Scoped history and ask authority, without the item GET's open count. */
export function makeItemRemovalRequestsQueryOptionsFromIdentity(
  options: Readonly<{ memberId: string; itemId: string }>,
): ReturnType<
  typeof queryOptions<
    ListItemRemovalRequestsResponse,
    Error,
    ListItemRemovalRequestsResponse,
    string[]
  >
> {
  const path = `/items/${encodeURIComponent(options.itemId)}/removal-requests`;
  return queryOptions({
    queryKey: ["removal-requests", "item", options.memberId, path],
    queryFn: ({ signal }) => {
      return apiFetch({
        path,
        schema: listItemRemovalRequestsResponseSchema,
        init: { signal },
      });
    },
  });
}

/** One member's queue tab, following opaque cursors until null. */
export function makeRemovalRequestsInfiniteQueryOptionsFromQueueScope(
  options: Readonly<{ memberId: string; state: RemovalQueueState }>,
): ReturnType<
  typeof infiniteQueryOptions<
    ListRemovalRequestsResponse,
    Error,
    InfiniteData<ListRemovalRequestsResponse, string | undefined>,
    string[],
    string | undefined
  >
> {
  const query = new URLSearchParams({ state: options.state }).toString();
  return infiniteQueryOptions({
    queryKey: ["removal-requests", "queue", options.memberId, query],
    queryFn: ({ pageParam, signal }) => {
      const searchParams = new URLSearchParams(query);
      if (pageParam !== undefined) {
        searchParams.set("cursor", pageParam);
      }
      return apiFetch({
        path: makePathFromSearchParams({
          basePath: "/removal-requests",
          searchParams,
        }),
        schema: listRemovalRequestsResponseSchema,
        init: { signal },
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.nextCursor ?? undefined;
    },
  });
}
