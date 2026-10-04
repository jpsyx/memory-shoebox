import {
  listMilestoneCandidatesResponseSchema,
  listMilestoneMismatchesResponseSchema,
  type ListMilestoneCandidatesResponse,
  type ListMilestoneMismatchesResponse,
} from "@memory-shoebox/shared";
import { infiniteQueryOptions, type InfiniteData } from "@tanstack/react-query";
import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";

/** Visible span candidates, with member authority isolated in the cache. */
export function milestoneCandidatesInfiniteQueryOptions(
  options: Readonly<{ memberId: string; milestoneId: string }>,
): ReturnType<
  typeof infiniteQueryOptions<
    ListMilestoneCandidatesResponse,
    Error,
    InfiniteData<ListMilestoneCandidatesResponse, string | null>,
    string[],
    string | null
  >
> {
  const basePath = `/milestones/${encodeURIComponent(options.milestoneId)}/candidates`;
  const query = new URLSearchParams({ scope: "span" }).toString();
  return infiniteQueryOptions({
    queryKey: ["milestones", "candidates", options.memberId, basePath, query],
    queryFn: ({ pageParam, signal }) => {
      const searchParams = new URLSearchParams(query);
      if (pageParam !== null) {
        searchParams.set("cursor", pageParam);
      }
      return apiFetch({
        path: makePathFromSearchParams({ basePath, searchParams }),
        schema: listMilestoneCandidatesResponseSchema,
        init: { signal },
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      return lastPage.nextCursor;
    },
  });
}

/** Pending mismatches and the server's full-set widening span. */
export function milestoneMismatchesInfiniteQueryOptions(
  options: Readonly<{ memberId: string; milestoneId: string }>,
): ReturnType<
  typeof infiniteQueryOptions<
    ListMilestoneMismatchesResponse,
    Error,
    InfiniteData<ListMilestoneMismatchesResponse, string | null>,
    string[],
    string | null
  >
> {
  const basePath = `/milestones/${encodeURIComponent(options.milestoneId)}/mismatches`;
  const query = new URLSearchParams().toString();
  return infiniteQueryOptions({
    queryKey: ["milestones", "mismatches", options.memberId, basePath, query],
    queryFn: ({ pageParam, signal }) => {
      const searchParams = new URLSearchParams(query);
      if (pageParam !== null) {
        searchParams.set("cursor", pageParam);
      }
      return apiFetch({
        path: makePathFromSearchParams({ basePath, searchParams }),
        schema: listMilestoneMismatchesResponseSchema,
        init: { signal },
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      return lastPage.nextCursor;
    },
  });
}
