import { makeMilestoneDetailQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type {
  DeleteMilestoneResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import type { MilestoneSearch } from "../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
const MILESTONE_ROUTE = getRouteApi("/_app/milestones") satisfies ReturnType<
  typeof getRouteApi<"/_app/milestones">
>;
type Navigation = {
  search: MilestoneSearch;
  deleted: DeleteMilestoneResponse | undefined;
  onNavigate: (address: MilestoneSearch) => void;
  onSaved: (detail: MilestoneDetail) => void;
  onDeleted: (result: DeleteMilestoneResponse) => void;
};
/** Address transitions consume confirmed write results and cache the detail. */
export function useMilestoneNavigation(viewer: Readonly<Viewer>): Navigation {
  const search = MILESTONE_ROUTE.useSearch();
  const navigate = MILESTONE_ROUTE.useNavigate();
  const queryClient = useQueryClient();
  const [deleted, setDeleted] = useState<DeleteMilestoneResponse>();
  const onNavigate = (address: MilestoneSearch) => {
    void navigate({ search: address });
  };
  const onSaved = (detail: MilestoneDetail) => {
    queryClient.setQueryData(
      makeMilestoneDetailQueryOptionsFromIdentity({
        memberId: viewer.memberId,
        milestoneId: detail.milestone.milestoneId,
      }).queryKey,
      detail,
    );
    onNavigate(
      search.mode === "create"
        ? { milestone: detail.milestone.milestoneId, mode: "created" }
        : detail.mismatchCount > 0
          ? { milestone: detail.milestone.milestoneId, mode: "fix" }
          : {},
    );
  };
  const onDeleted = (result: DeleteMilestoneResponse) => {
    setDeleted(result);
    onNavigate({});
  };
  return { search, deleted, onNavigate, onSaved, onDeleted };
}
