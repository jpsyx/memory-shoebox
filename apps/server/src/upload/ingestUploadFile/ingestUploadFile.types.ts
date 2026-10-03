import type { RenditionPurpose, UploadEditKind } from "@memory-shoebox/shared";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import type {
  UploadFileRow,
  UploadSessionRow,
} from "../uploadSessionAccessHelpers.ts";

/** Result for _getIngestCapture. */
export type GetIngestCaptureResult = {
  kind: "photo" | "video";
  capturedAt: string;
  captureDate: string;
  captureSource: string;
  originalCapturedAt: string;
};

/** Inputs for _insertItem. */
export type InsertItemOptions = {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  file: UploadFileRow;
  dimensions: IngestDimensions;
  now: string;
};

/** Inputs for _getTagIdsByEditId. */
export type GetTagIdsByEditIdOptions = {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  edits: PendingEdit[];
  now: string;
};

/** Inputs for _makeNewPeople. */
export type MakeNewPeopleOptions = {
  labelled: LabelledPersonEdit[];
  neededNames: Set<string>;
  personIdByName: Map<string, string>;
  createdBy: string;
  now: string;
};

/** Inputs for _getPersonIdByName. */
export type GetPersonIdByNameOptions = {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  labelled: LabelledPersonEdit[];
  neededNames: Set<string>;
  now: string;
};

/** Inputs for _getPersonIdsByEditId. */
export type GetPersonIdsByEditIdOptions = {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  edits: PendingEdit[];
  now: string;
};

/** Inputs for _applyEditPlan. */
export type ApplyEditPlanOptions = {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  fileId: string;
  itemId: string;
  now: string;
};

/** Inputs for ingestUploadFile. */
export type IngestUploadFileOptions = {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  file: UploadFileRow;
  dimensions: IngestDimensions;
  renditions: IngestRendition[];
  now: string;
};

/**
 * One object Backblaze confirmed, as the `item_renditions` row it becomes.
 * A key, never a URL: a URL is a short-lived signed thing minted at render.
 */
export type IngestRendition = {
  purpose: RenditionPurpose;
  storageKey: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
};

/** The intrinsic facts `complete` reported, post-orientation. */
export type IngestDimensions = {
  width: number;
  height: number;
  durationMs: number | undefined;
};

/** One live edit that targets the file being ingested. */
export type PendingEdit = {
  editId: string;
  kind: UploadEditKind;
  tagId: string | undefined;
  personId: string | undefined;
  milestoneId: string | undefined;
  labelSnapshot: string | undefined;
};

/** A person edit of this batch that came with a typed name. */
export type LabelledPersonEdit = {
  editId: string;
  label: string;
  personId: string | undefined;
};

/** One new item's links, and who made them when. */
export type ItemLinks = {
  transaction: DatabaseExecutor;
  itemId: string;
  memberId: string;
  now: string;
  tagIds: string[];
  personIds: string[];
  milestoneIds: string[];
};
