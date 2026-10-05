import type { QueryClient } from "@tanstack/react-query";
import { useMilestoneReconcileQueries } from "./useMilestoneReconcileQueries";
import { milestoneDetailQueryOptions } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import { milestoneMismatchesInfiniteQueryOptions } from "@/api/milestoneHelpers/milestoneItemsQueryHelpers";
import type { ListMilestoneMismatchesResponse } from "@memory-shoebox/shared";
import type {
  ReconcileOptions,
  ReconcileReads,
} from "./useMilestoneReconcile.types";
async function _refreshReconcileFromQueryOptions({
  queryClient,
  detailQueryOptions,
  mismatchesOptions,
}: Readonly<{
  queryClient: QueryClient;
  detailQueryOptions: ReturnType<typeof milestoneDetailQueryOptions>;
  mismatchesOptions: ReturnType<typeof milestoneMismatchesInfiniteQueryOptions>;
}>) {
  const [detail, pages] = await Promise.all([
    queryClient.fetchQuery({
      ...detailQueryOptions,
      staleTime: 0,
      retry: false,
    }),
    queryClient.fetchInfiniteQuery({
      ...mismatchesOptions,
      staleTime: 0,
      retry: false,
    }),
  ]);
  return { detail, pages };
}
function _getReconcileBatchFromPages(
  pages: readonly ListMilestoneMismatchesResponse[],
) {
  const rows = [
    ...new Map(
      pages
        .flatMap((page) => {
          return page.mismatches;
        })
        .map((row) => {
          return [row.item.itemId, row];
        }),
    ).values(),
  ];
  return {
    loadedCount: rows.length,
    strays: rows.slice(0, 500).map(({ item }) => {
      return {
        itemId: item.itemId,
        media: item.media,
        capturedOn: item.capturedOn,
      };
    }),
  };
}
/** Member-scoped authority and explicit paged rows, capped at 500 per batch. */
export function useMilestoneReconcileReads(
  options: Readonly<ReconcileOptions>,
): ReconcileReads {
  const {
    queryClient,
    detailQueryOptions,
    mismatchesOptions,
    detailQuery,
    mismatchesQuery,
  } = useMilestoneReconcileQueries(options);
  const detail = detailQuery.data ?? options.detail;
  const { strays, loadedCount } = _getReconcileBatchFromPages(
    mismatchesQuery.data?.pages ?? [],
  );
  const wideningSpan = mismatchesQuery.data?.pages[0]?.wideningSpan;
  const hasUsableReads =
    detailQuery.isSuccess &&
    !detailQuery.isFetching &&
    mismatchesQuery.isSuccess &&
    !mismatchesQuery.isFetching;
  return {
    queryClient,
    detail,
    strays,
    wideningSpan,
    refresh: () => {
      return _refreshReconcileFromQueryOptions({
        queryClient,
        detailQueryOptions,
        mismatchesOptions,
      });
    },
    hasUsableReads,
    detailQueryOptions,
    mismatchesOptions,
    isReading: detailQuery.isFetching || mismatchesQuery.isFetching,
    hasReadError: detailQuery.isError || mismatchesQuery.isError,
    hasMore: mismatchesQuery.hasNextPage && loadedCount < 500,
    loadMore: () => {
      if (loadedCount < 500) {
        void mismatchesQuery.fetchNextPage();
      }
    },
  };
}
