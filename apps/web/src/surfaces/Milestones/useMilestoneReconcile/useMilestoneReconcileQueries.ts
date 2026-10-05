import {
  useQueryClient,
  useQuery,
  useInfiniteQuery,
  type UseQueryResult,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  MilestoneDetail,
  ListMilestoneMismatchesResponse,
} from "@memory-shoebox/shared";
import { milestoneDetailQueryOptions } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import { milestoneMismatchesInfiniteQueryOptions } from "@/api/milestoneHelpers/milestoneItemsQueryHelpers";
import type {
  ReconcileOptions,
  ReconcileReads,
} from "./useMilestoneReconcile.types";
type Queries = Pick<
  ReconcileReads,
  "queryClient" | "detailQueryOptions" | "mismatchesOptions"
> & {
  detailQuery: UseQueryResult<MilestoneDetail, Error>;
  mismatchesQuery: UseInfiniteQueryResult<
    InfiniteData<ListMilestoneMismatchesResponse, string | null>,
    Error
  >;
};
/** Observes only member-scoped detail and mismatch authority for this fix. */
export function useMilestoneReconcileQueries(
  options: Readonly<ReconcileOptions>,
): Queries {
  const queryClient = useQueryClient();
  const identity = {
    memberId: options.viewer.memberId,
    milestoneId: options.detail.milestone.milestoneId,
  };
  const detailQueryOptions = milestoneDetailQueryOptions(identity);
  const mismatchesOptions = milestoneMismatchesInfiniteQueryOptions(identity);
  const detailQuery = useQuery({ ...detailQueryOptions, retry: false });
  const mismatchesQuery = useInfiniteQuery({
    ...mismatchesOptions,
    retry: false,
  });
  return {
    queryClient,
    detailQueryOptions,
    mismatchesOptions,
    detailQuery,
    mismatchesQuery,
  };
}
