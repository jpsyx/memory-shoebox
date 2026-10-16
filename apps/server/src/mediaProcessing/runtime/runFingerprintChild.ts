import sharp from "sharp";
import {
  makeVisualFingerprintFromRgba,
  VISUAL_FINGERPRINT_SIDE,
} from "@memory-shoebox/shared";
import { APP_CONFIG } from "../../../../../app.config.ts";

sharp.concurrency(1);
sharp.cache(false);
const pixels = await sharp(process.argv[2], {
  limitInputPixels: APP_CONFIG.mediaProcessing.photoPixels,
  pages: 1,
  failOn: "error",
})
  .timeout({ seconds: 5 })
  .autoOrient()
  .resize(VISUAL_FINGERPRINT_SIDE, VISUAL_FINGERPRINT_SIDE, { fit: "fill" })
  .toColourspace("srgb")
  .flatten({ background: "white" })
  .ensureAlpha()
  .raw()
  .toBuffer();
process.stdout.write(
  JSON.stringify(makeVisualFingerprintFromRgba(pixels) ?? null),
);
