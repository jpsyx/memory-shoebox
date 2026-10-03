import type {
  CompleteUploadFileRequest,
  RenditionPurpose,
  UploadedRendition,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client, UploadedPart } from "../b2/client/client.ts";
import { ApiError } from "../http/ApiError.ts";
import { callBackblaze } from "./callBackblaze.ts";
import type { IngestRendition } from "./ingestUploadFile.ts";
import {
  DERIVATIVE_CONTENT_TYPE,
  getPartCountFromByteSize,
  makeUploadStorageKeyFromRendition,
} from "./presignUploadFile.ts";
import type { UploadFileRow } from "./uploadSessionAccess.ts";

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
  byteSize: number | null;
  parts: UploadedPart[] | null;
  width: number;
  height: number;
  durationMs: number | null;
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

/** The derivatives the browser makes (Ruling 1). The original is implied. */
const DERIVATIVE_PURPOSES: ReadonlySet<RenditionPurpose> = new Set([
  "display",
  "thumb",
  "poster",
]);

/**
 * The reported derivatives, each once, each with its dimensions, and none
 * over `appConfig.upload.derivatives.maxBytes`: a derivative's URL cannot cap
 * what is PUT to it, so this is where the cap holds.
 */
function _getReportedRenditions(
  renditions: readonly UploadedRendition[],
): ReportedRendition[] {
  // An `original` entry is the file itself, verified on its own terms, so it
  // is dropped rather than refused.
  const derivatives = renditions.filter((rendition) => {
    return rendition.purpose !== "original";
  });
  const purposes = derivatives.map((rendition) => {
    return rendition.purpose;
  });
  const isUnknown = purposes.some((purpose) => {
    return !DERIVATIVE_PURPOSES.has(purpose);
  });
  if (isUnknown || new Set(purposes).size !== purposes.length) {
    throw ApiError.invalidRequest({
      renditions: ["Report display, thumb and poster at most once each."],
    });
  }
  const maxBytes = appConfig.upload.derivatives.maxBytes;
  return derivatives.map((rendition) => {
    if (rendition.byteSize > maxBytes) {
      throw ApiError.invalidRequest({
        renditions: [
          `The ${rendition.purpose} copy is over the ${maxBytes}-byte limit for a derivative.`,
        ],
      });
    }
    const width = rendition.width ?? null;
    const height = rendition.height ?? null;
    if (width === null || height === null) {
      throw ApiError.invalidRequest({
        renditions: [
          `The ${rendition.purpose} copy needs its width and height.`,
        ],
      });
    }
    return {
      purpose: rendition.purpose,
      byteSize: rendition.byteSize,
      width,
      height,
    };
  });
}

/**
 * The post-orientation size, from the call or else from the manifest, never
 * one side from each: a width measured one way beside a height measured
 * another is a size nothing has.
 */
function _getDimensionsFromRequest(options: {
  body: Readonly<CompleteUploadFileRequest>;
  file: Readonly<UploadFileRow>;
}): { width: number; height: number } {
  const { body, file } = options;
  const sentWidth = body.width ?? null;
  const sentHeight = body.height ?? null;
  if ((sentWidth === null) !== (sentHeight === null)) {
    throw ApiError.invalidRequest({
      [sentWidth === null ? "width" : "height"]: [
        "Send the width and the height together, or neither.",
      ],
    });
  }
  const width = sentWidth ?? file.width;
  const height = sentHeight ?? file.height;
  if (width === null || height === null) {
    throw ApiError.invalidRequest({
      width: ["A finished file needs its width and height, after orientation."],
    });
  }
  return { width, height };
}

/**
 * A multipart file's parts, exactly the ones the presign signed: 1 up to the
 * count its declared size is split into (`getPartCountFromByteSize`),
 * ascending, each once, each with an ETag. Anything else could only make
 * `completeMultipart` assemble a different object than the one declared.
 * A single-PUT file has no parts, and any sent are ignored.
 */
function _getPartsFromRequest(options: {
  body: Readonly<CompleteUploadFileRequest>;
  file: Readonly<UploadFileRow>;
}): UploadedPart[] | null {
  const { body, file } = options;
  const parts = body.parts ?? null;
  if (file.multipart_upload_id === null) {
    return parts === null ? null : [...parts];
  }
  const partCount = getPartCountFromByteSize(file.declared_bytes);
  const isExactlyTheSignedParts =
    parts !== null &&
    parts.length === partCount &&
    parts.every((part, index) => {
      return part.partNumber === index + 1 && part.etag.trim().length > 0;
    });
  if (parts === null || !isExactlyTheSignedParts) {
    throw ApiError.invalidRequest({
      parts: [
        `A multipart file needs parts 1 to ${partCount}, in order, each once and each with its ETag.`,
      ],
    });
  }
  return [...parts];
}

/**
 * A `done` body, checked for everything ingest needs, before any network.
 *
 * The hash is required, multipart needs its parts, and the dimensions come
 * from the call or else from the manifest: `items.width` is `NOT NULL`, and
 * the frozen `MediaSource` carries a positive width and height for every
 * purpose it serves.
 *
 * @param options.body The parsed `complete` body, `outcome: "done"`.
 * @param options.file The row it completes.
 */
export function getCompletedTransferFromRequest(options: {
  body: Readonly<CompleteUploadFileRequest>;
  file: Readonly<UploadFileRow>;
}): CompletedTransfer {
  const { body, file } = options;
  const contentHash = body.contentHash ?? null;
  if (contentHash === null) {
    throw ApiError.invalidRequest({
      contentHash: ["A finished file needs the hash it was presigned with."],
    });
  }
  const { width, height } = _getDimensionsFromRequest({ body, file });
  const parts = _getPartsFromRequest({ body, file });
  return {
    contentHash,
    byteSize: body.byteSize ?? null,
    parts,
    width,
    height,
    durationMs: body.durationMs ?? file.duration_ms,
    renditions: _getReportedRenditions(body.renditions ?? []),
  };
}

/**
 * Refusals that no retry can change: a part the upload does not hold, parts
 * out of order, or a part too small. Backblaze's S3 errors carry the code as
 * their `name`. Everything else, a timeout or a 5xx included, might pass on a
 * later call.
 */
const PERMANENT_COMPLETE_REFUSALS: ReadonlySet<string> = new Set([
  "InvalidPart",
  "InvalidPartOrder",
  "EntityTooSmall",
]);

/** Why the stored original is not the declared size, or null when it is. */
function _getOriginalSizeProblem(options: {
  sizeBytes: number;
  file: UploadFileRow;
}): string | null {
  return options.sizeBytes === options.file.declared_bytes
    ? null
    : `The bucket holds ${options.sizeBytes} bytes of the original, not ${options.file.declared_bytes}.`;
}

/** `HEAD` the original and compare it with the declared size. */
async function _checkStoredOriginal(options: {
  b2: B2Client;
  file: UploadFileRow;
  storageKey: string;
}): Promise<string | null> {
  const head = await callBackblaze(() => {
    return options.b2.headObject({ key: options.storageKey });
  });
  if (head === null) {
    return "The original is not in the bucket.";
  }
  return _getOriginalSizeProblem({
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
async function _completeMultipartOriginal(options: {
  b2: B2Client;
  file: UploadFileRow;
  storageKey: string;
  uploadId: string;
  parts: readonly UploadedPart[];
}): Promise<string | null> {
  try {
    await options.b2.completeMultipart({
      key: options.storageKey,
      uploadId: options.uploadId,
      parts: options.parts,
    });
  } catch (error) {
    if (error instanceof Error && PERMANENT_COMPLETE_REFUSALS.has(error.name)) {
      return `Backblaze could not assemble the original from its parts (${error.name}).`;
    }
    const head = await callBackblaze(() => {
      return options.b2.headObject({ key: options.storageKey });
    });
    if (head === null) {
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
async function _verifyOriginal(options: {
  b2: B2Client;
  file: UploadFileRow;
  storageKey: string;
  parts: readonly UploadedPart[];
}): Promise<string | null> {
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
}): Promise<string | null> {
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
  if (head === null) {
    return `The ${rendition.purpose} copy was reported and is not in the bucket.`;
  }
  return head.sizeBytes === rendition.byteSize
    ? null
    : `The bucket holds ${head.sizeBytes} bytes of the ${rendition.purpose} copy, not ${rendition.byteSize}.`;
}

/** Every verified object as the rendition row ingest writes for it. */
function _makeVerifiedRenditions(options: {
  file: UploadFileRow;
  storageKey: string;
  transfer: CompletedTransfer;
}): IngestRendition[] {
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
async function _getContentProblems(options: {
  b2: B2Client;
  file: UploadFileRow;
  storageKey: string;
  transfer: CompletedTransfer;
}): Promise<string[]> {
  const { b2, file } = options;
  const originalProblem = await _verifyOriginal({
    b2,
    file,
    storageKey: options.storageKey,
    parts: options.transfer.parts ?? [],
  });
  if (originalProblem !== null) {
    return [originalProblem];
  }
  const derivativeProblems = await Promise.all(
    options.transfer.renditions.map((rendition) => {
      return _verifyDerivative({ b2, file, rendition });
    }),
  );
  return derivativeProblems.flatMap((problem) => {
    return problem === null ? [] : [problem];
  });
}

/**
 * Every Backblaze check `complete` makes, and **only** those: call it before
 * any transaction opens (design decision 2).
 *
 * The hash and size are compared with what was presigned first, with no
 * network, which is `checksum_mismatch`. Then the original:
 * `completeMultipart` with the browser's ETags for a multipart file, or
 * `headObject` against the declared size. Then one `headObject` per
 * reported derivative, in parallel. A size that disagrees or an object that
 * is missing is `content_mismatch`; a call Backblaze cannot answer throws
 * `503 upload_storage_unavailable`, and the caller leaves the row `sending`.
 *
 * @param options.b2 The Backblaze client.
 * @param options.file The row being completed, in state `sending`.
 * @param options.transfer What the browser reported.
 * @returns The renditions to ingest, original first, or the problem.
 */
export async function verifyUploadedObjects(options: {
  b2: B2Client;
  file: UploadFileRow;
  transfer: CompletedTransfer;
}): Promise<VerificationResult> {
  const { b2, file, transfer } = options;
  const isSizeWrong =
    transfer.byteSize !== null && transfer.byteSize !== file.declared_bytes;
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
  const problems = await _getContentProblems({
    b2,
    file,
    storageKey,
    transfer,
  });
  if (problems.length > 0) {
    return {
      isVerified: false,
      problemCode: "content_mismatch",
      problemDetail: problems.join(" "),
    };
  }
  return {
    isVerified: true,
    renditions: _makeVerifiedRenditions({ file, storageKey, transfer }),
  };
}
