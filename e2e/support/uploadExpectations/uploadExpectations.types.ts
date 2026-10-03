import type { FakeS3Request } from "../createFakeS3Server/createFakeS3Server.types.ts";

import { type UploadedFileRecord } from "../uploadCatalogHelpers.ts";

import { type UploadProofState } from "../uploadHarnessHelpers.ts";

/** Inputs for expectTheTransferPaths. */
export type ExpectTheTransferPathsOptions = {
  sessionId: string;
  files: UploadedFileRecord[];
  requests: FakeS3Request[];
  multipartBytes: number;
};

/** Inputs for expectTheDuplicateSkipped. */
export type ExpectTheDuplicateSkippedOptions = {
  sessionId: string;
  proof: UploadProofState;
  files: UploadedFileRecord[];
  requests: FakeS3Request[];
};
