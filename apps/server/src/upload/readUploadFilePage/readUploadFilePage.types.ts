import type {
  MediaSource,
  UploadFileDto,
  UploadFileState,
} from "@memory-shoebox/shared";

import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

/** Inputs for _readMediaLookups. */
export type ReadMediaLookupsOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  now: Date;
  itemIds: string[];
};

/** Inputs for _readMediaByItemId. */
export type ReadMediaByItemIdOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  now: Date;
  fileRows: UploadFileRow[];
};

/** Inputs for readUploadFileDtos. */
export type ReadUploadFileDtosOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  fileRows: UploadFileRow[];
  now: Date;
};

/** Inputs for readUploadFilePage. */
export type ReadUploadFilePageOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  sessionId: string;
  now: Date;
  page: UploadFilePageRequest;
};

/** One page of the embedded file list, as the session detail asks for it. */
export type UploadFilePageRequest = {
  limit: number;
  /**
   * Opaque, from a previous page's `nextCursor`. Undefined for the first page.
   */
  cursor: string | undefined;
  /** Undefined means every state. */
  states: UploadFileState[] | undefined;
};

/** One page of files, and where the next one starts. */
export type UploadFilePage = {
  files: UploadFileDto[];
  nextCursor: string | undefined;
};

/** What one page's files are read with. */
export type FileRowFilter = {
  sessionId: string;
  afterPosition?: number;
  states: UploadFileState[] | undefined;
  limit: number;
};

/** The item columns a landed file's `MediaRef` is composed from. */
export type ItemMediaRow = {
  itemId: string;
  capturedAt: string;
  durationMs: number | undefined;
  altText: string | undefined;
};

/** The four reads a set of rows' media costs, keyed by their item ids. */
export type MediaLookups = {
  items: Map<string, ItemMediaRow>;
  sources: Map<string, Map<string, MediaSource>>;
  peopleNames: Map<string, string[]>;
  timezone: string;
};
