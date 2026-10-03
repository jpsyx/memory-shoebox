import { z } from "zod";
import { collectionSchema, cursorSchema } from "./collectionSchema.ts";
import {
  calendarDateSchema,
  idSchema,
  itemSummarySchema,
  milestoneRefSchema,
  personRefSchema,
  tagRefSchema,
} from "./dtos.ts";
import { LIMITS } from "./limits.ts";

/**
 * The read path for the pile: `tech-specs/apis/timeline.md`.
 *
 * `timelineFilterQuerySchema` is the selection every route here shares. The
 * day stream, the jump rail and the filter surface are the same query with
 * different response shapes bolted on, which is why one schema binds them
 * rather than three that could drift. There is no `/api/search` and no
 * second day shape.
 *
 * The request schemas here validate a **query string**, which is why they
 * coerce. Fastify parses `?tags=a&tags=b` into an array and `?tags=a` into a
 * string, so every repeated parameter accepts both and normalises to a sorted,
 * deduplicated array. That normalisation is also what makes the cursor's
 * filter digest stable: two spellings of one selection must digest alike.
 *
 * The tag and people vocabularies the filter surface's chips are drawn from
 * live in `vocabularies.ts`, and the batch "seen" latch lives in `items.ts`:
 * neither takes this shared selection, so neither belongs here.
 */

/**
 * One repeated id parameter, however the client spelled it.
 *
 * Empty values are dropped rather than rejected: `?tags=` is what a client
 * building a query string from empty state sends, and a `400` there would
 * break a bookmark for no benefit. An unknown id is not an error at all; it
 * narrows the result to nothing, exactly as a real id with no matches would.
 */
const repeatedIdsQuerySchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    const values =
      value === undefined ? [] : Array.isArray(value) ? value : [value];
    return [
      ...new Set(
        values.filter((entry) => {
          return entry !== "";
        }),
      ),
    ].sort();
  })
  .pipe(z.array(idSchema));

/**
 * A boolean in a query string.
 *
 * `z.coerce.boolean()` is wrong here and quietly: it applies JavaScript
 * truthiness, so the string `"false"` coerces to `true`.
 */
const booleanQuerySchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => {
    return value === "true";
  });

/** The selection every route in this slice accepts, spelled identically. */
export const timelineFilterQuerySchema = z.object({
  /** Repeated, not comma-joined: `?tags=a&tags=b`. ANDed with everything. */
  tags: repeatedIdsQuerySchema,
  /** Repeated. Being in a photograph is not a key to it. */
  people: repeatedIdsQuerySchema,
  /** Inclusive capture date. Capture, never upload. */
  from: calendarDateSchema.optional(),
  /** Inclusive capture date. */
  until: calendarDateSchema.optional(),
  /**
   * Narrows to items attached to this milestone, or with `excludeAttached`,
   * to items not attached to it. The milestone slice's attach picker drives
   * from here rather than reinventing this query language.
   */
  attachedToMilestoneId: idSchema.optional(),
  /** Only meaningful beside `attachedToMilestoneId`. */
  excludeAttached: booleanQuerySchema,
});

/** The day stream's query string. */
export const timelineRequestSchema = timelineFilterQuerySchema.extend({
  /** Days, not items. */
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(LIMITS.timelineMaxDays)
    .default(LIMITS.timelineDefaultDays),
  /** Opaque. It encodes the last day and normalised filter digest. */
  cursor: cursorSchema.optional(),
});

/** The day stream's query string. */
export type TimelineRequest = z.infer<typeof timelineRequestSchema>;

/**
 * The jump rail's query string, which **rejects** `limit` and `cursor`.
 *
 * The rail's whole job is to be complete. A paginated rail cannot be jumped
 * through, and silently accepting the parameters would let somebody build one
 * by accident.
 */
export const timelineRailRequestSchema = timelineFilterQuerySchema.extend({
  // `.optional()` on top of `z.undefined()` is deliberate, not redundant: a
  // bare `z.undefined()` only accepts the key being present and equal to
  // `undefined`, and rejects a query string that never had the key at all
  // (Zod reports that absence as "nonoptional"). Fastify never hands back a
  // key for a parameter nobody sent, so without `.optional()` an unfiltered
  // rail request would fail validation for carrying neither `limit` nor
  // `cursor`, which is precisely the request this route exists to accept.
  limit: z.undefined({ error: "The jump rail is never paginated." }).optional(),
  cursor: z
    .undefined({ error: "The jump rail is never paginated." })
    .optional(),
});

/** The jump rail's query string. */
export type TimelineRailRequest = z.infer<typeof timelineRailRequestSchema>;

/** The filter surface's query string: the selection as it stands. */
export const filterFacetsRequestSchema = timelineFilterQuerySchema;

/** The filter surface's query string. */
export type FilterFacetsRequest = z.infer<typeof filterFacetsRequestSchema>;

/** The occasion that takes this day's one full band. Decision 14. */
export const dayMilestoneBandSchema = z.object({
  milestone: milestoneRefSchema,
  /** 1-based position of this day within the span. */
  dayPosition: z.number().int().positive(),
  /** Total days in the span, both ends counted. 1 for a one-day occasion. */
  dayCount: z.number().int().positive(),
  /** The whole occasion's per-viewer total, for the band's "212 items". */
  itemCount: z.number().int().nonnegative(),
});

/** The occasion that takes this day's one full band. */
export type DayMilestoneBand = z.infer<typeof dayMilestoneBandSchema>;

/**
 * Another occasion covering this day, as a continuation strip.
 *
 * No `itemCount`: the strip prints "day 3 of 5" and a name, and nothing else.
 */
export const dayMilestoneStripSchema = z.object({
  milestone: milestoneRefSchema,
  dayPosition: z.number().int().positive(),
  dayCount: z.number().int().positive(),
});

/** Another occasion covering this day, as a continuation strip. */
export type DayMilestoneStrip = z.infer<typeof dayMilestoneStripSchema>;

/** One day of the pile, with its counts and whatever occasions cover it. */
export const timelineDaySchema = z.object({
  /** `YYYY-MM-DD`, local to the Shoebox timezone. The grouping key. */
  capturedOn: calendarDateSchema,
  /**
   * Every visible item on the day, burst frames counted individually. Not
   * `items.length`: a collapsed burst is one entry and forty-five items.
   */
  itemCount: z.number().int().nonnegative(),
  /** Visible items this viewer has no `item_views` row for. */
  unseenCount: z.number().int().nonnegative(),
  /** One at most, resolved by the server. The client re-derives none of it. */
  milestoneBand: dayMilestoneBandSchema.nullable(),
  milestoneStrips: z.array(dayMilestoneStripSchema),
  /** One entry per print the pile draws. Empty on a milestone-only day. */
  items: z.array(itemSummarySchema),
});

/** One day of the pile. */
export type TimelineDay = z.infer<typeof timelineDaySchema>;

/**
 * A page of days.
 *
 * With nothing visible the body is exactly
 * `{ "days": [], "nextCursor": null, "resultCount": null }`, and a brand-new
 * archive and a viewer restricted from everything produce byte-identical
 * bodies. No field may be added that distinguishes them.
 */
export const timelineResponseSchema = collectionSchema({
  resourceKey: "days",
  itemSchema: timelineDaySchema,
}).extend({
  /**
   * What the whole selection is worth, in items, for the filter strip. Null
   * when no filter is set, and null on any request carrying a cursor: the
   * strip is drawn once from the first page.
   */
  resultCount: z.number().int().nonnegative().nullable(),
});

/** A page of days. */
export type TimelineResponse = z.infer<typeof timelineResponseSchema>;

/** One entry on the jump rail. */
export const railDaySchema = z.object({
  capturedOn: calendarDateSchema,
  /** Per viewer. `0` on a milestone-only day, which is still jumpable. */
  itemCount: z.number().int().nonnegative(),
});

/** One entry on the jump rail. */
export type RailDay = z.infer<typeof railDaySchema>;

/**
 * Every visible day with its count.
 *
 * `nextCursor` is always null and is present only to satisfy the envelope.
 * There is deliberately no totals field: surface 2's `end` block sums
 * `itemCount`, takes `days.length` and reads the last entry's `capturedOn`,
 * which keeps the empty response down to something that cannot distinguish an
 * empty archive from an invisible one.
 */
export const timelineRailResponseSchema = collectionSchema({
  resourceKey: "days",
  itemSchema: railDaySchema,
});

/** Every visible day with its count. */
export type TimelineRailResponse = z.infer<typeof timelineRailResponseSchema>;

/**
 * Exactly one of the two counts is non-null on every chip, and it is the
 * right one for `isSelected`.
 *
 * `narrowedCount` is what adding the chip to the selection would leave, and a
 * selected chip carries none: the result strip already states what the
 * selection is worth. `ownCount` is the mirror image and is sent only on a
 * selected chip, where surface 6's `none` state needs it to say "Elena is in
 * 23 photographs and there are 141 tagged beach, but none of them are the
 * same ones". Refusing both, neither, and the wrong one of the two is what
 * stops a client rendering the wrong number.
 */
function _hasCountForSelection(facet: {
  isSelected: boolean;
  narrowedCount: number | null;
  ownCount: number | null;
}): boolean {
  return (
    (facet.narrowedCount === null) === facet.isSelected &&
    (facet.ownCount === null) !== facet.isSelected
  );
}

const FACET_COUNT_ERROR =
  "A chip carries narrowedCount when it is not selected and ownCount when it is.";

/** One tag chip on the filter surface. */
export const tagFacetSchema = z
  .object({
    tag: tagRefSchema,
    isSelected: z.boolean(),
    /** What adding this chip to the selection would leave. Null iff selected. */
    narrowedCount: z.number().int().nonnegative().nullable(),
    /** The chip's worth with no filters at all. Non-null iff selected. */
    ownCount: z.number().int().nonnegative().nullable(),
  })
  .refine(_hasCountForSelection, { error: FACET_COUNT_ERROR });

/** One tag chip on the filter surface. */
export type TagFacet = z.infer<typeof tagFacetSchema>;

/** One person chip on the filter surface. */
export const personFacetSchema = z
  .object({
    person: personRefSchema,
    isSelected: z.boolean(),
    narrowedCount: z.number().int().nonnegative().nullable(),
    ownCount: z.number().int().nonnegative().nullable(),
  })
  .refine(_hasCountForSelection, { error: FACET_COUNT_ERROR });

/** One person chip on the filter surface. */
export type PersonFacet = z.infer<typeof personFacetSchema>;

/**
 * Every chip, every time, including the zeros.
 *
 * Dropping a zero would reshuffle a row under somebody's finger, and `0` is
 * itself the answer to "is there anything from the beach with Abuela in it".
 */
export const filterFacetsResponseSchema = z.object({
  tags: z.array(tagFacetSchema),
  people: z.array(personFacetSchema),
  /** What the current selection is worth. Zero is a real answer. */
  resultCount: z.number().int().nonnegative(),
});

/** Every chip, every time. */
export type FilterFacetsResponse = z.infer<typeof filterFacetsResponseSchema>;
