import type { FastifyBaseLogger } from "fastify";

import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

/** Inputs for abortMultipartUploads. */
export type AbortMultipartUploadsOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  uploads: MultipartUploadRef[];
  logger?: Pick<FastifyBaseLogger, "warn">;
};

/** One open multipart upload, and the row that holds its id. */
export type MultipartUploadRef = {
  fileId: string;
  storageKey: string;
  multipartUploadId: string;
};
