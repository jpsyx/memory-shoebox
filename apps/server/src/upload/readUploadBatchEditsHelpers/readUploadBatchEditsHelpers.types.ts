import type { DatabaseExecutor } from "../../db/types/db.types.ts";

/** Inputs for _readEditDtos. */
export type ReadEditDtosOptions = {
  database: DatabaseExecutor;
  sessionId: string;
  editId?: string;
  isPlanOpen: boolean;
};

/** Inputs for readUploadBatchEditById. */
export type ReadUploadBatchEditByIdOptions = {
  database: DatabaseExecutor;
  sessionId: string;
  editId: string;
  isPlanOpen: boolean;
};

/** One edit with whatever it names, before its targets are counted. */
export type EditRow = {
  editId: string;
  kind: string;
  labelSnapshot: string | null;
  createdAt: string;
  undoneAt: string | null;
  appliedAt: string | null;
  tagId: string | null;
  tagName: string | null;
  personId: string | null;
  personName: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  milestoneStartsOn: string | null;
  milestoneEndsOn: string | null;
  milestoneBlurb: string | null;
};
