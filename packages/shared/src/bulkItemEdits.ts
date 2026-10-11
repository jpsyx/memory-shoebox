import { z } from "zod";
import { idSchema } from "./dtos.ts";
import {
  setItemPeopleRequestSchema,
  setItemTagsRequestSchema,
} from "./itemEdits.ts";

/** Maximum selection accepted by `POST /api/items/bulk-edit`. */
export const BULK_EDIT_MAX_ITEMS = 500;

const selectedItemIdsSchema = z
  .array(idSchema)
  .min(1)
  .max(BULK_EDIT_MAX_ITEMS)
  .refine(
    (itemIds) => {
      return new Set(itemIds).size === itemIds.length;
    },
    {
      message: "An id appears twice.",
    },
  );

/** One atomic, additive label action or deletion on a timeline selection. */
export const bulkEditItemsRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("tags"),
    itemIds: selectedItemIdsSchema,
    tags: setItemTagsRequestSchema.shape.tags,
  }),
  z.object({
    action: z.literal("people"),
    itemIds: selectedItemIdsSchema,
    people: setItemPeopleRequestSchema.shape.people,
  }),
  z.object({
    action: z.literal("milestone"),
    itemIds: selectedItemIdsSchema,
    milestoneId: idSchema,
  }),
  z.object({ action: z.literal("delete"), itemIds: selectedItemIdsSchema }),
]);

/** Request body of `POST /api/items/bulk-edit`; success is an empty 204. */
export type BulkEditItemsRequest = z.infer<typeof bulkEditItemsRequestSchema>;
