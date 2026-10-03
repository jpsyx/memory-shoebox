import { appConfig } from "../../../../../app.config";

import { type PixelSize } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import type { DerivativeTarget } from "./makeImageDerivativesFromFile.types";

/** The two an image gets, largest first so one decode serves both. */
const IMAGE_TARGETS: readonly DerivativeTarget[] = [
  {
    purpose: "display",
    longEdgePx: appConfig.upload.derivatives.displayLongEdgePx,
  },
  {
    purpose: "thumb",
    longEdgePx: appConfig.upload.derivatives.thumbLongEdgePx,
  },
] as const;

/**
 * Which derivatives to make, from the type and the displayed size.
 *
 * **Never upscale, and never re-encode for nothing.** A JPEG whose long edge is
 * already at or under a target is already a displayable file at that size, so
 * that derivative is skipped and `MediaRef` falls back to the original for it.
 * Anything else (a PNG, a HEIC Chrome cannot show) is encoded at its native
 * size instead. With no size yet, both are planned and the plan is made again
 * once the decode says how big the picture is.
 *
 * @param options.contentType The declared type.
 * @param options.size The displayed size, or undefined when the header had
 *   none.
 */
export function getDerivativePlanFromSize(
  options: Readonly<{ contentType: string; size: PixelSize | undefined }>,
): DerivativeTarget[] {
  const { size } = options;
  if (size === undefined || options.contentType !== "image/jpeg") {
    return [...IMAGE_TARGETS];
  }
  const longEdge = Math.max(size.width, size.height);
  return IMAGE_TARGETS.filter((target) => {
    return longEdge > target.longEdgePx;
  });
}
