import {
  getTargetSizeFromLongEdge,
  type PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import type { DerivativeTarget } from "./makeImageDerivativesFromFile.types";

/**
 * The size to ask the decoder for, or undefined to decode at native size.
 *
 * The largest planned target, because one decode serves every derivative, and
 * undefined when that is not a shrink at all: resizing to the native size buys
 * nothing and costs a resample.
 */
export function getDecodeSizeFromPlan(
  options: Readonly<{
    size: PixelSize | undefined;
    plan: readonly DerivativeTarget[];
  }>,
): PixelSize | undefined {
  const [largest] = options.plan;
  if (options.size === undefined || largest === undefined) {
    return undefined;
  }
  const target = getTargetSizeFromLongEdge({
    ...options.size,
    longEdgePx: largest.longEdgePx,
  });
  const isShrink =
    Math.max(target.width, target.height) <
    Math.max(options.size.width, options.size.height);
  return isShrink ? target : undefined;
}
