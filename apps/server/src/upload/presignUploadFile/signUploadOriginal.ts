import { appConfig } from "../../../../../app.config.ts";

import type { SignedPart } from "../../b2/createB2Client/createB2Client.types.ts";

import { ApiError } from "../../http/ApiError.ts";

import { callBackblaze } from "../callBackblaze.ts";

import type {
  OpenMultipartOptions,
  ResignPartsOptions,
  PresignContext,
  SignedOriginal,
} from "./presignUploadFile.types.ts";

import {
  getPartCountFromByteSize,
  makeUploadStorageKeyFromRendition,
} from "./uploadStorageKeyHelpers.ts";

/** The parts to sign: all of them, or the ones asked for, in order. */
function _getWantedPartNumbers(options: {
  requested: readonly number[] | undefined;
  partCount: number;
}): number[] {
  if (options.requested === undefined) {
    return Array.from({ length: options.partCount }, (_unused, index) => {
      return index + 1;
    });
  }
  const isOutOfRange = options.requested.some((partNumber) => {
    return (
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > options.partCount
    );
  });
  if (options.requested.length === 0 || isOutOfRange) {
    throw ApiError.invalidRequest({
      partNumbers: [`This file's parts run from 1 to ${options.partCount}.`],
    });
  }
  return [...new Set(options.requested)].sort((left, right) => {
    return left - right;
  });
}

/** Opens the upload and keeps the URLs for the parts asked for. */
async function _openMultipart(
  options: Readonly<Omit<OpenMultipartOptions, "partNumbers">> &
    Readonly<{ partNumbers: readonly number[] }>,
): Promise<{ uploadId: string; openedUploadId: string; parts: SignedPart[] }> {
  const { context } = options;
  const started = await callBackblaze(() => {
    return context.b2.presignMultipart({
      key: options.storageKey,
      contentType: context.file.declared_content_type,
      partCount: options.partCount,
      expiresInSeconds: appConfig.upload.presignTtlSeconds,
    });
  });
  return {
    uploadId: started.uploadId,
    openedUploadId: started.uploadId,
    parts: options.partNumbers.flatMap((partNumber) => {
      const url = started.partUrls[partNumber - 1];
      return url === undefined ? [] : [{ partNumber, url }];
    }),
  };
}

/** Keeps the open upload's id and signs fresh URLs for the parts asked for. */
async function _resignParts(
  options: Readonly<Omit<ResignPartsOptions, "partNumbers">> &
    Readonly<{ partNumbers: readonly number[] }>,
): Promise<{
  uploadId: string;
  openedUploadId: undefined;
  parts: SignedPart[];
}> {
  const parts = await callBackblaze(() => {
    return options.context.b2.signParts({
      key: options.storageKey,
      uploadId: options.uploadId,
      partNumbers: options.partNumbers,
      expiresInSeconds: appConfig.upload.presignTtlSeconds,
    });
  });
  return { uploadId: options.uploadId, openedUploadId: undefined, parts };
}

/**
 * A multipart original: open it on the first presign, or keep its id and
 * sign only the parts still wanted on a re-presign (`upload.md` § When a
 * presigned URL expires), since `presignMultipart` always opens a new one.
 */
async function _signMultipartOriginal(options: {
  context: PresignContext;
  storageKey: string;
}): Promise<SignedOriginal> {
  const { context, storageKey } = options;
  const { file } = context;
  const partCount = getPartCountFromByteSize(file.declared_bytes);
  const partNumbers = _getWantedPartNumbers({
    requested: context.input.partNumbers,
    partCount,
  });
  const uploadId = file.multipart_upload_id;
  const signed =
    uploadId === null
      ? await _openMultipart({ context, storageKey, partCount, partNumbers })
      : await _resignParts({ context, storageKey, uploadId, partNumbers });
  return {
    storageKey,
    multipartUploadId: signed.uploadId,
    openedUploadId: signed.openedUploadId,
    response: {
      mode: "multipart",
      fileId: file.id,
      multipartUploadId: signed.uploadId,
      partSizeBytes: appConfig.upload.multipartPartSizeBytes,
      partCount,
      parts: signed.parts.map((part) => {
        return { ...part, expiresAt: context.expiresAt };
      }),
      method: "PUT",
      // The part URLs sign `host` alone; the type was set when the upload
      // opened.
      headers: {},
      expiresAt: context.expiresAt,
    },
  };
}

/** The original's URL or URLs, single or multipart by declared size. */
export async function signUploadOriginal(
  context: Readonly<PresignContext>,
): Promise<SignedOriginal> {
  const { file } = context;
  const storageKey = makeUploadStorageKeyFromRendition({
    sessionId: file.upload_session_id,
    fileId: file.id,
    purpose: "original",
    declaredContentType: file.declared_content_type,
  });
  if (file.declared_bytes >= appConfig.upload.multipartThresholdBytes) {
    return _signMultipartOriginal({ context, storageKey });
  }
  if (context.input.partNumbers !== undefined) {
    throw ApiError.invalidRequest({
      partNumbers: ["This file goes up in one PUT and has no parts."],
    });
  }
  const url = await callBackblaze(() => {
    return context.b2.presignPut({
      key: storageKey,
      contentType: file.declared_content_type,
      expiresInSeconds: appConfig.upload.presignTtlSeconds,
    });
  });
  return {
    storageKey,
    multipartUploadId: undefined,
    openedUploadId: undefined,
    response: {
      mode: "single",
      fileId: file.id,
      method: "PUT",
      url,
      headers: { "Content-Type": file.declared_content_type },
      expiresAt: context.expiresAt,
    },
  };
}
