import type { FastifyBaseLogger } from "fastify";

import {
  type CompleteUploadFileRequest,
  type UploadProblemCode,
} from "@memory-shoebox/shared";

import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { type IngestRendition } from "../ingestUploadFile/ingestUploadFile.types.ts";

import {
  type UploadFileRow,
  type UploadSessionRow,
} from "../uploadSessionAccessHelpers.ts";

import { type CompletedTransfer } from "../verifyUploadedObjects/verifyUploadedObjects.types.ts";

/** Inputs for _writeFailed. */
export type WriteFailedOptions = {
  transaction: DatabaseExecutor;
  context: CompleteContext;
  current: UploadFileRow;
  problemCode: UploadProblemCode;
  problemDetail: string | undefined;
};

/** Inputs for _writeDone. */
export type WriteDoneOptions = {
  transaction: DatabaseExecutor;
  context: CompleteContext;
  current: UploadFileRow;
  transfer: CompletedTransfer;
  renditions: IngestRendition[];
};

/** Inputs for completeUploadFile. */
export type CompleteUploadFileOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  session: UploadSessionRow;
  file: UploadFileRow;
  body: CompleteUploadFileRequest;
  now: string;
  logger: Pick<FastifyBaseLogger, "warn">;
};

/** Inputs for readCompleteUploadFileResponse. */
export type ReadCompleteUploadFileResponseOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  sessionId: string;
  fileId: string;
  didSettle: boolean;
  now: Date;
};

/** Everything one `complete` call needs, read before anything is written. */
export type CompleteContext = {
  database: DatabaseExecutor;
  b2: B2Client;
  session: UploadSessionRow;
  file: UploadFileRow;
  now: string;
  logger: Pick<FastifyBaseLogger, "warn">;
};
