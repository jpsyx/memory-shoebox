import sharp from "sharp";
import {
  makeVisualFingerprintFromRgba,
  VISUAL_FINGERPRINT_SIDE,
} from "@memory-shoebox/shared";

/** Reads oriented sRGB pixels for identity; never writes or replaces media. */
export async function makeVisualFingerprintFromImage(
  bytes: Uint8Array,
): Promise<string | undefined> {
  const pixels = await sharp(bytes, { limitInputPixels: 100_000_000 })
    .timeout({ seconds: 5 })
    .autoOrient()
    .resize(VISUAL_FINGERPRINT_SIDE, VISUAL_FINGERPRINT_SIDE, { fit: "fill" })
    .toColourspace("srgb")
    .flatten({ background: "white" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return makeVisualFingerprintFromRgba(pixels);
}
