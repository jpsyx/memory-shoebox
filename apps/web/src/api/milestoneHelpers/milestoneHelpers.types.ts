import type {
  CreateMilestoneRequest,
  ListMilestonesResponse,
  MilestoneDetail,
  UpdateMilestoneRequest,
} from "@memory-shoebox/shared";

/** Shared creation contract; upload calls omit optional landed item ids. */
export type CreateMilestoneBody = CreateMilestoneRequest;
/** Shared field delta; the server validates against the stored span. */
export type UpdateMilestoneBody = UpdateMilestoneRequest;
/** Validated occasion detail with per-viewer authority and counts. */
export type MilestoneDetailResponse = MilestoneDetail;
/** Validated occasion directory page with per-viewer counts. */
export type MilestoneListResponse = ListMilestonesResponse;
