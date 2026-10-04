import type { z } from "zod";
import type {
  createMilestoneBodySchema,
  milestoneDetailResponseSchema,
  milestoneListResponseSchema,
  updateMilestoneBodySchema,
} from "./milestoneSchemas.constants";

/** Narrow upload-facing creation contract, pending shared schemas. */
export type CreateMilestoneBody = z.infer<typeof createMilestoneBodySchema>;
/** Occasion field delta, pending shared schemas. */
export type UpdateMilestoneBody = z.infer<typeof updateMilestoneBodySchema>;
/** Validated post-write occasion detail. */
export type MilestoneDetailResponse = z.infer<
  typeof milestoneDetailResponseSchema
>;
/** Validated directory with per-viewer counts. */
export type MilestoneListResponse = z.infer<typeof milestoneListResponseSchema>;
