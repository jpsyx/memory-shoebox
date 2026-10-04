import { useEffect } from "react";
import type { RemovalQueueQuery } from "./removalQueueHelpers";
/** An empty advancing page is a continuation, never a terminal empty state. */
export function useQueueContinuation(query: Readonly<RemovalQueueQuery>): void {
  const { data, hasNextPage, isFetching, isError, fetchNextPage } = query;
  const lastPage = data?.pages.at(-1);
  useEffect(() => {
    if (
      lastPage?.removalRequests.length === 0 &&
      hasNextPage &&
      !isFetching &&
      !isError
    ) {
      void fetchNextPage();
    }
  }, [lastPage, hasNextPage, isFetching, isError, fetchNextPage]);
}
