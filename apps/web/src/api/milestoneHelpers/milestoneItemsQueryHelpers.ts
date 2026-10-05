import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import {
  listMilestoneCandidatesResponseSchema,
  listMilestoneMismatchesResponseSchema,
  type ListMilestoneCandidatesResponse,
  type ListMilestoneMismatchesResponse,
} from "@memory-shoebox/shared";
import { infiniteQueryOptions, type InfiniteData } from "@tanstack/react-query";
/** Visible span candidates, with member authority isolated in the cache. */
export function makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity(
  options: Readonly<{ memberId: string; milestoneId: string }>,
): ReturnType<
  typeof infiniteQueryOptions<
    ListMilestoneCandidatesResponse,
    Error,
    InfiniteData<ListMilestoneCandidatesResponse, string | undefined>,
    string[],
    string | undefined
  >
> {
  const basePath = `/milestones/${encodeURIComponent(options.milestoneId)}/candidates`;
  const query = new URLSearchParams({ scope: "span" }).toString();
  return infiniteQueryOptions({
    queryKey: ["milestones", "candidates", options.memberId, basePath, query],
    queryFn: ({ pageParam, signal }) => {
      const searchParams = new URLSearchParams(query);
      if (pageParam !== undefined) {
        searchParams.set("cursor", pageParam);
      }
      return apiFetch({
        path: makePathFromSearchParams({ basePath, searchParams }),
        schema: listMilestoneCandidatesResponseSchema,
        init: { signal },
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.nextCursor ?? undefined;
    },
  });
}

/** Pending mismatches and the server's full-set widening span. */
export function makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity(
  options: Readonly<{ memberId: string; milestoneId: string }>,
): ReturnType<
  typeof infiniteQueryOptions<
    ListMilestoneMismatchesResponse,
    Error,
    InfiniteData<ListMilestoneMismatchesResponse, string | undefined>,
    string[],
    string | undefined
  >
> {
  const basePath = `/milestones/${encodeURIComponent(options.milestoneId)}/mismatches`;
  const query = new URLSearchParams().toString();
  return infiniteQueryOptions({
    queryKey: ["milestones", "mismatches", options.memberId, basePath, query],
    queryFn: ({ pageParam, signal }) => {
      const searchParams = new URLSearchParams(query);
      if (pageParam !== undefined) {
        searchParams.set("cursor", pageParam);
      }
      return apiFetch({
        path: makePathFromSearchParams({ basePath, searchParams }),
        schema: listMilestoneMismatchesResponseSchema,
        init: { signal },
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.nextCursor ?? undefined;
    },
  });
}
