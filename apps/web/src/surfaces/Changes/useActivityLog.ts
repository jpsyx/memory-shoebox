import { activityFamilyLabel } from "./activityFamilyLabel";
import { isObservationAuthorityError } from "@/surfaces/Observations/isObservationAuthorityError";
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
  readError: Error | null;
  title: string;
} {
  const query = useInfiniteQuery(activityQueryOptions(filters));
  const entries =
    query.data?.pages.flatMap((page) => {
      return page.activity;
    }) ?? [];
  const hasFilters = Object.values(filters).some((value) => {
    return value !== undefined;
  });
  const readError =
    query.isFetchNextPageError && !isObservationAuthorityError(query.error)
      ? null
      : query.error;
  const title =
    filters.family === undefined
      ? "Everything, newest first"
      : activityFamilyLabel(filters.family);
  return { query, entries, hasFilters, readError, title };
}
