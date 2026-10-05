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
import { makeActivityQueryOptionsFromFilters } from "@/api/observationHelpers/observationHelpers";
type ActivityLogState = {
  query: UseInfiniteQueryResult<
    InfiniteData<ActivityResponse, string | undefined>,
    Error
  >;
  entries: ActivityEntryDto[];
  hasFilters: boolean;
  readError: Error | undefined;
  title: string;
};

/** Reads cursor pages and exposes the accumulated history in server order. */
export function useActivityLog(
  filters: Readonly<Omit<ActivityRequest, "cursor" | "limit">>,
): ActivityLogState {
  const query = useInfiniteQuery(makeActivityQueryOptionsFromFilters(filters));
  const entries =
    query.data?.pages.flatMap((page) => {
      return page.activity;
    }) ?? [];
  const hasFilters = Object.values(filters).some((value) => {
    return value !== undefined;
  });
  const readError =
    query.isFetchNextPageError &&
    !isObservationAuthorityError(query.error ?? undefined)
      ? undefined
      : (query.error ?? undefined);
  const title =
    filters.family === undefined
      ? "Everything, newest first"
      : activityFamilyLabel(filters.family);
  return { query, entries, hasFilters, readError, title };
}
