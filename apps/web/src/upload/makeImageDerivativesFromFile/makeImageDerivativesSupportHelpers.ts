import {
  getTargetSizeFromLongEdge,
  makeJpegFromSource,
  type PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import type {
  DerivativeTarget,
  DecodeAttempt,
  DecodeImageOptions,
  EncodeProgress,
} from "./makeImageDerivativesFromFile.types";

import { getDecodeSizeFromPlan } from "./getDecodeSizeFromPlan";

/** A caught value as the short clause that ends a `dropDetail`. */
function _getReasonFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The resize options for `createImageBitmap`, when there is a resize.
 *
 * Only the long edge is passed. Given one dimension, the browser derives the
 * other from the pixels it really decoded, so a header size gone stale (a
 * crop that left the old EXIF dimensions behind) cannot squash the picture.
 */
function _getResizeOptions(size: PixelSize | undefined): ImageBitmapOptions {
  return size === undefined
    ? {}
    : size.width >= size.height
      ? { resizeWidth: size.width, resizeQuality: "high" }
      : { resizeHeight: size.height, resizeQuality: "high" };
}

/**
 * libheif's pixels, resized on the way to a bitmap.
 *
 * The target comes from libheif's own size rather than the header's, because
 * that is the size of the pixels in hand. A failure of any part, the loader
 * included, is a failed attempt, still counted as one.
 */
async function _decodeWithLibheif(options: {
  file: Blob;
  plan: readonly DerivativeTarget[];
}): Promise<DecodeAttempt> {
  try {
    const { makeImageDataFromHeic } =
      await import("@/upload/makeImageDataFromHeic/makeImageDataFromHeic");
    const pixels = await makeImageDataFromHeic(options.file);
    const originalSize = { width: pixels.width, height: pixels.height };
    const size = getDecodeSizeFromPlan({
      size: originalSize,
      plan: options.plan,
    });
    const bitmap = await createImageBitmap(pixels, _getResizeOptions(size));
    return {
      kind: "decoded",
      image: { bitmap, originalSize },
      usedWasmDecoder: true,
    };
  } catch (error: unknown) {
    return {
      kind: "failed",
      dropDetail: `the HEIC decoder could not decode it (${_getReasonFromError(error)})`,
      usedWasmDecoder: true,
    };
  }
}

/**
 * Decodes once, resized on decode when the target is known.
 *
 * `imageOrientation: "from-image"` applies EXIF orientation, which is why the
 * resize size must already be the post-orientation one. A native failure on
 * HEIC or HEIF falls through to libheif (decision 1); on anything else, or
 * when libheif fails too, the attempt has failed and says why.
 */
export async function decodeImage(
  options: Readonly<Omit<DecodeImageOptions, "plan">> &
    Readonly<{ plan: readonly DerivativeTarget[] }>,
): Promise<DecodeAttempt> {
  try {
    const bitmap = await createImageBitmap(options.file, {
      imageOrientation: "from-image",
      ..._getResizeOptions(options.decodeSize),
    });
    // Without a header size there was no resize, so the bitmap is native.
    const originalSize = options.size ?? {
      width: bitmap.width,
      height: bitmap.height,
    };
    return {
      kind: "decoded",
      image: { bitmap, originalSize },
      usedWasmDecoder: false,
    };
  } catch (error: unknown) {
    if (
      (new Set(["image/heic", "image/heif"]) satisfies ReadonlySet<string>).has(
        options.contentType,
      )
    ) {
      return _decodeWithLibheif(options);
    }
    return {
      kind: "failed",
      dropDetail: `the browser could not decode the image (${_getReasonFromError(error)})`,
      usedWasmDecoder: false,
    };
  }
}

/** Every planned derivative of a decoded picture, one at a time. */
export async function encodeEach(
  options: Readonly<{
    bitmap: ImageBitmap;
    plan: readonly DerivativeTarget[];
    quality: number;
  }>,
): Promise<EncodeProgress> {
  return options.plan.reduce<Promise<EncodeProgress>>(
    async (progressSoFar, target) => {
      const progress = await progressSoFar;
      const size = getTargetSizeFromLongEdge({
        width: options.bitmap.width,
        height: options.bitmap.height,
        longEdgePx: target.longEdgePx,
      });
      const blob = await makeJpegFromSource({
        source: options.bitmap,
        size,
        quality: options.quality,
      });
      return blob === undefined
        ? {
            ...progress,
            droppedPurposes: [...progress.droppedPurposes, target.purpose],
          }
        : {
            ...progress,
            derivatives: [
              ...progress.derivatives,
              { purpose: target.purpose, blob, ...size },
            ],
          };
    },
    Promise.resolve({ derivatives: [], droppedPurposes: [] }),
  );
}
