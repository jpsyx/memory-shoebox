import {
  getJpegQualityFromEncoder,
  isWebKitImageEncoder,
  type PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import type { ImageDerivativesResult } from "./makeImageDerivativesFromFile.types";

import { getDecodeSizeFromPlan } from "./getDecodeSizeFromPlan";

import { getDerivativePlanFromSize } from "./getDerivativePlanFromSize";

import { decodeImage, encodeEach } from "./makeImageDerivativesSupportHelpers";

/**
 * A photograph's `display` and `thumb` JPEGs, made in the worker.
 *
 * **A derivative that cannot be made is dropped, never
 * thrown**: the file still uploads with a shorter renditions list, and
 * `MediaRef` resolves the missing purpose to the original (Ruling 1). The
 * result's `dropDetail` says why, so a caller can tell a drop from a skip.
 *
 *
 * @param options.file The picked image.
 * @param options.contentType Its declared type.
 * @param options.size Its post-orientation size from the header, if known.
 */
export async function makeImageDerivativesFromFile(
  options: Readonly<{
    file: Blob;
    contentType: string;
    size: PixelSize | undefined;
  }>,
): Promise<ImageDerivativesResult> {
  // Decode once at the largest needed derivative size when the header supplies
  // dimensions, then draw each derivative from that bitmap.

  const plan = getDerivativePlanFromSize(options);
  if (plan.length === 0) {
    return {
      derivatives: [],
      usedWasmDecoder: false,
      originalSize: options.size,
    };
  }
  const attempt = await decodeImage({
    ...options,
    decodeSize: getDecodeSizeFromPlan({ size: options.size, plan }),
    plan,
  });
  if (attempt.kind === "failed") {
    return {
      derivatives: [],
      usedWasmDecoder: attempt.usedWasmDecoder,
      originalSize: options.size,
      dropDetail: attempt.dropDetail,
    };
  }
  const { bitmap } = attempt.image;
  try {
    return await _makeDerivativesFromDecodedBitmap({ options, attempt, plan });
  } finally {
    bitmap.close();
  }
}

/** Encodes the derivative plan from a decoded bitmap. */
async function _makeDerivativesFromDecodedBitmap(
  input: Readonly<{
    options: Parameters<typeof makeImageDerivativesFromFile>[0];
    attempt: Extract<
      Awaited<ReturnType<typeof decodeImage>>,
      { kind: "decoded" }
    >;
    plan: ReturnType<typeof getDerivativePlanFromSize>;
  }>,
): Promise<ImageDerivativesResult> {
  const { options, attempt, plan } = input;
  const { bitmap, originalSize } = attempt.image;

  // With no header size the plan is made again from the decoded one.
  const decodedPlan =
    options.size === undefined
      ? getDerivativePlanFromSize({
          contentType: options.contentType,
          size: originalSize,
        })
      : plan;
  const quality = getJpegQualityFromEncoder(await isWebKitImageEncoder());
  const { derivatives, droppedPurposes } = await encodeEach({
    bitmap,
    plan: decodedPlan,
    quality,
  });
  return {
    derivatives,
    usedWasmDecoder: attempt.usedWasmDecoder,
    originalSize,
    ...(droppedPurposes.length === 0
      ? {}
      : {
          dropDetail: `the browser could not encode the JPEG for: ${droppedPurposes.join(", ")}`,
        }),
  };
}
