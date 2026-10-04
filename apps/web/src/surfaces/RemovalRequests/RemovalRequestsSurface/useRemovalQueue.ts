import { useInfiniteQuery } from "@tanstack/react-query";
import type { ListRemovalRequestsResponse } from "@memory-shoebox/shared";
import { removalRequestsInfiniteQueryOptions } from "@/api/removals/removalsQueryHelpers";
import {
  hasRepeatedQueueCursor,
  type RemovalQueueQuery,
} from "./removalQueueHelpers";

/** Both member-scoped tabs follow advancing cursors and preserve server counts. */
export function useRemovalQueue(memberId: string): {
  open: RemovalQueueQuery;
  settled: RemovalQueueQuery;
  counts: ListRemovalRequestsResponse | undefined;
} {
  const open = useInfiniteQuery({
    ...removalRequestsInfiniteQueryOptions({ memberId, state: "open" }),
    getNextPageParam: (page, _pages, _param, params) => {
      return hasRepeatedQueueCursor({
        nextCursor: page.nextCursor,
        pageParams: params,
      })
        ? null
        : page.nextCursor;
    },
  });
  const settled = useInfiniteQuery({
    ...removalRequestsInfiniteQueryOptions({ memberId, state: "settled" }),
    getNextPageParam: (page, _pages, _param, params) => {
      return hasRepeatedQueueCursor({
        nextCursor: page.nextCursor,
        pageParams: params,
      })
        ? null
        : page.nextCursor;
    },
  });
  return {
    open,
    settled,
    counts:
      open.dataUpdatedAt >= settled.dataUpdatedAt
        ? open.data?.pages[0]
        : settled.data?.pages[0],
  };
}
