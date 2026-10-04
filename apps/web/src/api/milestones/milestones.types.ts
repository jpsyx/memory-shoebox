import type { z } from "zod";
import type {
  createMilestoneBodySchema,
  updateMilestoneBodySchema,
  milestoneDetailResponseSchema,
  milestoneListResponseSchema,
} from "./milestoneSchemas.constants";

/** Narrow upload-facing creation contract, pending shared step 7a schemas. */
export type CreateMilestoneBody = z.infer<typeof createMilestoneBodySchema>;
/** Occasion field delta, pending shared step 7a schemas. */
export type UpdateMilestoneBody = z.infer<typeof updateMilestoneBodySchema>;
/** Validated post-write occasion detail. */
export type MilestoneDetailResponse = z.infer<
  typeof milestoneDetailResponseSchema
>;
/** Validated directory with per-viewer counts. */
export type MilestoneListResponse = z.infer<typeof milestoneListResponseSchema>;
