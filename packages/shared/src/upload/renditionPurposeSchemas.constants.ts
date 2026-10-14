import { z } from "zod";

/**
 * `item_renditions.purpose`. `video_webm` and `video_mp4` are accepted and
 * never produced: v1 transcodes no video (`upload.md` Ruling 1).
 */
export const RENDITION_PURPOSES = [
  "original",
  "display",
  "display_small",
  "display_webp",
  "display_small_webp",
  "thumb",
  "poster",
  "video_webm",
  "video_mp4",
] as const;

/** Browser uploads retain the original six purposes until processing is available. */
export const uploadRenditionPurposeSchema = z.enum([
  "original",
  "display",
  "thumb",
  "poster",
  "video_webm",
  "video_mp4",
]);

/** `item_renditions.purpose`. */
export const renditionPurposeSchema = z.enum(RENDITION_PURPOSES);

/** `item_renditions.purpose`. */
export type RenditionPurpose = z.infer<typeof renditionPurposeSchema>;
