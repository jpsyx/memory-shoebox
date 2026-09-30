import { z } from "zod";
import {
  calendarDateSchema,
  idSchema,
  itemSummarySchema,
  visibilityRuleIdSchema,
  visibilitySummarySchema,
} from "./dtos.ts";
import { LIMITS } from "./limits.ts";

/**
 * Every write on one item that is not a comment or a reaction:
 * `tech-specs/apis/items.md`.
 *
 * The bodies are narrow on purpose. `PATCH /api/items/:itemId` takes one
 * field, because widening it is how the rest of that document gets
 * bypassed: the capture date, visibility, tags and people each have a route
 * with transformation steps a generic `PATCH` would skip.
 */

/** "HH:MM" or "HH:MM:SS", local. */
const clockTimeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/u);

/** The alt text override, and nothing else. */
export const updateItemRequestSchema = z.object({
  /**
   * Blank or null clears it and returns to the composed string. Trimmed
   * first: `items.alt_text` is written only when somebody typed a real
   * description (Decision 9).
   */
  altText: z.string().trim().max(LIMITS.altTextMaxLength).nullable(),
});

/** The alt text override, and nothing else. */
export type UpdateItemRequest = z.infer<typeof updateItemRequestSchema>;

/**
 * Replace the item's tag set.
 *
 * Names as typed, spaces intact, not ids: the field is free text and the
 * chip row can invent one.
 */
export const setItemTagsRequestSchema = z.object({
  tags: z
    .array(z.string().trim().min(1).max(LIMITS.tagNameMaxLength))
    .max(LIMITS.itemMaxTags),
});

/** Replace the item's tag set. */
export type SetItemTagsRequest = z.infer<typeof setItemTagsRequestSchema>;

/** Existing people by id, somebody the archive has never heard of by name. */
export const personInputSchema = z.union([
  z.object({ personId: idSchema }),
  z.object({ displayName: z.string().trim().min(1) }),
]);

/** Existing people by id, somebody the archive has never heard of by name. */
export type PersonInput = z.infer<typeof personInputSchema>;

/** Replace the item's people set. */
export const setItemPeopleRequestSchema = z.object({
  people: z.array(personInputSchema).max(LIMITS.itemMaxPeople),
});

/** Replace the item's people set. */
export type SetItemPeopleRequest = z.infer<typeof setItemPeopleRequestSchema>;

/**
 * Repoint one item at a rule.
 *
 * Mode and subjects are not accepted here: the id comes from
 * `POST /api/visibility-rules/resolve`, because rules are immutable from the
 * edit path and one rule covers 264 files.
 */
export const setItemVisibilityRequestSchema = z.object({
  visibilityRuleId: visibilityRuleIdSchema,
});

/** Repoint one item at a rule. */
export type SetItemVisibilityRequest = z.infer<
  typeof setItemVisibilityRequestSchema
>;

/** Repoint a selection at a rule, atomically. */
export const setItemsVisibilityRequestSchema = z.object({
  itemIds: z
    .array(idSchema)
    .min(1)
    .max(LIMITS.visibilityBatchMaxItems)
    .refine(
      (itemIds) => {
        return new Set(itemIds).size === itemIds.length;
      },
      { message: "An id appears twice." },
    ),
  visibilityRuleId: visibilityRuleIdSchema,
});

/** Repoint a selection at a rule, atomically. */
export type SetItemsVisibilityRequest = z.infer<
  typeof setItemsVisibilityRequestSchema
>;

/**
 * The prints a selection's save refreshes.
 *
 * `nextCursor` is structurally present and always null: the response set is
 * bounded by the request, so there is nothing to page.
 */
export const setItemsVisibilityResponseSchema = z.object({
  items: z.array(itemSummarySchema),
  nextCursor: z.null(),
});

/** The prints a selection's save refreshes. */
export type SetItemsVisibilityResponse = z.infer<
  typeof setItemsVisibilityResponseSchema
>;

/** Mode plus subjects to a rule id. Finds or creates. */
export const resolveVisibilityRuleRequestSchema = z.object({
  mode: z.enum(["everyone", "only", "except"]),
  subjects: z
    .array(z.object({ kind: z.enum(["member", "group"]), id: idSchema }))
    .default([]),
});

/** Mode plus subjects to a rule id. Finds or creates. */
export type ResolveVisibilityRuleRequest = z.infer<
  typeof resolveVisibilityRuleRequestSchema
>;

/**
 * The rule that was found or created.
 *
 * `200` rather than `201`, because the commonest outcome by far is that the
 * rule already existed and the caller cannot tell, and should not have to.
 */
export const resolveVisibilityRuleResponseSchema = z.object({
  visibilityRuleId: visibilityRuleIdSchema,
  /** The same shape the item carries, so one source feeds the confirmation. */
  visibility: visibilitySummarySchema,
});

/** The rule that was found or created. */
export type ResolveVisibilityRuleResponse = z.infer<
  typeof resolveVisibilityRuleResponseSchema
>;

/**
 * The hand correction, which keeps the clock time.
 *
 * A `POST` to a noun sub-resource, because REST cannot express "correct
 * this", and it is the one edit in the product that destroys a fact the file
 * carried.
 */
export const setCaptureDateRequestSchema = z.object({
  /** The day it was taken, local. */
  capturedOn: calendarDateSchema,
  /** Omit or send null to keep the clock time the file carried. */
  capturedTime: clockTimeSchema.nullish(),
});

/** The hand correction, which keeps the clock time. */
export type SetCaptureDateRequest = z.infer<typeof setCaptureDateRequestSchema>;
