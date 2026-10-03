import type {
  CompleteUploadFileRequest,
  RenditionPurpose,
  UploadedRendition,
} from "@memory-shoebox/shared";
import type { B2Client, UploadedPart } from "../b2/client/client.ts";
import { ApiError } from "../http/ApiError.ts";
import { callBackblaze } from "./callBackblaze.ts";
import type { IngestRendition } from "./ingestUploadFile.ts";
import {
  DERIVATIVE_CONTENT_TYPE,
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

/** The reported derivatives, each once and each with its dimensions. */
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
  return derivatives.map((rendition) => {
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
  const width = body.width ?? file.width;
  const height = body.height ?? file.height;
  if (width === null || height === null) {
    throw ApiError.invalidRequest({
      width: ["A finished file needs its width and height, after orientation."],
    });
  }
  const parts = body.parts ?? null;
  if (
    file.multipart_upload_id !== null &&
    (parts === null || parts.length === 0)
  ) {
    throw ApiError.invalidRequest({
      parts: ["A multipart file needs the ETag of every part."],
    });
  }
  return {
    contentHash,
    byteSize: body.byteSize ?? null,
    parts: parts === null ? null : [...parts],
    width,
    height,
    durationMs: body.durationMs ?? file.duration_ms,
    renditions: _getReportedRenditions(body.renditions ?? []),
  };
}

/**
 * Closes a multipart upload. When Backblaze refuses, the object itself says
 * whether an earlier complete already did it and the answer was lost: the
 * upload id is gone by then, so every later complete would fail forever.
 */
async function _completeMultipartOriginal(options: {
  b2: B2Client;
  file: UploadFileRow;
  storageKey: string;
  uploadId: string;
  parts: readonly UploadedPart[];
}): Promise<void> {
  try {
    await options.b2.completeMultipart({
      key: options.storageKey,
      uploadId: options.uploadId,
      parts: options.parts,
    });
  } catch (error) {
    const head = await callBackblaze(() => {
      return options.b2.headObject({ key: options.storageKey });
    });
    if (head === null || head.sizeBytes !== options.file.declared_bytes) {
      throw Object.assign(ApiError.unavailable("upload_storage_unavailable"), {
        cause: error,
      });
    }
  }
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
    await _completeMultipartOriginal({
      b2,
      file,
      storageKey,
      uploadId: file.multipart_upload_id,
      parts: options.parts,
    });
    return null;
  }
  const head = await callBackblaze(() => {
    return b2.headObject({ key: storageKey });
  });
  if (head === null) {
    return "The original is not in the bucket.";
  }
  return head.sizeBytes === file.declared_bytes
    ? null
    : `The bucket holds ${head.sizeBytes} bytes of the original, not ${file.declared_bytes}.`;
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
