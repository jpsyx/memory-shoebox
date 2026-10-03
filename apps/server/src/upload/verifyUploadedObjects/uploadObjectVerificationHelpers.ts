import type {
  UploadedPart,
  B2Client,
} from "../../b2/createB2Client/createB2Client.types.ts";

import { ApiError } from "../../http/ApiError.ts";

import { callBackblaze } from "../callBackblaze.ts";

import type { IngestRendition } from "../ingestUploadFile/ingestUploadFile.types.ts";

import {
  DERIVATIVE_CONTENT_TYPE,
  makeUploadStorageKeyFromRendition,
} from "../presignUploadFile/uploadStorageKeyHelpers.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import type {
  CompleteMultipartOriginalOptions,
  VerifyOriginalOptions,
  ReportedRendition,
  CompletedTransfer,
  GetContentProblemsOptions,
} from "./verifyUploadedObjects.types.ts";

/** Why the stored original is not the declared size, or null when it is. */
function _getOriginalSizeProblem(options: {
  sizeBytes: number;
  file: UploadFileRow;
}): string | undefined {
  return options.sizeBytes === options.file.declared_bytes
    ? undefined
    : `The bucket holds ${options.sizeBytes} bytes of the original, not ${options.file.declared_bytes}.`;
}

/** `HEAD` the original and compare it with the declared size. */
async function _checkStoredOriginal(options: {
  b2: B2Client;
  file: UploadFileRow;
  storageKey: string;
}): Promise<string | undefined> {
  const head = await callBackblaze(() => {
    return options.b2.headObject({ key: options.storageKey });
  });
  return head === undefined
    ? "The original is not in the bucket."
    : _getOriginalSizeProblem({
        sizeBytes: head.sizeBytes,
        file: options.file,
      });
}

/**
 * Closes a multipart upload, or returns why it never can be.
 *
 * A refusal that cannot change is a problem with the file. Any other
 * failure leaves the object to say whether an earlier complete already did
 * it and the answer was lost: the upload id is gone by then, so every later
 * complete would fail forever. A whole object is fine and a wrong-sized one
 * is a problem with the file.
 *
 * **A complete that succeeds is checked the same way**, with a `HEAD`
 * against the declared size, as a single PUT is: Backblaze assembles
 * whatever parts it is handed, so parts cut from the wrong slices of a file
 * make an object it accepts and the catalog must not.
 *
 * With no object at all, the answer is 503 and the row stays `sending`,
 * whatever the error was, `NoSuchUpload` included: a second complete can
 * arrive while the first is still assembling a large file, after Backblaze
 * has consumed the upload id and before the object exists, and failing the
 * row then would abort the upload and lose a file that is landing. A truly
 * vanished upload is left to the abandon sweep.
 */
async function _completeMultipartOriginal(
  options: Readonly<Omit<CompleteMultipartOriginalOptions, "parts">> &
    Readonly<{ parts: readonly UploadedPart[] }>,
): Promise<string | undefined> {
  try {
    await options.b2.completeMultipart({
      key: options.storageKey,
      uploadId: options.uploadId,
      parts: options.parts,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (
        new Set<string>([
          "InvalidPart",
          "InvalidPartOrder",
          "EntityTooSmall",
        ]) satisfies ReadonlySet<string>
      ).has(error.name)
    ) {
      return `Backblaze could not assemble the original from its parts (${error.name}).`;
    }
    const head = await callBackblaze(() => {
      return options.b2.headObject({ key: options.storageKey });
    });
    if (head === undefined) {
      throw Object.assign(ApiError.unavailable("upload_storage_unavailable"), {
        cause: error,
      });
    }
    return _getOriginalSizeProblem({
      sizeBytes: head.sizeBytes,
      file: options.file,
    });
  }
  return _checkStoredOriginal(options);
}

/** The original is whole in the bucket, or the reason it is not. */
async function _verifyOriginal(
  options: Readonly<Omit<VerifyOriginalOptions, "parts">> &
    Readonly<{ parts: readonly UploadedPart[] }>,
): Promise<string | undefined> {
  const { b2, file, storageKey } = options;
  if (file.multipart_upload_id !== null) {
    return _completeMultipartOriginal({
      b2,
      file,
      storageKey,
      uploadId: file.multipart_upload_id,
      parts: options.parts,
    });
  }
  return _checkStoredOriginal({ b2, file, storageKey });
}

/** One reported derivative is in the bucket at its size, or the reason not. */
async function _verifyDerivative(options: {
  b2: B2Client;
  file: UploadFileRow;
  rendition: ReportedRendition;
}): Promise<string | undefined> {
  const { b2, file, rendition } = options;
  const key = makeUploadStorageKeyFromRendition({
    sessionId: file.upload_session_id,
    fileId: file.id,
    purpose: rendition.purpose,
    declaredContentType: file.declared_content_type,
  });
  const head = await callBackblaze(() => {
    return b2.headObject({ key });
  });
  return head === undefined
    ? `The ${rendition.purpose} copy was reported and is not in the bucket.`
    : head.sizeBytes === rendition.byteSize
      ? undefined
      : `The bucket holds ${head.sizeBytes} bytes of the ${rendition.purpose} copy, not ${rendition.byteSize}.`;
}

/** Every verified object as the rendition row ingest writes for it. */
export function makeVerifiedRenditions(
  options: Readonly<{
    file: UploadFileRow;
    storageKey: string;
    transfer: CompletedTransfer;
  }>,
): IngestRendition[] {
  const { file, transfer } = options;
  return [
    {
      purpose: "original",
      storageKey: options.storageKey,
      contentType: file.declared_content_type,
      byteSize: file.declared_bytes,
      width: transfer.width,
      height: transfer.height,
    },
    ...transfer.renditions.map((rendition) => {
      return {
        purpose: rendition.purpose,
        storageKey: makeUploadStorageKeyFromRendition({
          sessionId: file.upload_session_id,
          fileId: file.id,
          purpose: rendition.purpose,
          declaredContentType: file.declared_content_type,
        }),
        contentType: DERIVATIVE_CONTENT_TYPE,
        byteSize: rendition.byteSize,
        width: rendition.width,
        height: rendition.height,
      };
    }),
  ];
}

/**
 * Every way the bucket disagrees with the report: the original first, then,
 * only if it is whole, every reported derivative in parallel.
 */
export async function getContentProblems(
  options: Readonly<GetContentProblemsOptions>,
): Promise<string[]> {
  const { b2, file } = options;
  const originalProblem = await _verifyOriginal({
    b2,
    file,
    storageKey: options.storageKey,
    parts: options.transfer.parts ?? [],
  });
  if (originalProblem !== undefined) {
    return [originalProblem];
  }
  const derivativeProblems = await Promise.all(
    options.transfer.renditions.map((rendition) => {
      return _verifyDerivative({ b2, file, rendition });
    }),
  );
  return derivativeProblems.flatMap((problem) => {
    return problem === undefined ? [] : [problem];
  });
}
