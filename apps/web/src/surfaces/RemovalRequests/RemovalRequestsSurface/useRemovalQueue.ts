import { makeRemovalRequestsInfiniteQueryOptionsFromQueueScope } from "@/api/removalsHelpers/removalsQueryHelpers";
import type { ListRemovalRequestsResponse } from "@memory-shoebox/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  hasRepeatedQueueCursor,
  type RemovalQueueQuery,
} from "./removalQueueHelpers";
/**
 * Both member-scoped tabs follow advancing cursors and preserve server counts.
 */
export function useRemovalQueue(memberId: string): {
  open: RemovalQueueQuery;
  settled: RemovalQueueQuery;
  counts: ListRemovalRequestsResponse | undefined;
} {
  const open = useInfiniteQuery({
    ...makeRemovalRequestsInfiniteQueryOptionsFromQueueScope({
      memberId,
      state: "open",
    }),
    getNextPageParam: (page, _pages, _param, params) => {
      return hasRepeatedQueueCursor({
        nextCursor: page.nextCursor ?? undefined,
        pageParams: params,
      })
        ? undefined
        : (page.nextCursor ?? undefined);
    },
  });
  const settled = useInfiniteQuery({
    ...makeRemovalRequestsInfiniteQueryOptionsFromQueueScope({
      memberId,
      state: "settled",
    }),
    getNextPageParam: (page, _pages, _param, params) => {
      return hasRepeatedQueueCursor({
        nextCursor: page.nextCursor ?? undefined,
        pageParams: params,
      })
        ? undefined
        : (page.nextCursor ?? undefined);
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
