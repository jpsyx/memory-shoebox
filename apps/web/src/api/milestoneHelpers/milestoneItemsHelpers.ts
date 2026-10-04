import {
  reconcileMilestoneRequestSchema,
  reconcileMilestoneResponseSchema,
  setMilestoneItemsRequestSchema,
  setMilestoneItemsResponseSchema,
  type ReconcileMilestoneRequest,
  type ReconcileMilestoneResponse,
  type SetMilestoneItemsRequest,
  type SetMilestoneItemsResponse,
} from "@memory-shoebox/shared";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";

/** Applies a landed-item attachment delta without replacing other joins. */
export function setMilestoneItems(
  options: Readonly<{ milestoneId: string; body: SetMilestoneItemsRequest }>,
): Promise<SetMilestoneItemsResponse> {
  return apiFetch({
    path: `/milestones/${encodeURIComponent(options.milestoneId)}/items`,
    schema: setMilestoneItemsResponseSchema,
    init: jsonInit({
      method: "PATCH",
      body: setMilestoneItemsRequestSchema.parse(options.body),
    }),
  });
}

/** Moves capture days or acknowledges visible out-of-span attachments. */
export function reconcileMilestone(
  options: Readonly<{ milestoneId: string; body: ReconcileMilestoneRequest }>,
): Promise<ReconcileMilestoneResponse> {
  return apiFetch({
    path: `/milestones/${encodeURIComponent(options.milestoneId)}/reconcile`,
    schema: reconcileMilestoneResponseSchema,
    init: jsonInit({
      method: "POST",
      body: reconcileMilestoneRequestSchema.parse(options.body),
    }),
  });
}
