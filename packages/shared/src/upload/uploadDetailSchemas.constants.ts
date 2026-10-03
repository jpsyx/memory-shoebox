import { z } from "zod";

import { cursorSchema } from "../collectionSchema.ts";

import {
  calendarDateSchema,
  idSchema,
  mediaRefSchema,
  memberRefSchema,
  milestoneRefSchema,
  personRefSchema,
  tagRefSchema,
  timestampSchema,
  visibilitySummarySchema,
} from "../dtos.ts";

import {
  uploadSessionStateSchema,
  countSchema,
  byteCountSchema,
  contentHashSchema,
  uploadFileStateSchema,
  uploadProblemCodeSchema,
  captureSourceSchema,
  uploadEditKindSchema,
} from "./uploadValueSchemas.constants.ts";

/** The batch, as every upload route that returns one describes it. */
export const uploadSessionSummarySchema = z.object({
  sessionId: idSchema,
  state: uploadSessionStateSchema,
  uploadedBy: memberRefSchema,
  visibility: visibilitySummarySchema,
  /** Diagnostic only. Capture dates resolve in `shoebox.timezone`. */
  clientTimezone: z.string(),
  /** Snapshotted at commit; 0 on a draft with no manifest yet. */
  fileCount: countSchema,
  /** Excludes refused rows. A number, never "5.2 GB": the browser formats. */
  totalBytes: byteCountSchema,
  createdAt: timestampSchema,
  committedAt: timestampSchema.nullable(),
  settledAt: timestampSchema.nullable(),
  lastActivityAt: timestampSchema,
  /** Written by the mail fan-out; null until then. */
  notifiedAt: timestampSchema.nullable(),
  notifiedMemberCount: countSchema.nullable(),
});

/** The batch, as every upload route that returns one describes it. */
export type UploadSessionSummary = z.infer<typeof uploadSessionSummarySchema>;

/**
 * Every figure here is a `GROUP BY` over a few hundred rows. None is a
 * column.
 */
export const uploadProgressSchema = z.object({
  waitingCount: countSchema,
  sendingCount: countSchema,
  doneCount: countSchema,
  failedCount: countSchema,
  refusedCount: countSchema,
  cancelledCount: countSchema,
  /** Sum of declared bytes over done files. Whole files only. */
  doneBytes: byteCountSchema,
});

/** Every figure here is a `GROUP BY` over a few hundred rows. */
export type UploadProgress = z.infer<typeof uploadProgressSchema>;

/** One manifest row, as the surface draws it. */
export const uploadFileDtoSchema = z.object({
  fileId: idSchema,
  position: z.number().int().nonnegative(),
  originalFilename: z.string(),
  declaredContentType: z.string(),
  declaredBytes: byteCountSchema,
  contentHash: contentHashSchema.nullable(),
  state: uploadFileStateSchema,
  attemptCount: countSchema,
  problemCode: uploadProblemCodeSchema.nullable(),
  /** English, for the admin's eye. Never the primary UI copy. */
  problemDetail: z.string().nullable(),
  capturedAt: timestampSchema.nullable(),
  capturedOn: calendarDateSchema.nullable(),
  captureOffsetMinutes: z.number().int().nullable(),
  captureSource: captureSourceSchema.nullable(),
  itemId: idSchema.nullable(),
  /** Null until ingest makes the renditions. */
  media: mediaRefSchema.nullable(),
});

/** One manifest row, as the surface draws it. */
export type UploadFileDto = z.infer<typeof uploadFileDtoSchema>;

/** One day of the batch, where its files will land in the archive. */
export const uploadDayGroupSchema = z.object({
  capturedOn: calendarDateSchema,
  fileCount: countSchema,
  /** From the edit plan before ingest, from `item_milestones` after. */
  milestones: z.array(milestoneRefSchema),
});

/** One day of the batch. */
export type UploadDayGroup = z.infer<typeof uploadDayGroupSchema>;

/** One bulk action from "What you have added". */
export const uploadBatchEditDtoSchema = z.object({
  editId: idSchema,
  kind: uploadEditKindSchema,
  /** The resolved name when there is a row, else `label_snapshot`. */
  label: z.string(),
  /** Null while the tag exists only as a `label_snapshot`. */
  tag: tagRefSchema.nullable(),
  person: personRefSchema.nullable(),
  milestone: milestoneRefSchema.nullable(),
  /** The "on 12 of 264" figure. */
  targetCount: countSchema,
  createdAt: timestampSchema,
  undoneAt: timestampSchema.nullable(),
  appliedAt: timestampSchema.nullable(),
  canUndo: z.boolean(),
});

/** One bulk action from "What you have added". */
export type UploadBatchEditDto = z.infer<typeof uploadBatchEditDtoSchema>;

/** A file named with the day it will land on, for the two groups below. */
const datedFileRefSchema = z.object({
  fileId: idSchema,
  originalFilename: z.string(),
  capturedOn: calendarDateSchema,
});

/** The `milestone-fix` state: attached, but captured outside the span. */
export const uploadMismatchGroupSchema = z.object({
  milestone: milestoneRefSchema,
  files: z.array(datedFileRefSchema),
});

/** The `milestone-fix` state: attached, but captured outside the span. */
export type UploadMismatchGroup = z.infer<typeof uploadMismatchGroupSchema>;

/**
 * "These did not say when they were taken": the files that reached rung 4
 * or rung 6 of the ladder (design decision 9).
 */
export const uploadUndatedGroupSchema = z.object({
  fileCount: countSchema,
  /** The rung the server fell back to for every one of them. */
  captureSource: captureSourceSchema,
  files: z.array(datedFileRefSchema),
});

/** "These did not say when they were taken." */
export type UploadUndatedGroup = z.infer<typeof uploadUndatedGroupSchema>;

/** A file still to come, for resume's "these 64 are still to come". */
export const pendingFileRefSchema = z.object({
  fileId: idSchema,
  originalFilename: z.string(),
  declaredBytes: byteCountSchema,
});

/** A file still to come. */
export type PendingFileRef = z.infer<typeof pendingFileRefSchema>;

/**
 * The whole of the `done` state. Nothing here is stored except
 * `notifiedMemberCount`.
 */
export const uploadOutcomeSummarySchema = z.object({
  itemCount: countSchema,
  dayCount: countSchema,
  milestoneCount: countSchema,
  burstCount: countSchema,
  burstFrameCount: countSchema,
  notifiedMemberCount: countSchema.nullable(),
});

/** The whole of the `done` state. */
export type UploadOutcomeSummary = z.infer<typeof uploadOutcomeSummarySchema>;

/**
 * `GET /api/upload-sessions/:sessionId`, `GET .../current` and
 * `POST .../commit`: the batch, its plan, and one page of its files.
 */
export const uploadSessionDetailSchema = uploadSessionSummarySchema.extend({
  progress: uploadProgressSchema,
  days: z.array(uploadDayGroupSchema),
  edits: z.array(uploadBatchEditDtoSchema),
  mismatches: z.array(uploadMismatchGroupSchema),
  undated: uploadUndatedGroupSchema.nullable(),
  /** Resume: what is still to come. First 100; page `files` for the rest. */
  pendingFiles: z.array(pendingFileRefSchema),
  /** Non-null once settled. */
  summary: uploadOutcomeSummarySchema.nullable(),
  files: z.array(uploadFileDtoSchema),
  /** Encodes `upload_files.position`. Null means the end. */
  nextCursor: cursorSchema.nullable(),
});

/** The batch, its plan, and one page of its files. */
export type UploadSessionDetail = z.infer<typeof uploadSessionDetailSchema>;
