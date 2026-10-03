import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import type {
  CompletedTransfer,
  VerificationResult,
} from "./verifyUploadedObjects.types.ts";

import {
  getContentProblems,
  makeVerifiedRenditions,
} from "./uploadObjectVerificationHelpers.ts";

/**
 * Verifies the presigned checksum, declared sizes, original and reported
 * derivatives before any transaction opens.
 *
 * A reported hash or size inconsistent with presign is checksum_mismatch. A
 * stored size mismatch or missing object is content_mismatch. Unavailable
 * storage throws 503 upload_storage_unavailable; the caller must leave the row
 * sending.
 *
 * @param options.b2 The Backblaze client.
 * @param options.file The row being completed, in state `sending`.
 * @param options.transfer What the browser reported.
 * @returns The renditions to ingest, original first, or the problem.
 */
export async function verifyUploadedObjects(
  options: Readonly<{
    b2: B2Client;
    file: UploadFileRow;
    transfer: CompletedTransfer;
  }>,
): Promise<VerificationResult> {
  // Complete multipart originals with the browser ETags, or HEAD a single
  // original. HEAD reported derivatives in parallel to verify their stored
  // sizes.

  const { b2, file, transfer } = options;
  const isSizeWrong =
    transfer.byteSize !== undefined &&
    transfer.byteSize !== file.declared_bytes;
  if (transfer.contentHash !== file.content_hash || isSizeWrong) {
    return {
      isVerified: false,
      problemCode: "checksum_mismatch",
      problemDetail:
        "The hash or the size is not what this file was presigned with.",
    };
  }
  const storageKey = file.storage_key;
  if (storageKey === null) {
    return {
      isVerified: false,
      problemCode: "content_mismatch",
      problemDetail: "This file was never given a place in the bucket.",
    };
  }
  const problems = await getContentProblems({
    b2,
    file,
    storageKey,
    transfer,
  });
  return problems.length > 0
    ? {
        isVerified: false,
        problemCode: "content_mismatch",
        problemDetail: problems.join(" "),
      }
    : {
        isVerified: true,
        renditions: makeVerifiedRenditions({ file, storageKey, transfer }),
      };
}
