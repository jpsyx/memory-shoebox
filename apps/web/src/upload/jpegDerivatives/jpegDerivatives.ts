import { appConfig } from "../../../../../app.config";

/*
 * What every derivative the browser makes has in common, image or video: a
 * JPEG (finding 5 rules out WebP), never larger than its source, at a quality
 * chosen for the encoder that makes it.
 */

/** The purposes the browser makes. `video_*` is never made (Ruling 1). */
export type DerivativePurpose = "display" | "thumb" | "poster";

/** A pixel box. */
export type PixelSize = { width: number; height: number };

/** One derivative the browser made: always a JPEG, sized as it says. */
export type MadeDerivative = PixelSize & {
  purpose: DerivativePurpose;
  blob: Blob;
};

/**
 * A box scaled so its long edge is at most `longEdgePx`. Never upscales.
 *
 * Rounded, and never below one pixel, so a 1 x 5000 strip still has a width.
 */
export function getTargetSizeFromLongEdge(
  options: Readonly<PixelSize & { longEdgePx: number }>,
): PixelSize {
  const scale = Math.min(
    1,
    options.longEdgePx / Math.max(options.width, options.height),
  );
  return {
    width: Math.max(1, Math.round(options.width * scale)),
    height: Math.max(1, Math.round(options.height * scale)),
  };
}

/**
 * The JPEG quality for this engine's encoder.
 *
 * WebKit's encoder spends 1.7 to 1.9 times Chrome's bytes at the same
 * setting (the spike), so it gets its own lower number for a similar file.
 */
export function getJpegQualityFromEncoder(isWebKitEncoder: boolean): number {
  return isWebKitEncoder
    ? appConfig.upload.derivatives.jpegQuality.webkit
    : appConfig.upload.derivatives.jpegQuality.default;
}

let webKitEncoderCheck: Promise<boolean> | undefined;

/** The one probe `isWebKitImageEncoder` caches. Never rejects. */
async function _probeWebKitImageEncoder(): Promise<boolean> {
  if (typeof OffscreenCanvas === "undefined") {
    return false;
  }
  try {
    const canvas = new OffscreenCanvas(1, 1);
    // A canvas that never had a context cannot be encoded: Chromium rejects
    // `convertToBlob` with `InvalidStateError`, which would read as "not
    // WebKit" for the wrong reason. Take the context first.
    if (canvas.getContext("2d") === null) {
      return false;
    }
    const probe = await canvas.convertToBlob({ type: "image/webp" });
    return probe.type !== "image/webp";
  } catch {
    return false;
  }
}

/**
 * Whether this is WebKit's image encoder, asked once per thread.
 *
 * **A feature test, not a user-agent check.** It asks the encoder for a 1 x 1
 * WebP, from a canvas that has a 2d context (Chromium refuses to encode one
 * that has none), and looks at what comes back: WebKit silently answers with
 * a PNG (finding 5 of the spike), and Chrome and Firefox answer with WebP.
 * That identifies the encoder rather than the brand, so every browser on iOS,
 * which are all WebKit underneath whatever their user agent says, is caught
 * without parsing one, and it runs in the thread that does the encoding.
 *
 * Never rejects. Where there is no `OffscreenCanvas`, or no context to be
 * had, the answer is false: the default quality, and every derivative then
 * dropped by `makeJpegFromSource` rather than thrown. Should WebKit ever ship
 * a WebP encoder this reads false too, and WebKit falls back to the default
 * quality: bigger files, nothing broken.
 */
export function isWebKitImageEncoder(): Promise<boolean> {
  webKitEncoderCheck ??= _probeWebKitImageEncoder();
  return webKitEncoderCheck;
}

/**
 * One JPEG of `source` at `size`, or null if this browser would not make one.
 *
 * The canvas is filled white first because JPEG has no alpha, and a
 * transparent PNG would otherwise come out on black. The blob's actual type
 * is checked rather than trusted, because an encoder asked for a type it
 * does not support answers with a PNG instead of failing (finding 5). Never
 * rejects: a derivative that cannot be made is dropped (Ruling 1).
 *
 * @param options.source A decoded bitmap, or a video showing its frame.
 * @param options.size The size to draw it at.
 * @param options.quality From `getJpegQualityFromEncoder`.
 */
export async function makeJpegFromSource(
  options: Readonly<{
    source: CanvasImageSource;
    size: PixelSize;
    quality: number;
  }>,
): Promise<Blob | null> {
  let canvas: OffscreenCanvas | undefined;
  try {
    const { width, height } = options.size;
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (context === null) {
      return null;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(options.source, 0, 0, width, height);
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: options.quality,
    });
    return blob.type === "image/jpeg" ? blob : null;
  } catch {
    return null;
  } finally {
    // Give the backing store back now rather than whenever the canvas is
    // collected, failure included: two workers at 2048 px hold 32 MB of
    // canvas otherwise.
    if (canvas !== undefined) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
