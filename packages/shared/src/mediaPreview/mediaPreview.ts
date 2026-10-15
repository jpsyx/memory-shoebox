import { z } from "zod";
import { idSchema, mediaRefSchema } from "../dtos.ts";
import { timelineSelectionSchema } from "../timeline/selection.ts";

/** Media-only data, with no open state, comments or mutation authority. */
export const mediaPreviewSchema = z.object({
  itemId: idSchema,
  kind: z.enum(["photo", "video"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  media: mediaRefSchema,
});

/** An authorized preview, retained even when every rendition is missing. */
export type MediaPreview = z.infer<typeof mediaPreviewSchema>;

/** Validate the raw batch bound before deduplicating in first-requested order. */
export const mediaPreviewRequestSchema = z.strictObject({
  itemIds: z
    .array(idSchema)
    .min(1)
    .max(8)
    .transform((ids) => {
      return [...new Set(ids)];
    }),
  purpose: z.enum(["speculative-preview", "selected-view"]),
});

/** A bounded batch read, including selected-item source renewal. */
export type MediaPreviewRequest = z.infer<typeof mediaPreviewRequestSchema>;

/** Hidden and missing IDs are omitted identically. */
export const mediaPreviewResponseSchema = z.object({
  items: z.array(mediaPreviewSchema).max(8),
});

/** A direction in the selected timeline, whose burst edges the server owns. */
export const mediaNeighborsRequestSchema = z.strictObject({
  itemId: idSchema,
  selection: timelineSelectionSchema,
  direction: z.enum(["next", "previous"]),
});

/** Inputs to an authorized, side-effect-free neighbor read. */
export type MediaNeighborsRequest = z.infer<typeof mediaNeighborsRequestSchema>;

/** Closest first in each direction; no original-video speculative sources. */
export const mediaNeighborsResponseSchema = z.object({
  ahead: z.array(mediaPreviewSchema).max(2),
  behind: z.array(mediaPreviewSchema).max(1),
});

/** At most two previews in the requested direction and one in reverse. */
export type MediaNeighborsResponse = z.infer<
  typeof mediaNeighborsResponseSchema
>;
