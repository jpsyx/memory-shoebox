import { z } from "zod";

/**
 * Catalog rendition purposes. Browser uploads retain their original vocabulary;
 * server processing also publishes display candidates and optimized video_mp4.
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

/** Browser upload vocabulary stays separate from server processing outputs. */
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
