import type { RenditionPurpose } from "@memory-shoebox/shared";

import type {
  B2Client,
  UploadedPart,
} from "../../b2/createB2Client/createB2Client.types.ts";

import type { IngestRendition } from "../ingestUploadFile/ingestUploadFile.types.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

/** Inputs for _completeMultipartOriginal. */
export type CompleteMultipartOriginalOptions = {
  b2: B2Client;
  file: UploadFileRow;
  storageKey: string;
  uploadId: string;
  parts: UploadedPart[];
};

/** Inputs for _verifyOriginal. */
export type VerifyOriginalOptions = {
  b2: B2Client;
  file: UploadFileRow;
  storageKey: string;
  parts: UploadedPart[];
};

/** Inputs for _getContentProblems. */
export type GetContentProblemsOptions = {
  b2: B2Client;
  file: UploadFileRow;
  storageKey: string;
  transfer: CompletedTransfer;
};

/** One derivative the browser says it uploaded, with its own dimensions. */
export type ReportedRendition = {
  purpose: RenditionPurpose;
  byteSize: number;
  width: number;
  height: number;
};

/** What the browser reported for a `done` file, once its shape is checked. */
export type CompletedTransfer = {
  contentHash: string;
  byteSize: number | undefined;
  parts: UploadedPart[] | undefined;
  width: number;
  height: number;
  durationMs: number | undefined;
  renditions: ReportedRendition[];
};

/** What Backblaze confirmed, or why the file has to fail. */
export type VerificationResult =
  | { isVerified: true; renditions: IngestRendition[] }
  | {
      isVerified: false;
      problemCode: "checksum_mismatch" | "content_mismatch";
      problemDetail: string;
    };
