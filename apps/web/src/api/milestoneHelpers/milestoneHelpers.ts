import {
  deleteMilestoneResponseSchema,
  type DeleteMilestoneResponse,
} from "@memory-shoebox/shared";
import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";
import type {
  CreateMilestoneBody,
  MilestoneDetailResponse,
  UpdateMilestoneBody,
} from "./milestoneHelpers.types";
import {
  createMilestoneBodySchema,
  milestoneDetailResponseSchema,
  updateMilestoneBodySchema,
} from "./milestoneSchemas.constants";

/** Persists an occasion on explicit submission, before upload attachment. */
export function createMilestone(
  body: Readonly<CreateMilestoneBody>,
): Promise<MilestoneDetailResponse> {
  return apiFetch({
    path: "/milestones",
    schema: milestoneDetailResponseSchema,
    init: jsonInit({
      method: "POST",
      body: createMilestoneBodySchema.parse(body),
    }),
  });
}
/** Changes only the occasion; widening never changes a manifest file. */
export function updateMilestone(
  options: Readonly<{ milestoneId: string; body: UpdateMilestoneBody }>,
): Promise<MilestoneDetailResponse> {
  return apiFetch({
    path: `/milestones/${encodeURIComponent(options.milestoneId)}`,
    schema: milestoneDetailResponseSchema,
    init: jsonInit({
      method: "PATCH",
      body: updateMilestoneBodySchema.parse(options.body),
    }),
  });
}

/** Deletes the occasion and returns its detached count, retaining items. */
export function deleteMilestone(
  milestoneId: string,
): Promise<DeleteMilestoneResponse> {
  return apiFetch({
    path: `/milestones/${encodeURIComponent(milestoneId)}`,
    schema: deleteMilestoneResponseSchema,
    init: { method: "DELETE" },
  });
}
