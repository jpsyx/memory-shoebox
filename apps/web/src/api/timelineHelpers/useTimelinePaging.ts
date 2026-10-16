import {
  useQueryClient,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";

/** The guarded callbacks used by both timeline scroll boundaries. */
export type TimelinePaging = {
  onReachEnd: () => void;
  onReachStart: () => void;
};

/**
 * Shares the query's actual fetch slot across older, newer and refresh reads.
 * Reading state at invocation also excludes two calls before React rerenders.
 */
export function useTimelinePaging(
  options: Readonly<{
    queryKey: readonly string[];
    stream: Pick<
      UseInfiniteQueryResult,
      "hasNextPage" | "hasPreviousPage" | "fetchNextPage" | "fetchPreviousPage"
    >;
  }>,
): TimelinePaging {
  const queryClient = useQueryClient();
  const fetchPage = (direction: "older" | "newer") => {
    if (
      queryClient.getQueryState(options.queryKey)?.fetchStatus === "fetching"
    ) {
      return;
    }
    if (direction === "older" && options.stream.hasNextPage) {
      void options.stream.fetchNextPage({ cancelRefetch: false });
    } else if (direction === "newer" && options.stream.hasPreviousPage) {
      void options.stream.fetchPreviousPage({ cancelRefetch: false });
    }
  };
  return {
    onReachEnd: () => {
      return fetchPage("older");
    },
    onReachStart: () => {
      return fetchPage("newer");
    },
  };
}
