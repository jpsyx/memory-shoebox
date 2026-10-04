import { apiFetch, jsonInit } from "@/api/clientHelpers/clientHelpers";
import {
  createMilestoneBodySchema,
  milestoneDetailResponseSchema,
  updateMilestoneBodySchema,
} from "./milestoneSchemas.constants";
import type {
  CreateMilestoneBody,
  MilestoneDetailResponse,
  UpdateMilestoneBody,
} from "./milestones.types";

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
