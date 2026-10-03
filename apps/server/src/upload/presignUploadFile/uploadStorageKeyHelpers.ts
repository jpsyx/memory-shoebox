import type { RenditionPurpose } from "@memory-shoebox/shared";

import { appConfig } from "../../../../../app.config.ts";

import type { MakeUploadStorageKeyFromRenditionOptions } from "./presignUploadFile.types.ts";

/**
 * Every derivative is a JPEG. The spike found WebKit silently answering a
 * WebP request with a PNG 5.7 times the size, so the engine encodes JPEG and
 * this is the type every derivative PUT is signed with.
 */
export const DERIVATIVE_CONTENT_TYPE = "image/jpeg";

/** The extension an original is stored under, one per accepted type. */
const ORIGINAL_EXTENSION_BY_TYPE: ReadonlyMap<string, string> = new Map(
  Object.entries({
    "image/jpeg": "jpg",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/quicktime": "mov",
    "video/mp4": "mp4",
  } satisfies Record<
    (typeof appConfig.upload.acceptedContentTypes)[number],
    string
  >),
);

/**
 * The derivatives the browser makes and uploads beside an original. v1
 * transcodes no video (Ruling 1), so there is no `video_*` here.
 *
 * Shared by everything that must know every key a transfer may have written:
 * the retry, which takes them back out of the deletion queue, and the
 * orphan cleanup, which puts them in. One list, so they cannot drift.
 */
export const DERIVATIVE_PURPOSES: readonly RenditionPurpose[] = [
  "display",
  "thumb",
  "poster",
] as const;

/** A presign acts on a row that has not finished, failed or been refused. */
export const PRESIGNABLE_FILE_STATES: ReadonlySet<string> = new Set([
  "waiting",
  "sending",
]);

/**
 * How many parts a multipart original is cut into: one per
 * `multipartPartSizeBytes`, the last taking what is left.
 *
 * The presign signs this many, and `complete` accepts exactly this many back,
 * so the two read one rule.
 *
 * @param byteSize The original's declared size in bytes.
 */
export function getPartCountFromByteSize(byteSize: number): number {
  return Math.ceil(byteSize / appConfig.upload.multipartPartSizeBytes);
}

/**
 * The deterministic key one rendition of one file is stored at.
 *
 * `uploads/<sessionId>/<fileId>/<purpose>.<ext>` (design decision 3): the
 * declared type's extension for the original, `jpg` for every derivative.
 * The key is never in a payload; the signed URL embedding it is the one
 * unavoidable exposure.
 *
 * @param options.sessionId The session.
 * @param options.fileId The file.
 * @param options.purpose Which rendition.
 * @param options.declaredContentType The file's declared type.
 */
export function makeUploadStorageKeyFromRendition(
  options: Readonly<MakeUploadStorageKeyFromRenditionOptions>,
): string {
  const extension =
    options.purpose === "original"
      ? (ORIGINAL_EXTENSION_BY_TYPE.get(
          options.declaredContentType.toLowerCase(),
        ) ?? "bin")
      : "jpg";
  return `uploads/${options.sessionId}/${options.fileId}/${options.purpose}.${extension}`;
}

/** The pattern `makeUploadStorageKeyFromRendition` writes. */
const UPLOAD_STORAGE_KEY_PATTERN = /^uploads\/([^/]+)\/([^/]+)\/[^/]+$/;

/**
 * The session and file an upload key was made for, or undefined for any other
 * key.
 *
 * The inverse of `makeUploadStorageKeyFromRendition` on its ids: the purpose
 * and extension are not read. It lets a reader of the bare key (the deletion
 * drain) find the row the key belongs to.
 *
 * @param storageKey Any object key.
 */
export function getUploadFileRefFromStorageKey(
  storageKey: string,
): { sessionId: string; fileId: string } | undefined {
  const [, sessionId, fileId] =
    UPLOAD_STORAGE_KEY_PATTERN.exec(storageKey) ?? [];
  return sessionId === undefined || fileId === undefined
    ? undefined
    : { sessionId, fileId };
}
