import { createFileRoute } from "@tanstack/react-router";
import { MilestonesSurface } from "@/surfaces/Milestones/MilestonesSurface/MilestonesSurface";
import { MilestoneAddressError } from "@/surfaces/Milestones/MilestoneAddressError";
import { getMilestoneSearchFromUnknown } from "@/surfaces/Milestones/getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
/** Address-backed occasion flow, with invalid search refusing all writes. */
export const Route = createFileRoute("/_app/milestones")({
  validateSearch: getMilestoneSearchFromUnknown,
  staticData: { hasOwnBar: true },
  errorComponent: MilestoneAddressError,
  component: MilestonesSurface,
});
