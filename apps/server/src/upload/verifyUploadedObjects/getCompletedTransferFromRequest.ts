import type {
  CompleteUploadFileRequest,
  RenditionPurpose,
  UploadedRendition,
} from "@memory-shoebox/shared";

import { appConfig } from "../../../../../app.config.ts";

import type { UploadedPart } from "../../b2/createB2Client/createB2Client.types.ts";

import { ApiError } from "../../http/ApiError.ts";

import { getPartCountFromByteSize } from "../presignUploadFile/uploadStorageKeyHelpers.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import type {
  ReportedRendition,
  CompletedTransfer,
} from "./verifyUploadedObjects.types.ts";

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
    return !(
      new Set<RenditionPurpose>([
        "display",
        "thumb",
        "poster",
      ]) satisfies ReadonlySet<RenditionPurpose>
    ).has(purpose);
  });
  if (isUnknown || new Set(purposes).size !== purposes.length) {
    throw ApiError.invalidRequest({
      renditions: ["Report display, thumb and poster at most once each."],
    });
  }
  const maxBytes = appConfig.upload.derivatives.maxBytes;
  return derivatives.map((rendition) => {
    return _makeReportedRenditionFromUploadRendition({ rendition, maxBytes });
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
  const sentWidth = body.width ?? undefined;
  const sentHeight = body.height ?? undefined;
  if ((sentWidth === undefined) !== (sentHeight === undefined)) {
    throw ApiError.invalidRequest({
      [sentWidth === undefined ? "width" : "height"]: [
        "Send the width and the height together, or neither.",
      ],
    });
  }
  const width = sentWidth ?? file.width ?? undefined;
  const height = sentHeight ?? file.height ?? undefined;
  if (width === undefined || height === undefined) {
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
}): UploadedPart[] | undefined {
  const { body, file } = options;
  const parts = body.parts ?? undefined;
  if (file.multipart_upload_id === null) {
    return parts === undefined ? undefined : [...parts];
  }
  const partCount = getPartCountFromByteSize(file.declared_bytes);
  const isExactlyTheSignedParts =
    parts !== undefined &&
    parts.length === partCount &&
    parts.every((part, index) => {
      return part.partNumber === index + 1 && part.etag.trim().length > 0;
    });
  if (parts === undefined || !isExactlyTheSignedParts) {
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
export function getCompletedTransferFromRequest(
  options: Readonly<{
    body: Readonly<CompleteUploadFileRequest>;
    file: Readonly<UploadFileRow>;
  }>,
): CompletedTransfer {
  const { body, file } = options;
  const contentHash = body.contentHash ?? undefined;
  if (contentHash === undefined) {
    throw ApiError.invalidRequest({
      contentHash: ["A finished file needs the hash it was presigned with."],
    });
  }
  const { width, height } = _getDimensionsFromRequest({ body, file });
  const parts = _getPartsFromRequest({ body, file });
  return {
    contentHash,
    byteSize: body.byteSize ?? undefined,
    parts,
    width,
    height,
    durationMs: body.durationMs ?? file.duration_ms ?? undefined,
    renditions: _getReportedRenditions(body.renditions ?? []),
  };
}

// Validate one reported derivative and return its normalized dimensions.
function _makeReportedRenditionFromUploadRendition(options: {
  rendition: UploadedRendition;
  maxBytes: number;
}): ReportedRendition {
  const { rendition, maxBytes } = options;
  if (rendition.byteSize > maxBytes) {
    throw ApiError.invalidRequest({
      renditions: [
        `The ${rendition.purpose} copy is over the ${maxBytes}-byte limit for a derivative.`,
      ],
    });
  }
  const width = rendition.width ?? undefined;
  const height = rendition.height ?? undefined;
  if (width === undefined || height === undefined) {
    throw ApiError.invalidRequest({
      renditions: [`The ${rendition.purpose} copy needs its width and height.`],
    });
  }
  return {
    purpose: rendition.purpose,
    byteSize: rendition.byteSize,
    width,
    height,
  };
}
