import type {
  ImageDerivativesOptions,
  ImageDerivativesResult,
} from "./makeImageDerivativesFromFile.types";
import {
  getJpegQualityFromEncoder,
  isWebKitImageEncoder,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import { getDecodeSizeFromPlan } from "./getDecodeSizeFromPlan";

import { getDerivativePlanFromSize } from "./getDerivativePlanFromSize";

import { decodeImage, encodeEach } from "./makeImageDerivativesSupportHelpers";

/** Encodes the derivative plan from a decoded bitmap. */
async function _makeDerivativesFromDecodedBitmap(
  options: Readonly<{
    options: Parameters<typeof makeImageDerivativesFromFile>[0];
    attempt: Extract<
      Awaited<ReturnType<typeof decodeImage>>,
      { kind: "decoded" }
    >;
    plan: ReturnType<typeof getDerivativePlanFromSize>;
  }>,
): Promise<ImageDerivativesResult> {
  const { options: derivativeOptions, attempt, plan } = options;
  const { bitmap, originalSize } = attempt.image;

  // With no header size the plan is made again from the decoded one.
  const decodedPlan =
    derivativeOptions.size === undefined
      ? getDerivativePlanFromSize({
          ...derivativeOptions,
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

/**
 * A photograph's `display` and `thumb` JPEGs, made in the worker.
 *
 * **A derivative that cannot be made is dropped, never
 * thrown**: the file still uploads with a shorter renditions list. Serving
 * may use an original photo only when it meets the requested size and byte
 * budgets. The result's `dropDetail` distinguishes a drop from a skip.
 *
 *
 * @param options.file The picked image.
 * @param options.contentType Its declared type.
 * @param options.size Its post-orientation size from the header, if known.
 * @param options.purposes The requested sizes; defaults to display and thumb.
 */
export async function makeImageDerivativesFromFile(
  options: Readonly<ImageDerivativesOptions>,
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
