import {
  createMilestoneRequestSchema,
  listMilestonesResponseSchema,
  milestoneDetailSchema,
  milestoneSummarySchema as sharedMilestoneSummarySchema,
  updateMilestoneRequestSchema,
} from "@memory-shoebox/shared";

/** Shared directory row under the established upload helper name. */
export const milestoneSummarySchema = sharedMilestoneSummarySchema;
/** Shared post-write detail under the established upload helper name. */
export const milestoneDetailResponseSchema = milestoneDetailSchema;
/** Shared directory page under the established upload helper name. */
export const milestoneListResponseSchema = listMilestonesResponseSchema;
/** Shared creation body; pre-ingest upload callers omit landed item ids. */
export const createMilestoneBodySchema = createMilestoneRequestSchema;
/** Shared delta body; the server validates the resulting stored span. */
export const updateMilestoneBodySchema = updateMilestoneRequestSchema;
