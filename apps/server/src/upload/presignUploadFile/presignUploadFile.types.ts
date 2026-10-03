import type { FastifyBaseLogger } from "fastify";

import type {
  PresignUploadFileResponse,
  RenditionPurpose,
} from "@memory-shoebox/shared";

import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import {
  type UploadFileRow,
  type UploadSessionRow,
} from "../uploadSessionAccessHelpers.ts";

/** Inputs for makeUploadStorageKeyFromRendition. */
export type MakeUploadStorageKeyFromRenditionOptions = {
  sessionId: string;
  fileId: string;
  purpose: RenditionPurpose;
  declaredContentType: string;
};

/** Inputs for _cancelDuplicate. */
export type CancelDuplicateOptions = {
  transaction: DatabaseExecutor;
  file: UploadFileRow;
  holder: HashHolder;
  now: string;
};

/** Inputs for _openMultipart. */
export type OpenMultipartOptions = {
  context: PresignContext;
  storageKey: string;
  partCount: number;
  partNumbers: number[];
};

/** Inputs for _resignParts. */
export type ResignPartsOptions = {
  context: PresignContext;
  storageKey: string;
  uploadId: string;
  partNumbers: number[];
};

/** Inputs for _markPresigned. */
export type MarkPresignedOptions = {
  transaction: DatabaseExecutor;
  context: PresignContext;
  signed: SignedOriginal;
  file: UploadFileRow;
};

/** Inputs for presignUploadFile. */
export type PresignUploadFileOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  session: UploadSessionRow;
  file: UploadFileRow;
  input: PresignInput;
  now: Date;
  logger: Pick<FastifyBaseLogger, "warn">;
};

/**
 * What one presign asks for, once the route has parsed it.
 *
 * `contentHash` and `byteSize` describe the original even when `purpose` is
 * a derivative: a derivative rides the original's presign.
 */
export type PresignInput = {
  contentHash: string;
  byteSize: number;
  purpose: RenditionPurpose;
  partNumbers: number[] | undefined;
};

/** The original's signed URLs, and the row values that go with them. */
export type SignedOriginal = {
  response: PresignUploadFileResponse;
  storageKey: string;
  multipartUploadId: string | undefined;
  /** Set only when this call opened the upload, so a failure can abort it. */
  openedUploadId: string | undefined;
};

/** Another row of the same session that already holds these bytes. */
export type HashHolder = {
  fileId: string;
  originalFilename: string;
};

/** The fixed inputs of one presign. */
export type PresignContext = {
  database: DatabaseExecutor;
  b2: B2Client;
  session: UploadSessionRow;
  file: UploadFileRow;
  input: PresignInput;
  expiresAt: string;
  now: string;
  logger: Pick<FastifyBaseLogger, "warn">;
};
