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
 * Never upscale. A JPEG can stand in for a target only when both its long
 * edge and encoded bytes fit that target's budget. Other image formats are
 * encoded at native size when smaller. Unknown dimensions are planned again
 * after decoding. Purpose selection avoids decoding or encoding unused sizes.
 *
 * @param options.contentType The declared type.
 * @param options.file The source Blob, for byte-aware JPEG reuse.
 * @param options.purposes The requested targets; defaults to both.
 * @param options.size The displayed size, or undefined when the header had
 *   none.
 */
export function getDerivativePlanFromSize(
  options: Readonly<{
    contentType: string;
    size: PixelSize | undefined;
    file?: Blob;
    purposes?: ReadonlyArray<"thumb" | "display">;
  }>,
): DerivativeTarget[] {
  const { size } = options;
  return IMAGE_TARGETS.filter((target) => {
    if (options.purposes && !options.purposes.includes(target.purpose)) {
      return false;
    }
    if (size === undefined || options.contentType !== "image/jpeg") {
      return true;
    }
    const byteBudget = appConfig.mediaProcessing.photoCandidates.find(
      (candidate) => {
        return candidate.longEdge === target.longEdgePx;
      },
    )!.bytes;
    return (
      Math.max(size.width, size.height) > target.longEdgePx ||
      (options.file?.size ?? 0) > byteBudget
    );
  });
}
