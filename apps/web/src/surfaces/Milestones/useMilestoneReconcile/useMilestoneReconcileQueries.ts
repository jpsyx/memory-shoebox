import { makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestoneItemsQueryHelpers";
import { makeMilestoneDetailQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import type {
  ListMilestoneMismatchesResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from "@tanstack/react-query";
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
    InfiniteData<ListMilestoneMismatchesResponse, string | undefined>,
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
  const detailQueryOptions =
    makeMilestoneDetailQueryOptionsFromIdentity(identity);
  const mismatchesOptions =
    makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity(identity);
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
