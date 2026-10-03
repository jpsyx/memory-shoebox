import { appConfig } from "../../../../../app.config";
import {
  getJpegQualityFromEncoder,
  getTargetSizeFromLongEdge,
  isWebKitImageEncoder,
  makeJpegFromSource,
  type DerivativePurpose,
  type MadeDerivative,
  type PixelSize,
} from "@/upload/jpegDerivatives/jpegDerivatives";

/** One derivative still to make, and the long edge it is made at. */
export type DerivativeTarget = {
  purpose: DerivativePurpose;
  longEdgePx: number;
};

/** What `makeImageDerivatives` hands back to the worker. */
export type ImageDerivativesResult = {
  derivatives: MadeDerivative[];
  /** True when libheif decoded it, which is what the recycling counts. */
  usedWasmDecoder: boolean;
  /**
   * The original's displayed size: the header's, or the decoder's when the
   * header had none. What `complete` sends as the file's width and height.
   */
  originalSize: PixelSize | null;
};

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
];

/** HEIC and HEIF, the two types libheif is the fallback for. */
const HEIF_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/heic",
  "image/heif",
]);

/**
 * Which derivatives to make, from the type and the displayed size.
 *
 * **Never upscale, and never re-encode for nothing.** A JPEG whose long edge
 * is already at or under a target is already a displayable file at that
 * size, so that derivative is skipped and `MediaRef` falls back to the
 * original for it. Anything else (a PNG, a HEIC Chrome cannot show) is
 * encoded at its native size instead. With no size yet, both are planned and
 * the plan is made again once the decode says how big the picture is.
 *
 * @param options.contentType The declared type.
 * @param options.size The displayed size, or null when the header had none.
 */
export function getDerivativePlanFromSize(
  options: Readonly<{ contentType: string; size: PixelSize | null }>,
): DerivativeTarget[] {
  const { size } = options;
  if (size === null || options.contentType !== "image/jpeg") {
    return [...IMAGE_TARGETS];
  }
  const longEdge = Math.max(size.width, size.height);
  return IMAGE_TARGETS.filter((target) => {
    return longEdge > target.longEdgePx;
  });
}

/**
 * The size to ask the decoder for, or null to decode at native size.
 *
 * The largest planned target, because one decode serves every derivative,
 * and null when that is not a shrink at all: resizing to the native size
 * buys nothing and costs a resample.
 */
export function getDecodeSizeFromPlan(
  options: Readonly<{
    size: PixelSize | null;
    plan: readonly DerivativeTarget[];
  }>,
): PixelSize | null {
  const [largest] = options.plan;
  if (options.size === null || largest === undefined) {
    return null;
  }
  const target = getTargetSizeFromLongEdge({
    ...options.size,
    longEdgePx: largest.longEdgePx,
  });
  return target.width < options.size.width ? target : null;
}

/** A decoded picture, the size of the original, and who decoded it. */
type DecodedImage = {
  bitmap: ImageBitmap;
  originalSize: PixelSize;
  usedWasmDecoder: boolean;
};

/** The resize options for `createImageBitmap`, when there is a resize. */
function _getResizeOptions(size: PixelSize | null): ImageBitmapOptions {
  return size === null
    ? {}
    : {
        resizeWidth: size.width,
        resizeHeight: size.height,
        resizeQuality: "high",
      };
}

/**
 * libheif's pixels, resized on the way to a bitmap.
 *
 * The target comes from libheif's own size rather than the header's, because
 * that is the size of the pixels in hand.
 */
async function _decodeWithLibheif(options: {
  file: Blob;
  plan: readonly DerivativeTarget[];
}): Promise<DecodedImage> {
  const { decodeHeicToImageData } =
    await import("@/upload/makeImageDerivatives/decodeHeicToImageData");
  const pixels = await decodeHeicToImageData(options.file);
  const originalSize = { width: pixels.width, height: pixels.height };
  const size = getDecodeSizeFromPlan({
    size: originalSize,
    plan: options.plan,
  });
  const bitmap = await createImageBitmap(pixels, _getResizeOptions(size));
  return { bitmap, originalSize, usedWasmDecoder: true };
}

/**
 * Decodes once, resized on decode when the target is known.
 *
 * `imageOrientation: "from-image"` applies EXIF orientation, which is why the
 * resize size must already be the post-orientation one. A native failure on
 * HEIC or HEIF falls through to libheif (decision 1); on anything else, or
 * when libheif fails too, the answer is null.
 */
async function _decodeImage(options: {
  file: Blob;
  contentType: string;
  size: PixelSize | null;
  decodeSize: PixelSize | null;
  plan: readonly DerivativeTarget[];
}): Promise<DecodedImage | null> {
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
    return { bitmap, originalSize, usedWasmDecoder: false };
  } catch {
    if (!HEIF_CONTENT_TYPES.has(options.contentType)) {
      return null;
    }
    return _decodeWithLibheif(options).catch(() => {
      return null;
    });
  }
}

/** Every planned derivative of a decoded picture, one at a time. */
async function _encodeEach(options: {
  bitmap: ImageBitmap;
  plan: readonly DerivativeTarget[];
  quality: number;
}): Promise<MadeDerivative[]> {
  return options.plan.reduce<Promise<MadeDerivative[]>>(
    async (madeSoFar, target) => {
      const made = await madeSoFar;
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
      return blob === null
        ? made
        : [...made, { purpose: target.purpose, blob, ...size }];
    },
    Promise.resolve([]),
  );
}

/**
 * A photograph's `display` and `thumb` JPEGs, made in the worker.
 *
 * Decodes once, resized on decode to the largest size needed when the header
 * gave the displayed size (the spike's fastest and leanest path), then draws
 * each derivative from that one bitmap. A HEIC the browser cannot decode goes
 * through libheif. **A derivative that cannot be made is dropped, never
 * thrown**: the file still uploads with a shorter renditions list, and
 * `MediaRef` resolves the missing purpose to the original (Ruling 1).
 *
 * Only the pure helpers run in a unit test: jsdom has no `createImageBitmap`
 * and no `OffscreenCanvas`. The decode and encode paths, the HEIC fallback
 * included, are proven in real Chrome and WebKit by `e2e/upload.spec.ts`
 * (Task 31).
 *
 * @param options.file The picked image.
 * @param options.contentType Its declared type.
 * @param options.size Its post-orientation size from the header, if known.
 */
export async function makeImageDerivatives(
  options: Readonly<{
    file: Blob;
    contentType: string;
    size: PixelSize | null;
  }>,
): Promise<ImageDerivativesResult> {
  const nothingMade = {
    derivatives: [],
    usedWasmDecoder: false,
    originalSize: options.size,
  };
  const plan = getDerivativePlanFromSize(options);
  if (plan.length === 0) {
    return nothingMade;
  }
  const decoded = await _decodeImage({
    ...options,
    decodeSize: getDecodeSizeFromPlan({ size: options.size, plan }),
    plan,
  });
  if (decoded === null) {
    return nothingMade;
  }
  try {
    const { bitmap } = decoded;
    const decodedPlan =
      options.size === null
        ? getDerivativePlanFromSize({
            contentType: options.contentType,
            size: decoded.originalSize,
          })
        : plan;
    const quality = getJpegQualityFromEncoder(await isWebKitImageEncoder());
    return {
      derivatives: await _encodeEach({ bitmap, plan: decodedPlan, quality }),
      usedWasmDecoder: decoded.usedWasmDecoder,
      originalSize: decoded.originalSize,
    };
  } finally {
    decoded.bitmap.close();
  }
}
