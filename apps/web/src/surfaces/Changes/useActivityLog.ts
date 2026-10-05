import type {
  ActivityEntryDto,
  ActivityRequest,
  ActivityResponse,
} from "@memory-shoebox/shared";
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { activityQueryOptions } from "@/api/observations/observations";

/** Reads cursor pages and exposes the accumulated history in server order. */
export function useActivityLog(
  filters: Readonly<Omit<ActivityRequest, "cursor" | "limit">>,
): {
  query: UseInfiniteQueryResult<
    InfiniteData<ActivityResponse, string | undefined>,
    Error
  >;
  entries: ActivityEntryDto[];
  hasFilters: boolean;
} {
  const query = useInfiniteQuery(activityQueryOptions(filters));
  const entries =
    query.data?.pages.flatMap((page) => {
      return page.activity;
    }) ?? [];
  const hasFilters = Object.values(filters).some((value) => {
    return value !== undefined;
  });
  return { query, entries, hasFilters };
}
