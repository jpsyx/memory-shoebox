import { type PixelSize } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import type { VideoDerivativesResult } from "./makeVideoDerivativesFromFile.types";

/**
 * What a video that gets no poster answers: the size when it is known.
 *
 * A fresh object every time, so a caller that edits its result cannot change
 * the next video's.
 */
export function makeNoPoster(
  size: PixelSize | undefined,
): VideoDerivativesResult {
  return { derivatives: [], size };
}
