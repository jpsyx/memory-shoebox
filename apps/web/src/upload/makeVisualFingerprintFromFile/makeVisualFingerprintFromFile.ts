import {
  makeVisualFingerprintFromRgba,
  VISUAL_FINGERPRINT_SIDE,
} from "@memory-shoebox/shared";
import type { PixelSize } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";
import { getDecodeSizeFromPlan } from "@/upload/makeImageDerivativesFromFile/getDecodeSizeFromPlan";
import { decodeImage } from "@/upload/makeImageDerivativesFromFile/makeImageDerivativesSupportHelpers";
import type { DerivativeTarget } from "@/upload/makeImageDerivativesFromFile/makeImageDerivativesFromFile.types";

/** Small intermediate decode avoids aliasing a full-size photo to 32 pixels. */
const DECODE_PLAN: readonly DerivativeTarget[] = [
  { purpose: "thumb", longEdgePx: 128 },
];

/** Optional photo evidence and whether this worker grew its HEIC decoder. */
export type VisualFingerprintResult = {
  visualFingerprint: string | undefined;
  usedWasmDecoder: boolean;
  /** Post-orientation original dimensions, when decoding succeeded. */
  originalSize?: PixelSize;
};

function _makeFingerprintFromBitmap(bitmap: ImageBitmap): string | undefined {
  const side = VISUAL_FINGERPRINT_SIDE;
  const canvas = new OffscreenCanvas(side, side);
  const context = canvas.getContext("2d", {
    colorSpace: "srgb",
    willReadFrequently: true,
  });
  if (!context) {
    return undefined;
  }
  context.fillStyle = "white";
  context.fillRect(0, 0, side, side);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, side, side);
  return makeVisualFingerprintFromRgba(
    context.getImageData(0, 0, side, side).data,
  );
}

/** Reads an oriented photo for duplicate evidence, leaving original bytes intact. */
export async function makeVisualFingerprintFromFile(
  options: Readonly<{
    file: Blob;
    contentType: string;
    size: PixelSize | undefined;
  }>,
): Promise<VisualFingerprintResult> {
  const attempt = await decodeImage({
    ...options,
    decodeSize: getDecodeSizeFromPlan({
      size: options.size,
      plan: DECODE_PLAN,
    }),
    plan: DECODE_PLAN,
  });
  const result: VisualFingerprintResult = {
    visualFingerprint: undefined,
    usedWasmDecoder: attempt.usedWasmDecoder,
    originalSize:
      attempt.kind === "decoded" ? attempt.image.originalSize : undefined,
  };
  if (attempt.kind === "failed") {
    return result;
  }
  try {
    return {
      ...result,
      visualFingerprint: _makeFingerprintFromBitmap(attempt.image.bitmap),
    };
  } catch {
    // Missing canvas support or unreadable pixels leave SHA-256 authoritative.
    return result;
  } finally {
    attempt.image.bitmap.close();
  }
}
