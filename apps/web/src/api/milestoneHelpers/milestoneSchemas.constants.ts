import {
  createMilestoneRequestSchema,
  listMilestonesResponseSchema,
  milestoneDetailSchema,
  milestoneSummarySchema as sharedMilestoneSummarySchema,
  updateMilestoneRequestSchema,
} from "@memory-shoebox/shared";
/** Shared directory row under the established upload helper name. */
export const milestoneSummarySchema =
  sharedMilestoneSummarySchema satisfies typeof sharedMilestoneSummarySchema;
/** Shared post-write detail under the established upload helper name. */
export const milestoneDetailResponseSchema =
  milestoneDetailSchema satisfies typeof milestoneDetailSchema;
/** Shared directory page under the established upload helper name. */
export const milestoneListResponseSchema =
  listMilestonesResponseSchema satisfies typeof listMilestonesResponseSchema;
/** Shared creation body; pre-ingest upload callers omit landed item ids. */
export const createMilestoneBodySchema =
  createMilestoneRequestSchema satisfies typeof createMilestoneRequestSchema;
/** Shared delta body; the server validates the resulting stored span. */
export const updateMilestoneBodySchema =
  updateMilestoneRequestSchema satisfies typeof updateMilestoneRequestSchema;
