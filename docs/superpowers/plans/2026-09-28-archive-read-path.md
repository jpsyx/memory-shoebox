# Archive Read Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the six read routes of the pile: the day stream with its
milestone bands and per-viewer counts, the jump rail, the facets, the tag and
people vocabularies, and the one-way seen latch.

**Architecture:** One selection expression, composed once per request from step
3a's `visibilityExpression`, is shared by every count and every row list in the
slice, so a count and the page it heads cannot disagree. The day stream is a
union of item days and milestone-span days, merged and cut in the application;
everything else about a page is fetched in batches keyed by the ids actually
drawn, so no query is per item, per day or per burst. Small modules under
`apps/server/src/archive/`, each with one job, composed by `readTimelinePage`.

**Tech Stack:** Fastify 5, Kysely 0.28 over better-sqlite3 (SQLite 3.53), Zod
4, Vitest, TypeScript run directly by Node.

---

## Read before starting

The design is
[`docs/superpowers/specs/2026-09-28-archive-read-path-design.md`](../specs/2026-09-28-archive-read-path-design.md).
It carries the reasoning and the twenty decisions; this plan carries the code.
Three documents are binding and this plan does not restate them:

| Document                                                          | What it settles                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md` | The six routes, the cursor, the union, the burst rules, and its `## Rulings`     |
| `.../apis/conventions.md`                                         | The envelope, the errors, the frozen DTOs, the visibility predicate, rate limits |
| `.../tech-specs/data-models.md`                                   | The tables, and § One rule that outranks the others                              |

Read `AGENTS.md` and `docs/rules/typescript.md` once before Task 1. The rules
that bite in this work specifically:

- **Relative imports carry the `.ts` extension** under `apps/server/**` and
  `packages/shared/**`. Node resolves them literally.
- `type`, never `interface`. Never `any`. `undefined` rather than `null`,
  except where the JSON contract requires `null`, which it does on every
  nullable DTO field here.
- **Every exported symbol has a docstring.** Non-exported top-level helpers are
  prefixed `_`.
- **`arrow-body-style` is `always`**: every arrow function has a block body and
  an explicit `return`, including inline callbacks.
- **No `for` or `while` loops.** `map`, `filter`, `flatMap` and `reduce`.
- Functions stay at 45 lines or fewer; a source file over 400 lines is a
  finding.
- **Never use an em dash**, in code, comments, documents or commit messages.
- Readonly wrappers on function parameters, mutable everywhere else.

Commands:

```sh
pnpm --filter @memory-shoebox/server test        # the server suite
pnpm --filter @memory-shoebox/shared test        # the contract suite
pnpm --filter @memory-shoebox/server test -- apps/server/test/archive   # one directory
pnpm check                                        # format, lint, types, build, tests
```

## What already exists and must be used rather than rebuilt

| Thing                                    | Where                                                    |
| ---------------------------------------- | -------------------------------------------------------- |
| The visibility predicate                 | `src/visibility/applyVisibilityFilter.ts`                |
| The viewer, and `requireViewer`          | `src/http/requestContextHelpers.ts`                      |
| `ApiError`, and the Zod to 400 mapping   | `src/http/ApiError.ts`, `src/http/registerErrorHandler.ts` |
| The member display name fallback         | `src/members/getDisplayNameFromMember.ts`                |
| Instance settings, read through defaults | `src/settings/readInstanceSettings.ts`                    |
| Signed URLs                              | `src/b2/client.ts` `presignGet`, faked in tests          |
| The collection envelope                  | `packages/shared/src/collectionSchema.ts`                |
| Test app, seeds, signed-in member        | `apps/server/test/helpers/`                              |

**Rate limiting needs no route configuration.** An authenticated route naming
no rule gets `authenticatedDefault`, which is the contract's 600 per minute per
session.

## File structure

```
app.config.ts                                    + timeline and media sections

packages/shared/src/
  limits.ts             + timelineDefaultDays, timelineMaxDays, seenMaxIds
  dtos.ts               + BurstSummary.hasUnseenFrames, + the span doc comment
  timeline.ts           NEW: the six routes' schemas and this slice's types
  index.ts              + the new exports

apps/server/src/archive/                         NEW, one job per file
  selectionFilter.ts            the normalised filter and its one expression
  timelineCursor.ts             encode, decode, and the filter digest
  milestoneSpans.ts             span arithmetic and the band ranking
  readItemDays.ts               query 1: the day aggregate
  readOverlappingMilestones.ts  query 2: the milestones on the window
  mergeDays.ts                  the union, the budget and the cut, pure
  readDayStream.ts              queries 1 and 2 composed into one page of days
  readItemsForDays.ts           query 3: the items on the chosen days
  readBurstCovers.ts            query 4: cover_item_id for the page's bursts
  collapseBursts.ts             rows to drawn entries, pure
  readMediaSources.ts           query 5: renditions, signed
  makeMediaRefFromSources.ts    sources to MediaRef, with the fallback chain
  readVisibilitySummaries.ts    query 6: rule subjects and the label
  readPeopleNamesByItemId.ts    query 7: the people behind alt text
  makeAltTextFromItem.ts        the composition rule, pure
  readMemberRefs.ts             query 8: the per-request member map
  readMilestoneItemCounts.ts    query 10: a band's own total
  countSelectedItems.ts         query 11: resultCount
  readTimelinePage.ts           the orchestration, and no query of its own
  readRailDays.ts               the rail
  readVocabularyCounts.ts       the tag and person aggregates, both routes
  readFacets.ts                 narrowed counts beside the unfiltered ones
  readPeopleDirectory.ts        the directory and its face fallback
  latchItemsSeen.ts             the one statement

apps/server/src/routes/
  timeline.ts   GET /timeline, GET /timeline/rail
  filters.ts    GET /filters/facets
  tags.ts       GET /tags
  people.ts     GET /people
  items.ts      POST /items/seen
  (app.ts registers all five)

apps/server/test/
  helpers/seedHelpers/archiveSeedHelpers.ts   NEW seeds for the catalog
  helpers/createQueryCountingDatabase.ts      NEW, for the query-plan test
  archive/*.test.ts                           one per module above
  routes/timeline.test.ts                     the route and its contract
  routes/timelineRail.test.ts
  routes/filters.test.ts
  routes/tags.test.ts
  routes/people.test.ts
  routes/itemsSeen.test.ts
```

---

## Task 1: The numbers, in the two places numbers live

**Files:**

- Modify: `packages/shared/src/limits.ts`
- Modify: `app.config.ts`

No test. Both changes are constants, and the only test that could be written
would assert that a literal holds the literal it was given, which `AGENTS.md`
names as a case where a test adds no value. Task 3's schema tests read these
numbers and fail if they are wrong.

- [ ] **Step 1: Add the three request caps to `LIMITS`**

In `packages/shared/src/limits.ts`, inside the `LIMITS` object, after
`milestoneNameMaxLength`:

```ts
  /**
   * Days per timeline page when the client asks for none.
   *
   * `timeline.md`: "Days, not items. Default 10, capped at 30." It is here
   * rather than in `app.config.ts` because the request schema validates it,
   * so both halves of the app need the same number.
   */
  timelineDefaultDays: 10,
  /** The cap the server states and enforces. Over it is a `400`. */
  timelineMaxDays: 30,
  /**
   * Ids one `POST /api/items/seen` may carry, per array.
   *
   * A page draws at most a few hundred prints, and a collapsed burst is one
   * id rather than forty-five, so a client that reaches this is sending
   * something other than what is on screen.
   */
  seenMaxIds: 500,
```

- [ ] **Step 2: Add the two product knobs to `app.config.ts`**

In `app.config.ts`, after the `burst` section and before `upload`:

```ts
  timeline: {
    /**
     * The soft item budget for one page of the day stream.
     *
     * A day is atomic: `limit` counts days and a day never splits across
     * pages, so a single day of 212 photographs arrives whole or not at all.
     * The guard against a page of ten such days is this budget rather than a
     * hard cut: the server stops adding days once the running visible-item
     * total passes it, and always returns at least one day however large.
     *
     * 400 because payload size is the real constraint rather than query time.
     * A 212-item day is roughly 150 KB of JSON once every `MediaRef` carries
     * a thumbnail and a display URL, so 400 items is the point at which one
     * response stops being something a phone on a train can hold
     * (`timeline.md` § Performance).
     */
    pageItemBudget: 400,
  },

  media: {
    /**
     * How long a signed media URL lives, in seconds.
     *
     * One hour (`timeline.md` Ruling 3). Comfortably longer than an
     * uninterrupted scroll, so the ordinary case never sees a URL expire, and
     * short enough that the bearer-link trade `architecture.md` § Where data
     * lives accepts stays small: anybody holding the URL can fetch those
     * bytes without a session for exactly that long.
     *
     * When one does expire the client refetches the affected page in place
     * and merges by id, which keeps scroll and re-evaluates visibility. There
     * is deliberately no re-signing route.
     */
    signedUrlTtlSeconds: 3600,
  },
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @memory-shoebox/shared type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/limits.ts app.config.ts
git commit -m "feat(archive): the page budget, the URL lifetime and the request caps"
```

---

## Task 2: `BurstSummary` gains `hasUnseenFrames`

The first of the two additions `timeline.md` § Additions requested asks of the
frozen DTOs. Without it the collapsed stack is the one place the client cannot
tell whether `POST /api/items/seen` would do anything, so it must either send
on every page view, which breaks "steady-state browsing costs zero writes", or
never send, which leaves forty-four frames permanently new.

**Files:**

- Modify: `packages/shared/src/dtos.ts:181-195`
- Test: `packages/shared/test/dtos.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/test/dtos.test.ts`:

```ts
describe("burstSummarySchema", () => {
  const burst = {
    burstId: "0199c0a0-0000-7000-8000-000000000001",
    visibleFrameCount: 45,
    startsAt: "2026-09-14T06:41:00.000Z",
    endsAt: "2026-09-14T06:44:00.000Z",
    coverItemId: "0199c0a0-0000-7000-8000-000000000002",
    hasUnseenFrames: true,
  };

  it("accepts a stack that says whether any frame is unseen", () => {
    expect(burstSummarySchema.parse(burst)).toEqual(burst);
  });

  it("rejects a stack with no hasUnseenFrames, which the latch needs", () => {
    const { hasUnseenFrames: _unused, ...withoutFlag } = burst;
    expect(burstSummarySchema.safeParse(withoutFlag).success).toBe(false);
  });
});
```

Add `burstSummarySchema` to that file's import from `../src/dtos.ts` if it is
not already there.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/shared test`
Expected: FAIL, "Unrecognized key" or the second case passing where it should
not, because the schema has no `hasUnseenFrames` yet.

- [ ] **Step 3: Add the field and correct the span comments**

Replace `burstSummarySchema` in `packages/shared/src/dtos.ts` with:

```ts
/** A run of frames shot together, collapsed to one entry in the timeline. */
export const burstSummarySchema = z.object({
  burstId: idSchema,
  /** Per viewer. There is no stored frame_count, deliberately. */
  visibleFrameCount: z.number().int().nonnegative(),
  /**
   * Per viewer: `MIN(captured_at)` over the **visible** frames, never
   * `bursts.starts_at`. The stored column is the unfiltered span and would
   * leak the restricted frames through the endpoints of "06:41 to 06:44" in
   * exactly the way a stored count would leak them through a denominator.
   */
  startsAt: timestampSchema,
  /** Per viewer: `MAX(captured_at)` over the visible frames. */
  endsAt: timestampSchema,
  /**
   * Resolved at read time: the cover if visible, else the earliest visible
   * frame.
   */
  coverItemId: idSchema,
  /**
   * Whether any visible frame of this burst has no `item_views` row for this
   * viewer.
   *
   * The stack draws one cover for frames the client has no `isUnseen` for, so
   * without this it cannot tell whether `POST /api/items/seen` would do
   * anything: it would send on every page view, costing a write-lock
   * acquisition each time, or never send, leaving the unfanned frames
   * permanently new. It also lets the stack carry its own accent dot.
   */
  hasUnseenFrames: z.boolean(),
});
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @memory-shoebox/shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/dtos.ts packages/shared/test/dtos.test.ts
git commit -m "feat(shared): a burst says whether it holds anything unseen"
```

---

## Task 3: The read slice's contract

Every request and response schema for the six routes, in one module named
after the slice document. The request schemas validate a **query string**,
which is why they coerce: Fastify hands over `string | string[]`, and a
repeated parameter arrives as an array only when it is repeated.

**Files:**

- Create: `packages/shared/src/timeline.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/timeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/test/timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  filterFacetsResponseSchema,
  itemsSeenRequestSchema,
  tagFacetSchema,
  timelineRailRequestSchema,
  timelineRequestSchema,
  timelineResponseSchema,
} from "../src/timeline.ts";

const TAG_ID = "0199c0a0-0000-7000-8000-000000000001";
const OTHER_TAG_ID = "0199c0a0-0000-7000-8000-000000000002";

describe("timelineRequestSchema", () => {
  it("defaults to ten days and no filter", () => {
    expect(timelineRequestSchema.parse({})).toEqual({
      tags: [],
      people: [],
      from: undefined,
      until: undefined,
      attachedToMilestoneId: undefined,
      excludeAttached: false,
      limit: 10,
      cursor: undefined,
    });
  });

  it("takes one repeated parameter as an array either way", () => {
    expect(timelineRequestSchema.parse({ tags: TAG_ID }).tags).toEqual([
      TAG_ID,
    ]);
    expect(
      timelineRequestSchema.parse({ tags: [OTHER_TAG_ID, TAG_ID] }).tags,
    ).toEqual([TAG_ID, OTHER_TAG_ID]);
  });

  it("sorts and dedupes ids, so one selection has one digest", () => {
    expect(
      timelineRequestSchema.parse({ tags: [OTHER_TAG_ID, TAG_ID, TAG_ID] })
        .tags,
    ).toEqual([TAG_ID, OTHER_TAG_ID]);
  });

  it("drops an empty parameter rather than failing on it", () => {
    expect(timelineRequestSchema.parse({ tags: "" }).tags).toEqual([]);
  });

  it("coerces limit and refuses one over the cap", () => {
    expect(timelineRequestSchema.parse({ limit: "30" }).limit).toBe(30);
    expect(timelineRequestSchema.safeParse({ limit: "31" }).success).toBe(
      false,
    );
  });

  it("reads excludeAttached as a string, so `false` is false", () => {
    expect(
      timelineRequestSchema.parse({
        attachedToMilestoneId: TAG_ID,
        excludeAttached: "false",
      }).excludeAttached,
    ).toBe(false);
    expect(
      timelineRequestSchema.parse({
        attachedToMilestoneId: TAG_ID,
        excludeAttached: "true",
      }).excludeAttached,
    ).toBe(true);
  });

  it("refuses a malformed date", () => {
    expect(timelineRequestSchema.safeParse({ from: "14/09/2026" }).success).toBe(
      false,
    );
  });
});

describe("timelineRailRequestSchema", () => {
  it("rejects limit and cursor rather than ignoring them", () => {
    expect(timelineRailRequestSchema.safeParse({ limit: "10" }).success).toBe(
      false,
    );
    expect(timelineRailRequestSchema.safeParse({ cursor: "abc" }).success).toBe(
      false,
    );
    expect(timelineRailRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe("timelineResponseSchema", () => {
  it("is the collection envelope plus resultCount", () => {
    expect(
      timelineResponseSchema.parse({
        days: [],
        nextCursor: null,
        resultCount: null,
      }),
    ).toEqual({ days: [], nextCursor: null, resultCount: null });
  });

  it("refuses a day with no counts", () => {
    expect(
      timelineResponseSchema.safeParse({
        days: [{ capturedOn: "2026-09-14", items: [] }],
        nextCursor: null,
        resultCount: null,
      }).success,
    ).toBe(false);
  });
});

describe("tagFacetSchema", () => {
  const tag = { tagId: TAG_ID, name: "beach" };

  it("carries a narrowed count when the chip is not selected", () => {
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: false,
        narrowedCount: 0,
        ownCount: null,
      }).success,
    ).toBe(true);
  });

  it("carries an own count when it is", () => {
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: true,
        narrowedCount: null,
        ownCount: 141,
      }).success,
    ).toBe(true);
  });

  it("refuses a chip carrying both numbers or neither", () => {
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: true,
        narrowedCount: 3,
        ownCount: 141,
      }).success,
    ).toBe(false);
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: false,
        narrowedCount: null,
        ownCount: null,
      }).success,
    ).toBe(false);
  });
});

describe("filterFacetsResponseSchema", () => {
  it("takes zero as a real answer", () => {
    expect(
      filterFacetsResponseSchema.parse({ tags: [], people: [], resultCount: 0 })
        .resultCount,
    ).toBe(0);
  });
});

describe("itemsSeenRequestSchema", () => {
  it("defaults burstIds to none", () => {
    expect(itemsSeenRequestSchema.parse({ itemIds: [TAG_ID] })).toEqual({
      itemIds: [TAG_ID],
      burstIds: [],
    });
  });

  it("refuses more than five hundred ids", () => {
    const itemIds = Array.from({ length: 501 }, () => {
      return TAG_ID;
    });
    expect(itemsSeenRequestSchema.safeParse({ itemIds }).success).toBe(false);
  });

  it("refuses an id that is not a uuid", () => {
    expect(itemsSeenRequestSchema.safeParse({ itemIds: ["7"] }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/shared test`
Expected: FAIL, cannot resolve `../src/timeline.ts`.

- [ ] **Step 3: Write the module**

Create `packages/shared/src/timeline.ts`:

```ts
import { z } from "zod";
import { collectionSchema, cursorSchema } from "./collectionSchema.ts";
import {
  calendarDateSchema,
  idSchema,
  itemSummarySchema,
  mediaSourceSchema,
  milestoneRefSchema,
  personRefSchema,
  tagRefSchema,
} from "./dtos.ts";
import { LIMITS } from "./limits.ts";

/**
 * The read path for the pile: `tech-specs/apis/timeline.md`.
 *
 * Six routes and one shape between them, because the `filtered` state of the
 * timeline and the results of the filter surface are the same endpoint with
 * query parameters set. There is no `/api/search` and no second day shape.
 *
 * The request schemas here validate a **query string**, which is why they
 * coerce. Fastify parses `?tags=a&tags=b` into an array and `?tags=a` into a
 * string, so every repeated parameter accepts both and normalises to a sorted,
 * deduplicated array. That normalisation is also what makes the cursor's
 * filter digest stable: two spellings of one selection must digest alike.
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
  /** Opaque. It encodes the last day and the opened-milestone set. */
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
  limit: z.undefined({ error: "The jump rail is never paginated." }),
  cursor: z.undefined({ error: "The jump rail is never paginated." }),
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
 * Exactly one of the two counts is non-null on every chip.
 *
 * `narrowedCount` is what adding the chip to the selection would leave, and a
 * selected chip carries none: the result strip already states what the
 * selection is worth. `ownCount` is the mirror image and is sent only on a
 * selected chip, where surface 6's `none` state needs it to say "Elena is in
 * 23 photographs and there are 141 tagged beach, but none of them are the
 * same ones". Refusing both and neither is what stops a client rendering the
 * wrong number.
 */
function _hasExactlyOneCount(facet: {
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
  .refine(_hasExactlyOneCount, { error: FACET_COUNT_ERROR });

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
  .refine(_hasExactlyOneCount, { error: FACET_COUNT_ERROR });

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

/** The tag vocabulary's query string. */
export const tagsRequestSchema = z.object({
  /** Substring match on the normalised name, for the type-ahead. */
  q: z.string().optional(),
});

/** The tag vocabulary's query string. */
export type TagsRequest = z.infer<typeof tagsRequestSchema>;

/** One tag and what it is worth to this viewer. */
export const tagCountSchema = z.object({
  tag: tagRefSchema,
  /** Per viewer. A tag whose every item is restricted reads 0 and stays. */
  itemCount: z.number().int().nonnegative(),
});

/** One tag and what it is worth to this viewer. */
export type TagCount = z.infer<typeof tagCountSchema>;

/**
 * The tag vocabulary, unpaginated.
 *
 * The aggregate scans `item_tags` whole whichever page is asked for, so
 * cursoring saves serialisation and nothing else, while a partial vocabulary
 * makes a type-ahead lie.
 */
export const tagsResponseSchema = collectionSchema({
  resourceKey: "tags",
  itemSchema: tagCountSchema,
});

/** The tag vocabulary. */
export type TagsResponse = z.infer<typeof tagsResponseSchema>;

/** The people directory's query string. */
export const peopleRequestSchema = z.object({
  /** Narrows the directory by name. Surface 7's `narrowed` state. */
  q: z.string().optional(),
});

/** The people directory's query string. */
export type PeopleRequest = z.infer<typeof peopleRequestSchema>;

/**
 * One person in the directory.
 *
 * It wraps `PersonRef`, which carries no `memberId`, and adds nothing that
 * could stand in for one: members and non-members are drawn identically,
 * because holding an account is a permission fact and this is a family.
 */
export const directoryPersonSchema = z.object({
  person: personRefSchema,
  /** Per viewer. */
  itemCount: z.number().int().nonnegative(),
  /** Null when `itemCount` is 0. */
  firstCapturedOn: calendarDateSchema.nullable(),
  /** Null when `itemCount` is 0. */
  lastCapturedOn: calendarDateSchema.nullable(),
  /**
   * One source, not a `MediaRef`: the card draws a decorative thumbnail with
   * an empty alt and never opens it, so the display URL, the video sources
   * and the generated alt text would all be minted unread. Null draws the
   * ghost frame.
   */
  face: mediaSourceSchema.nullable(),
});

/** One person in the directory. */
export type DirectoryPerson = z.infer<typeof directoryPersonSchema>;

/**
 * The people directory.
 *
 * `peopleCount` is **not** per viewer, which is one of `conventions.md`'s
 * three documented exceptions: a person's existence is not visibility-scoped,
 * only their photographs are, and surface 7's "6 of 10 people" depends on a
 * directory that does not change shape per reader.
 */
export const peopleResponseSchema = collectionSchema({
  resourceKey: "people",
  itemSchema: directoryPersonSchema,
}).extend({
  peopleCount: z.number().int().nonnegative(),
});

/** The people directory. */
export type PeopleResponse = z.infer<typeof peopleResponseSchema>;

/**
 * What the viewer has had on screen.
 *
 * The route answers `204` and reports nothing about these ids. An id that does
 * not exist and an id the viewer's predicate excludes are both silently
 * ignored: per-id feedback of any kind, even a count of rows written, would
 * turn a batch endpoint into a visibility oracle.
 */
export const itemsSeenRequestSchema = z.object({
  /** Items the viewer has actually had on screen. */
  itemIds: z.array(idSchema).max(LIMITS.seenMaxIds),
  /**
   * Bursts drawn as a collapsed stack, expanded to their visible frames on
   * the server, so a stack standing for forty-five frames latches all of them
   * without the client ever holding forty-five ids.
   */
  burstIds: z.array(idSchema).max(LIMITS.seenMaxIds).default([]),
});

/** What the viewer has had on screen. */
export type ItemsSeenRequest = z.infer<typeof itemsSeenRequestSchema>;
```

- [ ] **Step 4: Export it from the barrel**

In `packages/shared/src/index.ts`, add one export block, keeping the file's
alphabetical order by module path (after the `./settings.ts` block):

```ts
export {
  dayMilestoneBandSchema,
  dayMilestoneStripSchema,
  directoryPersonSchema,
  filterFacetsRequestSchema,
  filterFacetsResponseSchema,
  itemsSeenRequestSchema,
  peopleRequestSchema,
  peopleResponseSchema,
  personFacetSchema,
  railDaySchema,
  tagCountSchema,
  tagFacetSchema,
  tagsRequestSchema,
  tagsResponseSchema,
  timelineDaySchema,
  timelineFilterQuerySchema,
  timelineRailRequestSchema,
  timelineRailResponseSchema,
  timelineRequestSchema,
  timelineResponseSchema,
  type DayMilestoneBand,
  type DayMilestoneStrip,
  type DirectoryPerson,
  type FilterFacetsRequest,
  type FilterFacetsResponse,
  type ItemsSeenRequest,
  type PeopleRequest,
  type PeopleResponse,
  type PersonFacet,
  type RailDay,
  type TagCount,
  type TagFacet,
  type TagsRequest,
  type TagsResponse,
  type TimelineDay,
  type TimelineRailRequest,
  type TimelineRailResponse,
  type TimelineRequest,
  type TimelineResponse,
} from "./timeline.ts";
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/shared test`
Expected: PASS, all cases.

- [ ] **Step 6: Check the server can still import the package at runtime**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/sharedRuntimeImport.test.ts`
Expected: PASS. The new module is plain erasable TypeScript, so it loads under
Node's type stripping like the rest.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/timeline.ts packages/shared/src/index.ts packages/shared/test/timeline.test.ts
git commit -m "feat(shared): the read slice's six routes, as schemas"
```

---

## Task 4: Seeds for the catalog, and a way to count queries

Every later task needs to put photographs, tags, people, occasions and views
into a database. These helpers are the only place that knows the column
defaults, so a test reads as the thing it is testing.

**Files:**

- Create: `apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts`
- Modify: `apps/server/test/helpers/seedHelpers/seedHelpers.ts`
- Create: `apps/server/test/helpers/createQueryCountingDatabase.ts`
- Test: `apps/server/test/helpers/archiveSeedHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/helpers/archiveSeedHelpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createQueryCountingDatabase } from "./createQueryCountingDatabase.ts";
import {
  insertBurst,
  insertItem,
  insertItemPerson,
  insertItemTag,
  insertItemView,
  insertMember,
  insertPerson,
  insertRendition,
  insertTag,
  insertUploadSession,
  setBurstCover,
} from "./seedHelpers/seedHelpers.ts";

describe("the archive seeds", () => {
  it("builds a burst with a cover, a tag, a person and a view", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const memberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      burst_id: burstId,
      burst_index: 1,
      seq: 1,
    });
    await setBurstCover(database, { burstId, coverItemId: itemId });
    await insertRendition(database, { itemId, purpose: "thumb" });
    const tagId = await insertTag(database, { name: "Beach" });
    await insertItemTag(database, { itemId, tagId });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId, personId });
    await insertItemView(database, { memberId, itemId });

    const rows = await database
      .selectFrom("items")
      .innerJoin("bursts", "bursts.id", "items.burst_id")
      .select(["items.id as itemId", "bursts.cover_item_id as coverItemId"])
      .execute();
    expect(rows).toEqual([{ itemId, coverItemId: itemId }]);

    const tag = await database
      .selectFrom("tags")
      .select(["name", "name_normalized"])
      .executeTakeFirstOrThrow();
    expect(tag).toEqual({ name: "Beach", name_normalized: "beach" });

    await database.destroy();
  });

  it("counts every query the handle runs", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const counting = createQueryCountingDatabase(database);

    counting.reset();
    await counting.database.selectFrom("items").select("id").execute();
    await counting.database.selectFrom("members").select("id").execute();

    expect(counting.getQueryCount()).toBe(2);
    await database.destroy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/helpers/archiveSeedHelpers.test.ts`
Expected: FAIL, cannot resolve `./createQueryCountingDatabase.ts`.

- [ ] **Step 3: Write the seed helpers**

Create `apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts`:

```ts
import type { Kysely } from "kysely";
import { createId } from "../../../src/db/createId.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import { NOW } from "./seedTime.ts";

/**
 * Inserts one stored object for an item and returns its id.
 *
 * Defaults to a thumbnail, which is the rendition every print needs and the
 * one a test that does not care about media still has to have.
 */
export async function insertRendition(
  database: Kysely<Database>,
  options: { itemId: string } & Partial<Database["item_renditions"]>,
): Promise<string> {
  const { itemId, ...overrides } = options;
  const id = overrides.id ?? createId();
  const purpose = overrides.purpose ?? "thumb";
  await database
    .insertInto("item_renditions")
    .values({
      id,
      item_id: itemId,
      purpose,
      // Unique across the table, so two renditions cannot claim one object.
      storage_key: `items/${itemId}/${purpose}.jpg`,
      content_type: "image/jpeg",
      byte_size: 120_000,
      width: 800,
      height: 600,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one tag, normalising its name the way the product does. */
export async function insertTag(
  database: Kysely<Database>,
  options: { name: string } & Partial<Database["tags"]>,
): Promise<string> {
  const { name, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("tags")
    .values({
      id,
      name,
      name_normalized: name.trim().toLowerCase().replace(/\s+/g, " "),
      created_by: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Puts one tag on one item. */
export async function insertItemTag(
  database: Kysely<Database>,
  options: { itemId: string; tagId: string } & Partial<Database["item_tags"]>,
): Promise<string> {
  const { itemId, tagId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("item_tags")
    .values({
      id,
      item_id: itemId,
      tag_id: tagId,
      tagged_by: null,
      tagged_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one person, member or not, and returns their id. */
export async function insertPerson(
  database: Kysely<Database>,
  options: { displayName: string } & Partial<Database["people"]>,
): Promise<string> {
  const { displayName, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("people")
    .values({
      id,
      display_name: displayName,
      member_id: null,
      preferred_face_item_id: null,
      created_by: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Tags one person in one item. */
export async function insertItemPerson(
  database: Kysely<Database>,
  options: { itemId: string; personId: string } & Partial<
    Database["item_people"]
  >,
): Promise<string> {
  const { itemId, personId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("item_people")
    .values({
      id,
      item_id: itemId,
      person_id: personId,
      tagged_by: null,
      tagged_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/**
 * Inserts one occasion.
 *
 * `endsOn` defaults to `startsOn`, which is how a one-day occasion is spelled:
 * `ends_on` is never null, and that one shape is the span model.
 */
export async function insertMilestone(
  database: Kysely<Database>,
  options: { name: string; startsOn: string } & Partial<
    Database["milestones"]
  > & { endsOn?: string },
): Promise<string> {
  const { name, startsOn, endsOn, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("milestones")
    .values({
      id,
      name,
      starts_on: startsOn,
      ends_on: endsOn ?? startsOn,
      blurb: null,
      created_by: null,
      created_at: NOW,
      updated_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Attaches one item to one occasion. */
export async function insertItemMilestone(
  database: Kysely<Database>,
  options: { itemId: string; milestoneId: string } & Partial<
    Database["item_milestones"]
  >,
): Promise<string> {
  const { itemId, milestoneId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("item_milestones")
    .values({
      id,
      item_id: itemId,
      milestone_id: milestoneId,
      attached_by: null,
      attached_at: NOW,
      span_mismatch_acknowledged_at: null,
      ...overrides,
    })
    .execute();
  return id;
}

/**
 * Inserts one burst and returns its id.
 *
 * `cover_item_id` is left null, because the frames do not exist yet: a cover
 * is set afterwards with {@link setBurstCover}.
 */
export async function insertBurst(
  database: Kysely<Database>,
  options: { uploadSessionId: string; capturedOn: string } & Partial<
    Database["bursts"]
  >,
): Promise<string> {
  const { uploadSessionId, capturedOn, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("bursts")
    .values({
      id,
      upload_session_id: uploadSessionId,
      captured_on: capturedOn,
      starts_at: `${capturedOn}T06:41:00.000Z`,
      ends_at: `${capturedOn}T06:44:00.000Z`,
      detector_version: 1,
      threshold_seconds: 10,
      detected_at: NOW,
      is_manual: 0,
      cover_item_id: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Names one frame as a burst's cover, after that frame exists. */
export async function setBurstCover(
  database: Kysely<Database>,
  options: { burstId: string; coverItemId: string },
): Promise<void> {
  await database
    .updateTable("bursts")
    .set({ cover_item_id: options.coverItemId })
    .where("id", "=", options.burstId)
    .execute();
}

/** Marks one item as seen by one member, the way the latch would. */
export async function insertItemView(
  database: Kysely<Database>,
  options: { memberId: string; itemId: string } & Partial<
    Database["item_views"]
  >,
): Promise<string> {
  const { memberId, itemId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("item_views")
    .values({
      id,
      member_id: memberId,
      item_id: itemId,
      first_seen_at: NOW,
      first_opened_at: null,
      last_opened_at: null,
      open_count: 0,
      ...overrides,
    })
    .execute();
  return id;
}
```

- [ ] **Step 4: Add them to the seed barrel**

In `apps/server/test/helpers/seedHelpers/seedHelpers.ts`, add the line, keeping
alphabetical order:

```ts
export * from "./archiveSeedHelpers.ts";
```

- [ ] **Step 5: Write the query counter**

Create `apps/server/test/helpers/createQueryCountingDatabase.ts`:

```ts
import type {
  Kysely,
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from "kysely";
import type { Database } from "../../src/db/types/db.types.ts";

/** A handle that counts what it ran, and the counter beside it. */
export type QueryCountingDatabase = {
  /** Pass this to `createTestApp`, so the app runs what is counted. */
  database: Kysely<Database>;
  getQueryCount: () => number;
  /** Call after seeding, so the count covers the request and not the setup. */
  reset: () => void;
};

/**
 * Wraps a database handle so a test can assert what one request costs.
 *
 * The contract this exists for is that **no query in the read slice is per
 * item, per day or per burst** (`timeline.md` § Performance). That is a
 * property of the plan rather than of any one number, so the test it serves
 * asserts the same count for a small page and a large one.
 *
 * A Kysely plugin rather than the dialect's logger: `transformQuery` runs once
 * per execution, before compilation, which is exactly one tick per query and
 * needs no parsing of log lines.
 *
 * @param database The handle to wrap. It is not modified; a new one is
 *   returned that shares its driver.
 */
export function createQueryCountingDatabase(
  database: Kysely<Database>,
): QueryCountingDatabase {
  let queryCount = 0;
  const plugin: KyselyPlugin = {
    transformQuery: (args: PluginTransformQueryArgs): RootOperationNode => {
      queryCount += 1;
      return args.node;
    },
    transformResult: (
      args: PluginTransformResultArgs,
    ): Promise<QueryResult<UnknownRow>> => {
      return Promise.resolve(args.result);
    },
  };

  return {
    database: database.withPlugin(plugin),
    getQueryCount: () => {
      return queryCount;
    },
    reset: () => {
      queryCount = 0;
    },
  };
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/helpers/archiveSeedHelpers.test.ts`
Expected: PASS, both cases.

- [ ] **Step 7: Commit**

```bash
git add apps/server/test/helpers
git commit -m "test(archive): seeds for the catalog, and a query counter"
```

---

## Task 5: One selection expression, and every count takes it

The rule that outranks the others, made structural. A count and the rows it
heads cannot disagree when they are the same expression, and they start to the
moment somebody retypes the clause.

**Files:**

- Create: `apps/server/src/archive/selectionFilter.ts`
- Test: `apps/server/test/archive/selectionFilter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/archive/selectionFilter.test.ts`:

```ts
import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import {
  hasAnyFilter,
  hasContentFilter,
  makeSelectionExpressionFromFilter,
  makeTimelineFilterFromQuery,
} from "../../src/archive/selectionFilter.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertPerson,
  insertTag,
  insertVisibilityRule,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** A plain viewer who can see the `everyone` rule and nothing else. */
function makeViewer(memberId: string): Viewer {
  return {
    memberId,
    sessionId: "a-session",
    role: "viewer",
    isAdmin: false,
    visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
  };
}

describe("makeTimelineFilterFromQuery", () => {
  it("sorts and dedupes, so one selection has one digest", () => {
    const filter = makeTimelineFilterFromQuery({
      tags: ["b", "a", "a"],
      people: ["d", "c"],
    });
    expect(filter.tagIds).toEqual(["a", "b"]);
    expect(filter.personIds).toEqual(["c", "d"]);
  });

  it("ignores excludeAttached with no milestone beside it", () => {
    expect(makeTimelineFilterFromQuery({ excludeAttached: true }).excludeAttached).toBe(
      false,
    );
  });
});

describe("hasContentFilter", () => {
  it("is false for a date range, which keeps the milestone union", () => {
    const filter = makeTimelineFilterFromQuery({ from: "2026-09-01" });
    expect(hasContentFilter(filter)).toBe(false);
    expect(hasAnyFilter(filter)).toBe(true);
  });

  it("is true for a tag, a person or a milestone attachment", () => {
    expect(hasContentFilter(makeTimelineFilterFromQuery({ tags: ["a"] }))).toBe(true);
    expect(hasContentFilter(makeTimelineFilterFromQuery({ people: ["a"] }))).toBe(true);
    expect(
      hasContentFilter(makeTimelineFilterFromQuery({ attachedToMilestoneId: "a" })),
    ).toBe(true);
  });

  it("is false for nothing selected at all", () => {
    expect(hasAnyFilter(makeTimelineFilterFromQuery({}))).toBe(false);
  });
});

describe("makeSelectionExpressionFromFilter", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  const selectIds = async (options: {
    viewer: Viewer;
    filter: ReturnType<typeof makeTimelineFilterFromQuery>;
  }): Promise<string[]> => {
    const rows = await database
      .selectFrom("items")
      .select("items.id as id")
      .where(
        makeSelectionExpressionFromFilter({
          viewer: options.viewer,
          filter: options.filter,
        }),
      )
      .orderBy("items.seq", "asc")
      .execute();
    return rows.map((row) => {
      return row.id;
    });
  };

  it("keeps only what the viewer may see", async () => {
    const memberId = await insertMember(database);
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const visibleId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibility_rule_id: restrictedRuleId,
    });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toEqual([visibleId]);
  });

  it("keeps an item the viewer uploaded under a rule they cannot see", async () => {
    const memberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, { mode: "only" });
    const mineId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      visibility_rule_id: restrictedRuleId,
    });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toEqual([mineId]);
  });

  it("ANDs two tags rather than fanning the row out", async () => {
    const memberId = await insertMember(database);
    const bothId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const oneId = await insertItem(database, { uploadedBy: memberId, seq: 2 });
    const beachId = await insertTag(database, { name: "beach" });
    const summerId = await insertTag(database, { name: "summer" });
    await insertItemTag(database, { itemId: bothId, tagId: beachId });
    await insertItemTag(database, { itemId: bothId, tagId: summerId });
    await insertItemTag(database, { itemId: oneId, tagId: beachId });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({ tags: [beachId, summerId] }),
      }),
    ).toEqual([bothId]);
  });

  it("narrows to nothing on an id that does not exist", async () => {
    const memberId = await insertMember(database);
    await insertItem(database, { uploadedBy: memberId, seq: 1 });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({
          tags: ["0199c0a0-0000-7000-8000-00000000dead"],
        }),
      }),
    ).toEqual([]);
  });

  it("ANDs a person with a date range", async () => {
    const memberId = await insertMember(database);
    const insideId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    const outsideId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-08-01",
    });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId: insideId, personId });
    await insertItemPerson(database, { itemId: outsideId, personId });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({
          people: [personId],
          from: "2026-09-01",
          until: "2026-09-30",
        }),
      }),
    ).toEqual([insideId]);
  });

  it("takes attachedToMilestoneId both ways round", async () => {
    const memberId = await insertMember(database);
    const attachedId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const looseId = await insertItem(database, { uploadedBy: memberId, seq: 2 });
    const milestoneId = await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-17",
    });
    await insertItemMilestone(database, { itemId: attachedId, milestoneId });

    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({ attachedToMilestoneId: milestoneId }),
      }),
    ).toEqual([attachedId]);
    expect(
      await selectIds({
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({
          attachedToMilestoneId: milestoneId,
          excludeAttached: true,
        }),
      }),
    ).toEqual([looseId]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/selectionFilter.test.ts`
Expected: FAIL, cannot resolve `../../src/archive/selectionFilter.ts`.

- [ ] **Step 3: Write the module**

Create `apps/server/src/archive/selectionFilter.ts`:

```ts
import { expressionBuilder } from "kysely";
import type { Expression, ExpressionBuilder, SqlBool } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";

/**
 * One selection, normalised: what the viewer asked the archive to narrow to.
 *
 * Normalised means the ids are sorted and deduplicated, which the request
 * schema already does and this type then preserves. Two spellings of one
 * selection must produce one filter, because the cursor's digest is taken over
 * it and a different digest is a `400`.
 */
export type TimelineFilter = {
  tagIds: string[];
  personIds: string[];
  from: string | undefined;
  until: string | undefined;
  attachedToMilestoneId: string | undefined;
  excludeAttached: boolean;
};

/**
 * Reads a parsed query string as a selection.
 *
 * Takes the shape of any of this slice's request schemas, which is why every
 * field is optional: the rail and the facets carry four of the six.
 *
 * @param query The parsed query string.
 */
export function makeTimelineFilterFromQuery(query: {
  tags?: readonly string[];
  people?: readonly string[];
  from?: string;
  until?: string;
  attachedToMilestoneId?: string;
  excludeAttached?: boolean;
}): TimelineFilter {
  return {
    tagIds: [...new Set(query.tags ?? [])].sort(),
    personIds: [...new Set(query.people ?? [])].sort(),
    from: query.from,
    until: query.until,
    attachedToMilestoneId: query.attachedToMilestoneId,
    // "Only meaningful beside `attachedToMilestoneId`", so on its own it is
    // dropped rather than rejected: a `400` there would break a bookmark and
    // buy nothing.
    excludeAttached:
      query.attachedToMilestoneId === undefined
        ? false
        : query.excludeAttached === true,
  };
}

/**
 * Whether the selection narrows by **content**, which turns the union off.
 *
 * A date range alone is a window on the same timeline, so milestone-only days
 * survive it and surface 2's `milestone-empty` state keeps working under a
 * date window. A tag, a person or a milestone attachment is a content
 * predicate, and a day with zero matching items is not a result: adding one
 * would put an empty day in the middle of a result list whose strip says 88
 * (`timeline.md` Ruling 1).
 */
export function hasContentFilter(filter: Readonly<TimelineFilter>): boolean {
  return (
    filter.tagIds.length > 0 ||
    filter.personIds.length > 0 ||
    filter.attachedToMilestoneId !== undefined
  );
}

/** Whether anything at all is selected, which is what `resultCount` answers. */
export function hasAnyFilter(filter: Readonly<TimelineFilter>): boolean {
  return (
    hasContentFilter(filter) ||
    filter.from !== undefined ||
    filter.until !== undefined
  );
}

/**
 * Builds one item, ANDed together: this viewer's visibility predicate and
 * everything they asked to narrow by.
 *
 * **Every count and every row list in this slice composes this same
 * expression**, which is what makes it impossible for a count and the page it
 * heads to disagree (`data-models.md` § One rule that outranks the others). No
 * route rewrites the clause, and no count reads a stored column.
 *
 * Filtering is one `EXISTS` per selected tag and one per selected person,
 * never repeated joins: a repeated join fans the row out and turns a count
 * into a multiple of itself, while each `EXISTS` is a single index probe.
 * `item_tags` and `item_people` are indexed both ways so the planner can drive
 * from whichever predicate is most selective.
 *
 * It builds its own expression builder over `items`, the same way
 * `applyVisibilityFilter` does and for the same reason: the caller's builder
 * usually has other tables in scope, which the types would reject, and the
 * expression is independent of the builder that made it. So the result drops
 * straight into a `where`, an `on` or another expression.
 *
 * `item_people` appears here only as a filter the caller asked for. It must
 * never appear in a visibility expression: being in a photograph is not a key
 * to it (Decision 7).
 *
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 * @returns The predicate, true for the rows this request may count and draw.
 */
export function makeSelectionExpressionFromFilter(options: {
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Expression<SqlBool> {
  const { viewer, filter } = options;
  const eb: ExpressionBuilder<Database, "items"> = expressionBuilder<
    Database,
    "items"
  >();

  const dateConditions = [
    ...(filter.from === undefined
      ? []
      : [eb("items.captured_on", ">=", filter.from)]),
    ...(filter.until === undefined
      ? []
      : [eb("items.captured_on", "<=", filter.until)]),
  ];

  const tagConditions = filter.tagIds.map((tagId) => {
    return eb.exists(
      eb
        .selectFrom("item_tags")
        .select("item_tags.id")
        .whereRef("item_tags.item_id", "=", "items.id")
        .where("item_tags.tag_id", "=", tagId),
    );
  });

  const personConditions = filter.personIds.map((personId) => {
    return eb.exists(
      eb
        .selectFrom("item_people")
        .select("item_people.id")
        .whereRef("item_people.item_id", "=", "items.id")
        .where("item_people.person_id", "=", personId),
    );
  });

  const attachedConditions =
    filter.attachedToMilestoneId === undefined
      ? []
      : [
          _makeAttachedCondition({
            eb,
            milestoneId: filter.attachedToMilestoneId,
            exclude: filter.excludeAttached,
          }),
        ];

  return eb.and([
    visibilityExpression({ eb, viewer }),
    ...dateConditions,
    ...tagConditions,
    ...personConditions,
    ...attachedConditions,
  ]);
}

/** Attached to one occasion, or deliberately not attached to it. */
function _makeAttachedCondition(options: {
  eb: ExpressionBuilder<Database, "items">;
  milestoneId: string;
  exclude: boolean;
}): Expression<SqlBool> {
  const attached = options.eb.exists(
    options.eb
      .selectFrom("item_milestones")
      .select("item_milestones.id")
      .whereRef("item_milestones.item_id", "=", "items.id")
      .where("item_milestones.milestone_id", "=", options.milestoneId),
  );
  return options.exclude ? options.eb.not(attached) : attached;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/selectionFilter.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/archive/selectionFilter.ts apps/server/test/archive/selectionFilter.test.ts
git commit -m "feat(archive): one selection expression, shared by rows and counts"
```

---

## Task 6: The cursor, and the digest that keeps it honest

**Files:**

- Create: `apps/server/src/archive/timelineCursor.ts`
- Test: `apps/server/test/archive/timelineCursor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/archive/timelineCursor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilter.ts";
import {
  getPageStateFromTimelineCursor,
  makeDigestFromFilter,
  makeOpenedIdsForCursor,
  makeTimelineCursorFromPageState,
} from "../../src/archive/timelineCursor.ts";

const FIRST_MILESTONE = "0199c0a0-0000-7000-8000-000000000001";
const SECOND_MILESTONE = "0199c0a0-0000-7000-8000-000000000002";

describe("the timeline cursor", () => {
  it("round-trips the day, the opened set and the digest", () => {
    const state = {
      lastDay: "2026-09-11",
      openedMilestoneIds: [FIRST_MILESTONE],
      filterDigest: "abc123",
    };
    expect(
      getPageStateFromTimelineCursor(makeTimelineCursorFromPageState(state)),
    ).toEqual(state);
  });

  it("is opaque, and carries no readable day", () => {
    const cursor = makeTimelineCursorFromPageState({
      lastDay: "2026-09-11",
      openedMilestoneIds: [],
      filterDigest: "abc123",
    });
    expect(cursor).not.toContain("2026-09-11");
  });

  it("returns nothing for a cursor that does not decode", () => {
    expect(getPageStateFromTimelineCursor("not-a-cursor")).toBeUndefined();
    expect(getPageStateFromTimelineCursor("")).toBeUndefined();
    expect(
      getPageStateFromTimelineCursor(
        Buffer.from(JSON.stringify({ d: "yesterday" })).toString("base64url"),
      ),
    ).toBeUndefined();
  });
});

describe("makeDigestFromFilter", () => {
  it("is the same for two spellings of one selection", () => {
    expect(
      makeDigestFromFilter(
        makeTimelineFilterFromQuery({ tags: ["b", "a"] }),
      ),
    ).toBe(
      makeDigestFromFilter(
        makeTimelineFilterFromQuery({ tags: ["a", "b", "a"] }),
      ),
    );
  });

  it("differs when the selection differs", () => {
    expect(
      makeDigestFromFilter(makeTimelineFilterFromQuery({ tags: ["a"] })),
    ).not.toBe(
      makeDigestFromFilter(makeTimelineFilterFromQuery({ tags: ["b"] })),
    );
  });

  it("ignores the page size, which is not a different feed", () => {
    const filter = makeTimelineFilterFromQuery({ from: "2026-09-01" });
    expect(makeDigestFromFilter(filter)).toBe(makeDigestFromFilter({ ...filter }));
  });
});

describe("makeOpenedIdsForCursor", () => {
  const milestones = [
    {
      milestoneId: FIRST_MILESTONE,
      name: "A week at the grandparents'",
      startsOn: "2026-09-08",
      endsOn: "2026-09-13",
      blurb: null,
    },
    {
      milestoneId: SECOND_MILESTONE,
      name: "Home from the hospital",
      startsOn: "2026-09-17",
      endsOn: "2026-09-17",
      blurb: null,
    },
  ];

  it("keeps an occasion that can still cover a later page", () => {
    expect(
      makeOpenedIdsForCursor({
        previousOpenedIds: [],
        bandedIds: [FIRST_MILESTONE],
        milestones,
        lastDay: "2026-09-11",
      }),
    ).toEqual([FIRST_MILESTONE]);
  });

  it("prunes one that starts at or after the last day", () => {
    expect(
      makeOpenedIdsForCursor({
        previousOpenedIds: [SECOND_MILESTONE],
        bandedIds: [],
        milestones,
        lastDay: "2026-09-11",
      }),
    ).toEqual([]);
  });

  it("keeps an id it cannot resolve, because it took a band somewhere", () => {
    expect(
      makeOpenedIdsForCursor({
        previousOpenedIds: ["0199c0a0-0000-7000-8000-0000000000ff"],
        bandedIds: [],
        milestones,
        lastDay: "2026-09-11",
      }),
    ).toEqual(["0199c0a0-0000-7000-8000-0000000000ff"]);
  });

  it("does not repeat an id that was opened and banded again", () => {
    expect(
      makeOpenedIdsForCursor({
        previousOpenedIds: [FIRST_MILESTONE],
        bandedIds: [FIRST_MILESTONE],
        milestones,
        lastDay: "2026-09-11",
      }),
    ).toEqual([FIRST_MILESTONE]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/timelineCursor.test.ts`
Expected: FAIL, cannot resolve the module.

- [ ] **Step 3: Write the module**

Create `apps/server/src/archive/timelineCursor.ts`:

```ts
import { createHash } from "node:crypto";
import { z } from "zod";
import type { MilestoneRef } from "@memory-shoebox/shared";
import type { TimelineFilter } from "./selectionFilter.ts";

/**
 * Where the last page stopped, and what it had already said.
 *
 * The band rule is feed-ordered: of the milestones covering a day, the band is
 * the one with the narrowest span that has not already taken a band **further
 * up this feed**. That makes the page's ranking depend on the pages before it,
 * so the state travels in the cursor rather than being recomputed from
 * scratch, which no later page could do.
 */
export type TimelinePageState = {
  /** The `captured_on` of the last day returned. The next page is before it. */
  lastDay: string;
  /** Milestones that have **taken a band**, never merely appeared. */
  openedMilestoneIds: string[];
  /** A digest of the normalised selection this cursor was ranked against. */
  filterDigest: string;
};

/** The wire form, kept short because it travels in a query string. */
const wireStateSchema = z.object({
  d: z.iso.date(),
  o: z.array(z.uuid()),
  f: z.string(),
});

/** How much of the SHA-256 travels. Collisions here cost a `400`, not access. */
const DIGEST_LENGTH = 16;

/**
 * A stable digest of one selection.
 *
 * It exists so a client that changes the filter without resetting the cursor
 * gets a `400` instead of a page ranked against a different feed. `limit` is
 * deliberately not part of it: changing the page size mid-scroll is not a
 * different feed.
 *
 * @param filter The normalised selection.
 */
export function makeDigestFromFilter(
  filter: Readonly<TimelineFilter>,
): string {
  const normalised = JSON.stringify([
    filter.tagIds,
    filter.personIds,
    filter.from ?? "",
    filter.until ?? "",
    filter.attachedToMilestoneId ?? "",
    filter.excludeAttached,
  ]);
  return createHash("sha256")
    .update(normalised)
    .digest("base64url")
    .slice(0, DIGEST_LENGTH);
}

/**
 * Encodes a page state as the opaque cursor the client hands back.
 *
 * Base64url over `{ d, o, f }`. It is not signed, and does not need to be: it
 * encodes nothing the caller does not already know and grants nothing, because
 * every query it feeds still carries the viewer's own predicate.
 *
 * @param state Where this page stopped.
 */
export function makeTimelineCursorFromPageState(
  state: Readonly<TimelinePageState>,
): string {
  return Buffer.from(
    JSON.stringify({
      d: state.lastDay,
      o: state.openedMilestoneIds,
      f: state.filterDigest,
    }),
  ).toString("base64url");
}

/**
 * Reads a cursor, or returns nothing at all.
 *
 * `undefined` rather than a throw, so the route decides what a bad cursor
 * means: it is a `400 invalid_request` naming the parameter, and this module
 * stays free of HTTP.
 *
 * @param cursor The opaque string the client sent.
 */
export function getPageStateFromTimelineCursor(
  cursor: string,
): TimelinePageState | undefined {
  const parsed = wireStateSchema.safeParse(
    _parseJson(Buffer.from(cursor, "base64url").toString("utf8")),
  );
  return parsed.success
    ? {
        lastDay: parsed.data.d,
        openedMilestoneIds: parsed.data.o,
        filterDigest: parsed.data.f,
      }
    : undefined;
}

/**
 * The opened set the next cursor carries.
 *
 * Everything that has taken a band, pruned to milestones whose `starts_on` is
 * strictly before the last day returned: no other milestone can cover a later
 * page, so pruning keeps the set at zero to two entries however long the
 * scroll. An id this page cannot resolve is kept rather than dropped, because
 * it took a band on some earlier page and a page further down may still meet
 * it.
 *
 * @param options.previousOpenedIds What the incoming cursor carried.
 * @param options.bandedIds What took a band on this page.
 * @param options.milestones The occasions this page knows about.
 * @param options.lastDay The `captured_on` of the last day returned.
 */
export function makeOpenedIdsForCursor(options: {
  previousOpenedIds: readonly string[];
  bandedIds: readonly string[];
  milestones: readonly MilestoneRef[];
  lastDay: string;
}): string[] {
  const startsOnById = new Map(
    options.milestones.map((milestone) => {
      return [milestone.milestoneId, milestone.startsOn];
    }),
  );
  return [
    ...new Set([...options.previousOpenedIds, ...options.bandedIds]),
  ].filter((milestoneId) => {
    const startsOn = startsOnById.get(milestoneId);
    return startsOn === undefined || startsOn < options.lastDay;
  });
}

/** JSON, or nothing. A cursor somebody typed is not an exception. */
function _parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/timelineCursor.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/archive/timelineCursor.ts apps/server/test/archive/timelineCursor.test.ts
git commit -m "feat(archive): the opaque cursor, its opened set and its digest"
```

---

## Task 7: Milestone spans, and which occasion takes the day

A port of `prototypes/src/data/milestones.ts` `rankMilestonesForDay`, including
its `alreadyOpened` argument and its tie break, with no `dayjs`: these are
calendar dates, so the arithmetic is UTC midnights and plain string comparison.

**Files:**

- Create: `apps/server/src/archive/milestoneSpans.ts`
- Test: `apps/server/test/archive/milestoneSpans.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/archive/milestoneSpans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MilestoneRef } from "@memory-shoebox/shared";
import {
  getDayCountFromMilestone,
  getDayPositionFromMilestone,
  getDaysFromMilestone,
  rankMilestonesForDay,
} from "../../src/archive/milestoneSpans.ts";

/** A five-day visit and the one-day occasion inside it. */
const WEEK: MilestoneRef = {
  milestoneId: "0199c0a0-0000-7000-8000-000000000001",
  name: "Mateo's first week at home",
  startsOn: "2026-09-17",
  endsOn: "2026-09-21",
  blurb: null,
};
const DAY: MilestoneRef = {
  milestoneId: "0199c0a0-0000-7000-8000-000000000002",
  name: "Home from the hospital",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};

describe("span arithmetic", () => {
  it("counts both ends", () => {
    expect(getDayCountFromMilestone(WEEK)).toBe(5);
    expect(getDayCountFromMilestone(DAY)).toBe(1);
  });

  it("lists every date in the span", () => {
    expect(getDaysFromMilestone(WEEK)).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
    ]);
  });

  it("counts a position from one", () => {
    expect(
      getDayPositionFromMilestone({ milestone: WEEK, day: "2026-09-19" }),
    ).toBe(3);
  });

  it("crosses a month and a year without drifting", () => {
    const newYear: MilestoneRef = {
      ...DAY,
      startsOn: "2026-12-30",
      endsOn: "2027-01-02",
    };
    expect(getDayCountFromMilestone(newYear)).toBe(4);
    expect(getDaysFromMilestone(newYear)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });
});

describe("rankMilestonesForDay", () => {
  it("gives the band to the narrowest span and strips the rest", () => {
    const ranked = rankMilestonesForDay({
      milestones: [WEEK, DAY],
      day: "2026-09-17",
      openedMilestoneIds: [],
    });
    expect(ranked.band?.milestoneId).toBe(DAY.milestoneId);
    expect(
      ranked.strips.map((milestone) => {
        return milestone.milestoneId;
      }),
    ).toEqual([WEEK.milestoneId]);
  });

  it("breaks a tie by the earliest start", () => {
    const later: MilestoneRef = {
      ...DAY,
      milestoneId: "0199c0a0-0000-7000-8000-000000000003",
      startsOn: "2026-09-18",
      endsOn: "2026-09-22",
    };
    const ranked = rankMilestonesForDay({
      milestones: [later, WEEK],
      day: "2026-09-18",
      openedMilestoneIds: [],
    });
    expect(ranked.band?.milestoneId).toBe(WEEK.milestoneId);
  });

  it("never opens a second band for an occasion already opened", () => {
    const ranked = rankMilestonesForDay({
      milestones: [WEEK, DAY],
      day: "2026-09-17",
      openedMilestoneIds: [DAY.milestoneId],
    });
    expect(ranked.band?.milestoneId).toBe(WEEK.milestoneId);
    expect(
      ranked.strips.map((milestone) => {
        return milestone.milestoneId;
      }),
    ).toEqual([DAY.milestoneId]);
  });

  it("leaves a day with no band when everything covering it has opened", () => {
    const ranked = rankMilestonesForDay({
      milestones: [WEEK],
      day: "2026-09-19",
      openedMilestoneIds: [WEEK.milestoneId],
    });
    expect(ranked.band).toBeUndefined();
    expect(ranked.strips).toHaveLength(1);
  });

  it("ignores an occasion that does not cover the day", () => {
    const ranked = rankMilestonesForDay({
      milestones: [WEEK, DAY],
      day: "2026-09-25",
      openedMilestoneIds: [],
    });
    expect(ranked.band).toBeUndefined();
    expect(ranked.strips).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/milestoneSpans.test.ts`
Expected: FAIL, cannot resolve the module.

- [ ] **Step 3: Write the module**

Create `apps/server/src/archive/milestoneSpans.ts`:

```ts
import type { MilestoneRef } from "@memory-shoebox/shared";

/**
 * A milestone is a span, and everything the timeline says about one comes from
 * here.
 *
 * `ends_on` is inclusive and equals `starts_on` for a one-day occasion, never
 * null, and that one shape **is** the span model: nothing downstream branches
 * on "the kind with one date".
 *
 * The arithmetic is UTC midnights rather than a date library, which is exact
 * because these are calendar dates with no zone of their own: `shoebox.timezone`
 * decided which day a photograph landed on at write time, and a span is
 * compared to the `captured_on` that resulted.
 */

const MILLISECONDS_PER_DAY = 86_400_000;

/** One `YYYY-MM-DD` as a UTC midnight. */
function _getTimeFromDay(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** One UTC midnight back as `YYYY-MM-DD`. */
function _getDayFromTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** How many days the occasion covers, counting both ends. */
export function getDayCountFromMilestone(
  milestone: Readonly<MilestoneRef>,
): number {
  return (
    Math.round(
      (_getTimeFromDay(milestone.endsOn) - _getTimeFromDay(milestone.startsOn)) /
        MILLISECONDS_PER_DAY,
    ) + 1
  );
}

/** Every date in the span, in order. */
export function getDaysFromMilestone(
  milestone: Readonly<MilestoneRef>,
): string[] {
  const startsAt = _getTimeFromDay(milestone.startsOn);
  return Array.from(
    { length: getDayCountFromMilestone(milestone) },
    (_unused, index) => {
      return _getDayFromTime(startsAt + index * MILLISECONDS_PER_DAY);
    },
  );
}

/** Which day of the occasion a date is, counting from one. */
export function getDayPositionFromMilestone(options: {
  milestone: Readonly<MilestoneRef>;
  day: string;
}): number {
  return (
    Math.round(
      (_getTimeFromDay(options.day) -
        _getTimeFromDay(options.milestone.startsOn)) /
        MILLISECONDS_PER_DAY,
    ) + 1
  );
}

/**
 * Which occasion takes this day's one full band, and which continue as strips.
 *
 * A day covered by two occasions still gets one headline. **The narrowest span
 * wins it**, because the narrower thing is the more specific thing to say
 * about that day: the 17th is the day they came home, and it is also the first
 * of five quiet days at home, and the first of those is the news. Ties break by
 * earliest start, so the rule is total and the wall does not reshuffle between
 * visits (Decision 14).
 *
 * `openedMilestoneIds` wins over all of it: an occasion whose band opened on a
 * day further up the feed never opens a second one. What counts as opened is
 * what **took a band**, never merely what appeared, so an occasion that has
 * only ever been a strip still gets its full band on the next day it wins one.
 *
 * The feed runs newest first, so "the first of its days you meet" is a
 * multi-day occasion's **last** date: the band opens there and the strips
 * descend with it. This reproduces `prototypes/src/data/milestones.ts`
 * `rankMilestonesForDay` exactly, and the client draws what it is given.
 *
 * @param options.milestones Every occasion known to this page.
 * @param options.day The `captured_on` being ranked.
 * @param options.openedMilestoneIds What has already taken a band.
 */
export function rankMilestonesForDay(options: {
  milestones: readonly MilestoneRef[];
  day: string;
  openedMilestoneIds: readonly string[];
}): { band: MilestoneRef | undefined; strips: MilestoneRef[] } {
  const covering = options.milestones
    .filter((milestone) => {
      return milestone.startsOn <= options.day && milestone.endsOn >= options.day;
    })
    .sort((left, right) => {
      return left.startsOn.localeCompare(right.startsOn);
    });

  const [band] = covering
    .filter((milestone) => {
      return !options.openedMilestoneIds.includes(milestone.milestoneId);
    })
    .sort((left, right) => {
      const byWidth =
        getDayCountFromMilestone(left) - getDayCountFromMilestone(right);
      return byWidth === 0
        ? left.startsOn.localeCompare(right.startsOn)
        : byWidth;
    });

  return {
    band,
    strips: covering.filter((milestone) => {
      return milestone.milestoneId !== band?.milestoneId;
    }),
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/milestoneSpans.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/archive/milestoneSpans.ts apps/server/test/archive/milestoneSpans.test.ts
git commit -m "feat(archive): span arithmetic and the one band a day gets"
```

---

## Task 8: The day stream: two queries, a union, a budget and a cut

Queries 1 and 2 of the page, plus the pure merge that turns them into the days
this page returns.

**The milestone window is bounded, and the bound is provable.** Item days are
read with `LIMIT n + 1`; if there is a `(n + 1)`-th, no date below it can reach
this page, because every such date already has at least `n + 1` item days above
it in the merged descending order. So milestones overlapping
`[day(n + 1), cursorDay]` are all that can matter, and with fewer than `n + 1`
item days there is no lower bound at all.

**Files:**

- Create: `apps/server/src/archive/readItemDays.ts`
- Create: `apps/server/src/archive/readOverlappingMilestones.ts`
- Create: `apps/server/src/archive/mergeDays.ts`
- Create: `apps/server/src/archive/readDayStream.ts`
- Test: `apps/server/test/archive/readDayStream.test.ts`
- Test: `apps/server/test/archive/mergeDays.test.ts`

- [ ] **Step 1: Write the failing test for the pure merge**

Create `apps/server/test/archive/mergeDays.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getUnionDaysFromMilestones,
  makeDayPageFromCandidates,
  makeMergedDays,
} from "../../src/archive/mergeDays.ts";

const WEEK = {
  milestoneId: "0199c0a0-0000-7000-8000-000000000001",
  name: "A week at the grandparents'",
  startsOn: "2026-09-09",
  endsOn: "2026-09-13",
  blurb: null,
};

const makeDay = (capturedOn: string, itemCount: number) => {
  return { capturedOn, itemCount, unseenCount: 0 };
};

describe("getUnionDaysFromMilestones", () => {
  it("expands a span into its days", () => {
    expect(
      getUnionDaysFromMilestones({
        milestones: [WEEK],
        fromDay: undefined,
        untilDay: undefined,
        beforeDay: undefined,
        sinceDay: undefined,
      }),
    ).toEqual([
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("clips to the date range, which a date filter keeps", () => {
    expect(
      getUnionDaysFromMilestones({
        milestones: [WEEK],
        fromDay: "2026-09-11",
        untilDay: "2026-09-12",
        beforeDay: undefined,
        sinceDay: undefined,
      }),
    ).toEqual(["2026-09-11", "2026-09-12"]);
  });

  it("stops strictly before the cursor day, and at the window's floor", () => {
    expect(
      getUnionDaysFromMilestones({
        milestones: [WEEK],
        fromDay: undefined,
        untilDay: undefined,
        beforeDay: "2026-09-12",
        sinceDay: "2026-09-10",
      }),
    ).toEqual(["2026-09-10", "2026-09-11"]);
  });
});

describe("makeMergedDays", () => {
  it("puts milestone-only days in place, newest first", () => {
    expect(
      makeMergedDays({
        itemDays: [makeDay("2026-09-14", 212), makeDay("2026-09-02", 1)],
        milestoneDays: ["2026-09-13"],
      }),
    ).toEqual([
      makeDay("2026-09-14", 212),
      makeDay("2026-09-13", 0),
      makeDay("2026-09-02", 1),
    ]);
  });

  it("does not duplicate a day that has both items and an occasion", () => {
    expect(
      makeMergedDays({
        itemDays: [makeDay("2026-09-14", 212)],
        milestoneDays: ["2026-09-14"],
      }),
    ).toEqual([makeDay("2026-09-14", 212)]);
  });
});

describe("makeDayPageFromCandidates", () => {
  it("cuts at the limit and says there is more", () => {
    const page = makeDayPageFromCandidates({
      candidates: [
        makeDay("2026-09-14", 1),
        makeDay("2026-09-13", 1),
        makeDay("2026-09-12", 1),
      ],
      limit: 2,
      itemBudget: 400,
    });
    expect(
      page.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14", "2026-09-13"]);
    expect(page.hasMore).toBe(true);
  });

  it("says there is no more when everything fits", () => {
    const page = makeDayPageFromCandidates({
      candidates: [makeDay("2026-09-14", 1)],
      limit: 10,
      itemBudget: 400,
    });
    expect(page.hasMore).toBe(false);
  });

  it("stops after the day that passes the budget", () => {
    const page = makeDayPageFromCandidates({
      candidates: [
        makeDay("2026-09-14", 300),
        makeDay("2026-09-13", 150),
        makeDay("2026-09-12", 10),
      ],
      limit: 10,
      itemBudget: 400,
    });
    expect(
      page.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14", "2026-09-13"]);
    expect(page.hasMore).toBe(true);
  });

  it("always returns one day, however fat it is", () => {
    const page = makeDayPageFromCandidates({
      candidates: [makeDay("2026-09-14", 4000), makeDay("2026-09-13", 1)],
      limit: 10,
      itemBudget: 400,
    });
    expect(page.days).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });
});
```

- [ ] **Step 2: Write the failing test for the two queries**

Create `apps/server/test/archive/readDayStream.test.ts`:

```ts
import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilter.ts";
import { readDayStream } from "../../src/archive/readDayStream.ts";
import { readItemDays } from "../../src/archive/readItemDays.ts";
import { readOverlappingMilestones } from "../../src/archive/readOverlappingMilestones.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertItem,
  insertItemTag,
  insertItemView,
  insertMember,
  insertMilestone,
  insertTag,
  insertVisibilityRule,
} from "../helpers/seedHelpers/seedHelpers.ts";

function makeViewer(memberId: string): Viewer {
  return {
    memberId,
    sessionId: "a-session",
    role: "viewer",
    isAdmin: false,
    visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
  };
}

describe("readItemDays", () => {
  let database: Kysely<Database>;
  let memberId: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    memberId = await insertMember(database);
  });

  it("groups by capture day, newest first, with per-viewer counts", async () => {
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 3,
      captured_on: "2026-09-13",
    });

    expect(
      await readItemDays({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toEqual([
      { capturedOn: "2026-09-14", itemCount: 2, unseenCount: 2 },
      { capturedOn: "2026-09-13", itemCount: 1, unseenCount: 1 },
    ]);
  });

  it("keeps a day whose every item has been seen, at unseenCount 0", async () => {
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItemView(database, { memberId, itemId });

    expect(
      await readItemDays({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toEqual([{ capturedOn: "2026-09-14", itemCount: 1, unseenCount: 0 }]);
  });

  it("does not count somebody else's view as this viewer having seen it", async () => {
    const otherMemberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    await insertItemView(database, { memberId: otherMemberId, itemId });

    const days = await readItemDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
    });
    expect(days[0]?.unseenCount).toBe(1);
  });

  it("counts only what the viewer may see", async () => {
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      captured_on: "2026-09-14",
      visibility_rule_id: restrictedRuleId,
    });

    const days = await readItemDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
    });
    expect(days).toEqual([
      { capturedOn: "2026-09-14", itemCount: 1, unseenCount: 1 },
    ]);
  });

  it("stops before the cursor day and at the limit", async () => {
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-13",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 3,
      captured_on: "2026-09-12",
    });

    const days = await readItemDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
      beforeDay: "2026-09-14",
      limit: 1,
    });
    expect(days).toEqual([
      { capturedOn: "2026-09-13", itemCount: 1, unseenCount: 1 },
    ]);
  });
});

describe("readOverlappingMilestones", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("returns what covers the window and nothing else", async () => {
    const insideId = await insertMilestone(database, {
      name: "A week at the grandparents'",
      startsOn: "2026-09-09",
      endsOn: "2026-09-13",
    });
    await insertMilestone(database, {
      name: "Next summer",
      startsOn: "2027-07-01",
      endsOn: "2027-07-10",
    });

    const milestones = await readOverlappingMilestones({
      database,
      fromDay: undefined,
      untilDay: undefined,
      beforeDay: "2026-09-15",
      sinceDay: "2026-09-10",
    });
    expect(
      milestones.map((milestone) => {
        return milestone.milestoneId;
      }),
    ).toEqual([insideId]);
  });

  it("reads as a MilestoneRef, blurb included", async () => {
    const milestoneId = await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-17",
      blurb: "Seven days old",
    });

    expect(
      await readOverlappingMilestones({
        database,
        fromDay: undefined,
        untilDay: undefined,
        beforeDay: undefined,
        sinceDay: undefined,
      }),
    ).toEqual([
      {
        milestoneId,
        name: "Home from the hospital",
        startsOn: "2026-09-17",
        endsOn: "2026-09-17",
        blurb: "Seven days old",
      },
    ]);
  });
});

describe("readDayStream", () => {
  let database: Kysely<Database>;
  let memberId: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    memberId = await insertMember(database);
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertMilestone(database, {
      name: "A quiet day",
      startsOn: "2026-09-13",
    });
  });

  const readStream = async (
    filter: ReturnType<typeof makeTimelineFilterFromQuery>,
  ) => {
    return readDayStream({
      database,
      viewer: makeViewer(memberId),
      filter,
      limit: 10,
      beforeDay: undefined,
      itemBudget: 400,
    });
  };

  it("carries a milestone-only day with no filter", async () => {
    const stream = await readStream(makeTimelineFilterFromQuery({}));
    expect(
      stream.days.map((day) => {
        return [day.capturedOn, day.itemCount];
      }),
    ).toEqual([
      ["2026-09-14", 1],
      ["2026-09-13", 0],
    ]);
    expect(stream.hasMore).toBe(false);
  });

  it("keeps it under a date range, which is a window on the same timeline", async () => {
    const stream = await readStream(
      makeTimelineFilterFromQuery({ from: "2026-09-01", until: "2026-09-30" }),
    );
    expect(
      stream.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14", "2026-09-13"]);
  });

  it("drops it under a tag filter, which is a content predicate", async () => {
    const tagId = await insertTag(database, { name: "beach" });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-14",
    });
    await insertItemTag(database, { itemId, tagId });

    const stream = await readStream(
      makeTimelineFilterFromQuery({ tags: [tagId] }),
    );
    expect(
      stream.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14"]);
  });

  it("still reports the occasions covering the days it returns", async () => {
    const stream = await readStream(makeTimelineFilterFromQuery({}));
    expect(
      stream.milestones.map((milestone) => {
        return milestone.name;
      }),
    ).toEqual(["A quiet day"]);
  });
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive`
Expected: FAIL, the four new modules do not resolve.

- [ ] **Step 4: Write `readItemDays.ts`**

```ts
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilter.ts";

/** One day of the stream, before anything is known about what is on it. */
export type CandidateDay = {
  capturedOn: string;
  /** Every visible item on the day, burst frames counted individually. */
  itemCount: number;
  /** Visible items this viewer has no `item_views` row for. */
  unseenCount: number;
};

/**
 * Query 1 of a timeline page: the days, with their two per-viewer counts.
 *
 * Rides `(captured_on DESC, visibility_rule_id, id)`, so the group-by runs in
 * index order and a limit stops early without touching the table.
 *
 * **The `item_views` join is `ON v.item_id = i.id AND v.member_id = :me`, in
 * the `ON` clause.** In the `WHERE` it becomes an inner join and every item
 * the viewer has already seen disappears from the archive, which is silent in
 * any fixture where nothing has been seen yet.
 *
 * `unseenCount` is the same anti-join aggregated, so the spine's "31 new" and
 * the dots on the prints are the same fact counted once.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 * @param options.beforeDay Exclusive upper bound: the cursor's day.
 * @param options.limit Days to read. Omitted for the rail, which is complete.
 */
export async function readItemDays(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  beforeDay?: string;
  limit?: number;
}): Promise<CandidateDay[]> {
  const grouped = options.database
    .selectFrom("items")
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select((eb) => {
      return [
        "items.captured_on as capturedOn",
        eb.fn.countAll<number>().as("itemCount"),
        eb.fn
          .countAll<number>()
          .filterWhere("item_views.item_id", "is", null)
          .as("unseenCount"),
      ];
    })
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter,
      }),
    )
    .groupBy("items.captured_on")
    .orderBy("items.captured_on", "desc");

  const bounded =
    options.beforeDay === undefined
      ? grouped
      : grouped.where("items.captured_on", "<", options.beforeDay);
  const limited =
    options.limit === undefined ? bounded : bounded.limit(options.limit);

  const rows = await limited.execute();
  return rows.map((row) => {
    return {
      capturedOn: row.capturedOn,
      itemCount: Number(row.itemCount),
      unseenCount: Number(row.unseenCount),
    };
  });
}
```

- [ ] **Step 5: Write `readOverlappingMilestones.ts`**

```ts
import type { MilestoneRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/**
 * Query 2 of a timeline page: the occasions covering the window.
 *
 * Tens of rows, on `INDEX (starts_on, ends_on)`. Spans are expanded in the
 * application and never materialised, because a `days` table is exactly what
 * `data-models.md` § `items` refuses: a day is `GROUP BY captured_on`, and the
 * one cost of that is this query.
 *
 * **A milestone has no visibility of its own** (Decision 5), so no predicate
 * appears here: the occasion and its name are visible to everybody and only
 * its photographs are restricted.
 *
 * @param options.database The Kysely handle.
 * @param options.fromDay The selection's inclusive lower date, if any.
 * @param options.untilDay The selection's inclusive upper date, if any.
 * @param options.beforeDay The cursor's day. Nothing at or after it can show.
 * @param options.sinceDay The window's floor, below which no day can reach
 *   this page.
 */
export async function readOverlappingMilestones(options: {
  database: DatabaseExecutor;
  fromDay: string | undefined;
  untilDay: string | undefined;
  beforeDay: string | undefined;
  sinceDay: string | undefined;
}): Promise<MilestoneRef[]> {
  const all = options.database
    .selectFrom("milestones")
    .select([
      "milestones.id as milestoneId",
      "milestones.name as name",
      "milestones.starts_on as startsOn",
      "milestones.ends_on as endsOn",
      "milestones.blurb as blurb",
    ])
    .orderBy("milestones.starts_on", "asc");

  const beforeBounded =
    options.beforeDay === undefined
      ? all
      : all.where("milestones.starts_on", "<", options.beforeDay);
  const sinceBounded =
    options.sinceDay === undefined
      ? beforeBounded
      : beforeBounded.where("milestones.ends_on", ">=", options.sinceDay);
  const untilBounded =
    options.untilDay === undefined
      ? sinceBounded
      : sinceBounded.where("milestones.starts_on", "<=", options.untilDay);
  const fromBounded =
    options.fromDay === undefined
      ? untilBounded
      : untilBounded.where("milestones.ends_on", ">=", options.fromDay);

  return fromBounded.execute();
}
```

- [ ] **Step 6: Write `mergeDays.ts`**

```ts
import type { MilestoneRef } from "@memory-shoebox/shared";
import { getDaysFromMilestone } from "./milestoneSpans.ts";
import type { CandidateDay } from "./readItemDays.ts";

/**
 * The days a milestone span contributes, clipped to the page's window.
 *
 * A milestone day with no items still appears and still has a date to be a
 * cursor, which is the whole reason the day stream is a union rather than a
 * group-by (`data-models.md` § `items`).
 *
 * @param options.milestones The occasions covering the window.
 * @param options.fromDay The selection's inclusive lower date, if any.
 * @param options.untilDay The selection's inclusive upper date, if any.
 * @param options.beforeDay The cursor's day, exclusive.
 * @param options.sinceDay The window's floor, inclusive.
 */
export function getUnionDaysFromMilestones(options: {
  milestones: readonly MilestoneRef[];
  fromDay: string | undefined;
  untilDay: string | undefined;
  beforeDay: string | undefined;
  sinceDay: string | undefined;
}): string[] {
  const days = options.milestones.flatMap((milestone) => {
    return getDaysFromMilestone(milestone);
  });
  return [...new Set(days)].filter((day) => {
    return (
      (options.fromDay === undefined || day >= options.fromDay) &&
      (options.untilDay === undefined || day <= options.untilDay) &&
      (options.beforeDay === undefined || day < options.beforeDay) &&
      (options.sinceDay === undefined || day >= options.sinceDay)
    );
  });
}

/**
 * The union: item days and milestone days as one descending stream.
 *
 * A date that has both keeps its counts. A date that has only an occasion
 * arrives at `itemCount: 0`, which is surface 2's `milestone-empty` state and
 * is still jumpable from the rail.
 */
export function makeMergedDays(options: {
  itemDays: readonly CandidateDay[];
  milestoneDays: readonly string[];
}): CandidateDay[] {
  const itemDates = new Set(
    options.itemDays.map((day) => {
      return day.capturedOn;
    }),
  );
  return [
    ...options.itemDays,
    ...options.milestoneDays
      .filter((day) => {
        return !itemDates.has(day);
      })
      .map((day) => {
        return { capturedOn: day, itemCount: 0, unseenCount: 0 };
      }),
  ].sort((left, right) => {
    return right.capturedOn.localeCompare(left.capturedOn);
  });
}

/**
 * Cuts the merged stream into one page.
 *
 * **A day is atomic**: `limit` counts days and a day never splits across
 * pages, so the next page is `captured_on < :d` strictly. The pile has no
 * in-day pagination affordance, and inventing one here would be a design
 * change made in an API document.
 *
 * The guard against a very fat day is a soft budget rather than a hard cut:
 * the day that passes it is included and is the last, and a page always
 * carries at least one day however large it is.
 *
 * @param options.candidates The merged stream, newest first.
 * @param options.limit Days per page.
 * @param options.itemBudget `appConfig.timeline.pageItemBudget`.
 */
export function makeDayPageFromCandidates(options: {
  candidates: readonly CandidateDay[];
  limit: number;
  itemBudget: number;
}): { days: CandidateDay[]; hasMore: boolean } {
  const taken = options.candidates.reduce<{
    days: CandidateDay[];
    items: number;
  }>(
    (page, day) => {
      const isFull =
        page.days.length >= options.limit ||
        (page.days.length > 0 && page.items > options.itemBudget);
      return isFull
        ? page
        : { days: [...page.days, day], items: page.items + day.itemCount };
    },
    { days: [], items: 0 },
  );

  return {
    days: taken.days,
    hasMore: options.candidates.length > taken.days.length,
  };
}
```

- [ ] **Step 7: Write `readDayStream.ts`**

```ts
import type { MilestoneRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  getUnionDaysFromMilestones,
  makeDayPageFromCandidates,
  makeMergedDays,
} from "./mergeDays.ts";
import { readItemDays, type CandidateDay } from "./readItemDays.ts";
import { readOverlappingMilestones } from "./readOverlappingMilestones.ts";
import { hasContentFilter, type TimelineFilter } from "./selectionFilter.ts";

/** One page of days, and the occasions that might cover them. */
export type DayStreamPage = {
  days: CandidateDay[];
  /** Every occasion overlapping the window, for the bands and the strips. */
  milestones: MilestoneRef[];
  hasMore: boolean;
};

/**
 * Queries 1 and 2, merged and cut into the days one page returns.
 *
 * **The milestone query's window is bounded, and the bound is provable.** Item
 * days are read with `limit + 1`; if a `(limit + 1)`-th comes back, no date
 * below it can reach this page, because every such date already has at least
 * `limit + 1` item days above it in the merged descending order. With fewer
 * than that there are no more item days at all, so there is no floor and every
 * occasion at or below the cursor is fetched, which is tens of rows.
 *
 * **The union applies only when no content filter is set** (`timeline.md`
 * Ruling 1). The milestones themselves are still read under a content filter,
 * because a day that does survive one still carries its band.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 * @param options.limit Days per page.
 * @param options.beforeDay The cursor's day, exclusive.
 * @param options.itemBudget `appConfig.timeline.pageItemBudget`.
 */
export async function readDayStream(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  limit: number;
  beforeDay: string | undefined;
  itemBudget: number;
}): Promise<DayStreamPage> {
  const itemDays = await readItemDays({
    database: options.database,
    viewer: options.viewer,
    filter: options.filter,
    beforeDay: options.beforeDay,
    limit: options.limit + 1,
  });

  const sinceDay =
    itemDays.length > options.limit
      ? itemDays[options.limit]?.capturedOn
      : undefined;

  const milestones = await readOverlappingMilestones({
    database: options.database,
    fromDay: options.filter.from,
    untilDay: options.filter.until,
    beforeDay: options.beforeDay,
    sinceDay,
  });

  const milestoneDays = hasContentFilter(options.filter)
    ? []
    : getUnionDaysFromMilestones({
        milestones,
        fromDay: options.filter.from,
        untilDay: options.filter.until,
        beforeDay: options.beforeDay,
        sinceDay,
      });

  const page = makeDayPageFromCandidates({
    candidates: makeMergedDays({ itemDays, milestoneDays }),
    limit: options.limit,
    itemBudget: options.itemBudget,
  });

  return { days: page.days, milestones, hasMore: page.hasMore };
}
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive`
Expected: PASS, every case in both new files.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/archive apps/server/test/archive
git commit -m "feat(archive): the day stream, its union, its budget and its cut"
```

---

## Task 9: The items on the page, and the bursts among them

Queries 3 and 4, plus the pure collapse that turns visible frames into the
prints the pile draws.

**Files:**

- Create: `apps/server/src/archive/readItemsForDays.ts`
- Create: `apps/server/src/archive/readBurstCovers.ts`
- Create: `apps/server/src/archive/collapseBursts.ts`
- Test: `apps/server/test/archive/readItemsForDays.test.ts`
- Test: `apps/server/test/archive/collapseBursts.test.ts`

- [ ] **Step 1: Write the failing test for the collapse**

Create `apps/server/test/archive/collapseBursts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeDrawnEntriesFromItemRows } from "../../src/archive/collapseBursts.ts";
import type { ItemRow } from "../../src/archive/readItemsForDays.ts";

const makeRow = (overrides: Partial<ItemRow> & { itemId: string }): ItemRow => {
  return {
    kind: "photo",
    capturedAt: "2026-09-14T06:41:00.000Z",
    capturedOn: "2026-09-14",
    durationMs: null,
    altTextOverride: null,
    visibilityRuleId: "rule-everyone",
    uploadedBy: "member-1",
    burstId: null,
    isUnseen: false,
    ...overrides,
  };
};

describe("makeDrawnEntriesFromItemRows", () => {
  it("draws a plain item as itself", () => {
    const row = makeRow({ itemId: "a" });
    expect(
      makeDrawnEntriesFromItemRows({
        rows: [row],
        coverItemIdsByBurstId: new Map(),
      }),
    ).toEqual([{ item: row, burst: undefined }]);
  });

  it("draws a burst of one visible frame as a plain print", () => {
    const row = makeRow({ itemId: "a", burstId: "burst-1" });
    const entries = makeDrawnEntriesFromItemRows({
      rows: [row],
      coverItemIdsByBurstId: new Map([["burst-1", "a"]]),
    });
    expect(entries).toEqual([{ item: row, burst: undefined }]);
  });

  it("collapses two or more frames into one stack over the visible ones", () => {
    const first = makeRow({
      itemId: "a",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:41:00.000Z",
      isUnseen: true,
    });
    const second = makeRow({
      itemId: "b",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:44:00.000Z",
    });

    const entries = makeDrawnEntriesFromItemRows({
      rows: [first, second],
      coverItemIdsByBurstId: new Map([["burst-1", "b"]]),
    });

    expect(entries).toEqual([
      {
        item: second,
        burst: {
          burstId: "burst-1",
          visibleFrameCount: 2,
          startsAt: "2026-09-14T06:41:00.000Z",
          endsAt: "2026-09-14T06:44:00.000Z",
          coverItemId: "b",
          hasUnseenFrames: true,
        },
      },
    ]);
  });

  it("falls back to the earliest visible frame when the cover is not visible", () => {
    const first = makeRow({ itemId: "a", burstId: "burst-1" });
    const second = makeRow({
      itemId: "b",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:44:00.000Z",
    });

    const entries = makeDrawnEntriesFromItemRows({
      rows: [first, second],
      coverItemIdsByBurstId: new Map([["burst-1", "restricted-frame"]]),
    });

    expect(entries[0]?.item.itemId).toBe("a");
    expect(entries[0]?.burst?.coverItemId).toBe("a");
  });

  it("stands where the run started, whichever frame is the cover", () => {
    const earlier = makeRow({
      itemId: "plain",
      capturedAt: "2026-09-14T06:00:00.000Z",
    });
    const first = makeRow({
      itemId: "a",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:41:00.000Z",
    });
    const second = makeRow({
      itemId: "b",
      burstId: "burst-1",
      capturedAt: "2026-09-14T06:44:00.000Z",
    });
    const later = makeRow({
      itemId: "plain-2",
      capturedAt: "2026-09-14T07:00:00.000Z",
    });

    const entries = makeDrawnEntriesFromItemRows({
      rows: [earlier, first, second, later],
      coverItemIdsByBurstId: new Map([["burst-1", "b"]]),
    });

    expect(
      entries.map((entry) => {
        return entry.item.itemId;
      }),
    ).toEqual(["plain", "b", "plain-2"]);
  });

  it("says nothing is unseen when every visible frame has been seen", () => {
    const entries = makeDrawnEntriesFromItemRows({
      rows: [
        makeRow({ itemId: "a", burstId: "burst-1" }),
        makeRow({
          itemId: "b",
          burstId: "burst-1",
          capturedAt: "2026-09-14T06:44:00.000Z",
        }),
      ],
      coverItemIdsByBurstId: new Map([["burst-1", "a"]]),
    });
    expect(entries[0]?.burst?.hasUnseenFrames).toBe(false);
  });
});
```

Zero visible frames needs no case of its own: a burst with no visible frames
contributes no rows, so there is nothing to collapse and nothing is drawn.
Task 15's route test asserts it end to end, where it is a real absence.

- [ ] **Step 2: Write the failing test for the two queries**

Create `apps/server/test/archive/readItemsForDays.test.ts`:

```ts
import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { readBurstCovers } from "../../src/archive/readBurstCovers.ts";
import { readItemsForDays } from "../../src/archive/readItemsForDays.ts";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilter.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertBurst,
  insertItem,
  insertItemView,
  insertMember,
  insertUploadSession,
  setBurstCover,
} from "../helpers/seedHelpers/seedHelpers.ts";

function makeViewer(memberId: string): Viewer {
  return {
    memberId,
    sessionId: "a-session",
    role: "viewer",
    isAdmin: false,
    visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
  };
}

describe("readItemsForDays", () => {
  let database: Kysely<Database>;
  let memberId: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    memberId = await insertMember(database);
  });

  it("reads one day oldest first, which is how the day happened", async () => {
    const eveningId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_at: "2026-09-14T19:55:00.000Z",
      captured_on: "2026-09-14",
    });
    const morningId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_at: "2026-09-14T09:12:00.000Z",
      captured_on: "2026-09-14",
    });

    const rows = await readItemsForDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
      days: ["2026-09-14"],
    });
    expect(
      rows.map((row) => {
        return row.itemId;
      }),
    ).toEqual([morningId, eveningId]);
  });

  it("says which items this viewer has not seen", async () => {
    const seenId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    await insertItemView(database, { memberId, itemId: seenId });
    await insertItem(database, { uploadedBy: memberId, seq: 2 });

    const rows = await readItemsForDays({
      database,
      viewer: makeViewer(memberId),
      filter: makeTimelineFilterFromQuery({}),
      days: ["2026-09-27"],
    });
    expect(
      rows.map((row) => {
        return row.isUnseen;
      }),
    ).toEqual([false, true]);
  });

  it("runs no query at all for no days", async () => {
    expect(
      await readItemsForDays({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
        days: [],
      }),
    ).toEqual([]);
  });
});

describe("readBurstCovers", () => {
  it("reads the stored cover, and nothing for a burst without one", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const withCoverId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const withoutCoverId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-13",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      burst_id: withCoverId,
      burst_index: 1,
    });
    await setBurstCover(database, { burstId: withCoverId, coverItemId: itemId });

    const covers = await readBurstCovers({
      database,
      burstIds: [withCoverId, withoutCoverId],
    });
    expect(covers.get(withCoverId)).toBe(itemId);
    expect(covers.get(withoutCoverId)).toBeUndefined();

    await database.destroy();
  });

  it("is empty for no bursts", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    expect((await readBurstCovers({ database, burstIds: [] })).size).toBe(0);
    await database.destroy();
  });
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive`
Expected: FAIL, the three new modules do not resolve.

- [ ] **Step 4: Write `readItemsForDays.ts`**

```ts
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilter.ts";

/** One visible item, as the day stream reads it before it becomes a DTO. */
export type ItemRow = {
  itemId: string;
  kind: "photo" | "video";
  capturedAt: string;
  capturedOn: string;
  durationMs: number | null;
  /** `items.alt_text`: an override, written only when somebody typed one. */
  altTextOverride: string | null;
  visibilityRuleId: string;
  uploadedBy: string;
  burstId: string | null;
  isUnseen: boolean;
};

/** The column is `CHECK IN ('photo','video')`, so this cannot see a third. */
function _getKindFromStoredValue(value: string): "photo" | "video" {
  return value === "video" ? "video" : "photo";
}

/**
 * Query 3 of a timeline page: every visible item on the chosen days.
 *
 * `captured_on IN (:days)` plus the selection, so burst grouping and the cover
 * choice happen in process with no further query. Frames are ordinary items
 * and arrive already visibility-filtered, which is what makes a burst with no
 * visible frames vanish with no code at all.
 *
 * **Ordered oldest first within the day**, so a day reads the way it happened,
 * with `seq` as the tiebreak because two frames of a burst can share a
 * millisecond. The order the server sends is the order the wall is built from:
 * the messy pile seeds its tilt, offset and z-order from the item's index
 * (`DESIGN.md` § Do's), so a client that re-sorted would reshuffle it.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 * @param options.days The days this page returns.
 */
export async function readItemsForDays(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  days: readonly string[];
}): Promise<ItemRow[]> {
  if (options.days.length === 0) {
    return [];
  }

  const rows = await options.database
    .selectFrom("items")
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select([
      "items.id as itemId",
      "items.kind as kind",
      "items.captured_at as capturedAt",
      "items.captured_on as capturedOn",
      "items.duration_ms as durationMs",
      "items.alt_text as altTextOverride",
      "items.visibility_rule_id as visibilityRuleId",
      "items.uploaded_by as uploadedBy",
      "items.burst_id as burstId",
      "item_views.item_id as seenItemId",
    ])
    .where("items.captured_on", "in", [...options.days])
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter,
      }),
    )
    .orderBy("items.captured_at", "asc")
    .orderBy("items.seq", "asc")
    .execute();

  return rows.map((row) => {
    return {
      itemId: row.itemId,
      kind: _getKindFromStoredValue(row.kind),
      capturedAt: row.capturedAt,
      capturedOn: row.capturedOn,
      durationMs: row.durationMs,
      altTextOverride: row.altTextOverride,
      visibilityRuleId: row.visibilityRuleId,
      uploadedBy: row.uploadedBy,
      burstId: row.burstId,
      isUnseen: row.seenItemId === null,
    };
  });
}
```

- [ ] **Step 5: Write `readBurstCovers.ts`**

```ts
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/**
 * Query 4 of a timeline page: `cover_item_id` for the bursts on it.
 *
 * Tens of rows at most. **This is the only column of `bursts` the read path
 * consults**: what a stack draws, how many frames it stands for and what span
 * it covers all come from the visible frames, because a stored count or a
 * stored span is the unfiltered one and would leak the restricted frames
 * through a denominator or through an endpoint.
 *
 * A burst whose cover is null, or whose cover this viewer cannot see, is
 * absent from the map, and the collapse falls back to the earliest visible
 * frame.
 *
 * @param options.database The Kysely handle.
 * @param options.burstIds The bursts drawn on this page.
 */
export async function readBurstCovers(options: {
  database: DatabaseExecutor;
  burstIds: readonly string[];
}): Promise<Map<string, string>> {
  if (options.burstIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("bursts")
    .select(["bursts.id as burstId", "bursts.cover_item_id as coverItemId"])
    .where("bursts.id", "in", [...options.burstIds])
    .where("bursts.cover_item_id", "is not", null)
    .execute();

  return new Map(
    rows.flatMap((row) => {
      return row.coverItemId === null ? [] : [[row.burstId, row.coverItemId]];
    }),
  );
}
```

- [ ] **Step 6: Write `collapseBursts.ts`**

```ts
import type { ItemRow } from "./readItemsForDays.ts";

/** A stack, measured over the frames this viewer can actually see. */
export type DrawnBurst = {
  burstId: string;
  visibleFrameCount: number;
  startsAt: string;
  endsAt: string;
  coverItemId: string;
  hasUnseenFrames: boolean;
};

/** One print the pile draws: the item it draws, and the stack it stands for. */
export type DrawnEntry = {
  item: ItemRow;
  burst: DrawnBurst | undefined;
};

/** What a stack is built from, once its frames are known. */
type BurstStackParts = {
  burstId: string;
  /** The earliest visible frame, which is also where the stack stands. */
  firstFrame: ItemRow;
  frames: readonly ItemRow[];
  coverItemId: string | undefined;
};

/**
 * Turns visible items into the prints the pile draws.
 *
 * Three rules, and only the middle one needs code
 * (`data-models.md` § `bursts`):
 *
 * | Visible frames | What the day gets                                       |
 * | -------------- | --------------------------------------------------------- |
 * | 0              | Nothing, and nothing counted. Frames being items buys it  |
 * | 1              | A plain print. Never a stack of one                       |
 * | 2 or more      | One entry, measured over the visible frames alone         |
 *
 * The stack stands at the position of its **earliest visible frame**, which is
 * the only position consistent with a day ordered oldest first: a burst is a
 * contiguous run, so the stack stands where the run started. Its identity is
 * the cover, which may be a later frame.
 *
 * @param options.rows The day's visible items, chronological.
 * @param options.coverItemIdsByBurstId `bursts.cover_item_id` per burst.
 */
export function makeDrawnEntriesFromItemRows(options: {
  rows: readonly ItemRow[];
  coverItemIdsByBurstId: ReadonlyMap<string, string>;
}): DrawnEntry[] {
  const framesByBurstId = _makeFramesByBurstId(options.rows);

  return options.rows.flatMap((row) => {
    const burstId = row.burstId;
    if (burstId === null) {
      return [{ item: row, burst: undefined }];
    }
    const frames = framesByBurstId.get(burstId) ?? [];
    if (frames.length < 2) {
      return [{ item: row, burst: undefined }];
    }
    if (frames[0]?.itemId !== row.itemId) {
      return [];
    }
    return [
      _makeStackFromFrames({
        burstId,
        firstFrame: row,
        frames,
        coverItemId: options.coverItemIdsByBurstId.get(burstId),
      }),
    ];
  });
}

/** The frames of each burst, in the order they arrived, which is by time. */
function _makeFramesByBurstId(
  rows: readonly ItemRow[],
): Map<string, ItemRow[]> {
  return rows.reduce<Map<string, ItemRow[]>>((frames, row) => {
    if (row.burstId === null) {
      return frames;
    }
    const existing = frames.get(row.burstId) ?? [];
    existing.push(row);
    frames.set(row.burstId, existing);
    return frames;
  }, new Map());
}

/**
 * One stack: the cover if it is visible, else the earliest visible frame, and
 * a count and a span taken over the visible frames only.
 */
function _makeStackFromFrames(options: Readonly<BurstStackParts>): DrawnEntry {
  const cover =
    options.frames.find((frame) => {
      return frame.itemId === options.coverItemId;
    }) ?? options.firstFrame;

  const endsAt = options.frames.reduce((latest, frame) => {
    return frame.capturedAt > latest ? frame.capturedAt : latest;
  }, options.firstFrame.capturedAt);

  return {
    item: cover,
    burst: {
      burstId: options.burstId,
      visibleFrameCount: options.frames.length,
      startsAt: options.firstFrame.capturedAt,
      endsAt,
      coverItemId: cover.itemId,
      hasUnseenFrames: options.frames.some((frame) => {
        return frame.isUnseen;
      }),
    },
  };
}
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive`
Expected: PASS, every case.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/archive apps/server/test/archive
git commit -m "feat(archive): the page's items, and the bursts collapsed over visible frames"
```

---

## Task 10: The media: one batched query, signed in process

Query 5, keyed by the ids actually drawn, so a collapsed forty-five-frame burst
costs one item's renditions rather than forty-five.

**Files:**

- Create: `apps/server/src/archive/readMediaSources.ts`
- Create: `apps/server/src/archive/makeMediaRefFromSources.ts`
- Test: `apps/server/test/archive/readMediaSources.test.ts`
- Test: `apps/server/test/archive/makeMediaRefFromSources.test.ts`

- [ ] **Step 1: Write the failing test for the pure builder**

Create `apps/server/test/archive/makeMediaRefFromSources.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MediaSource } from "@memory-shoebox/shared";
import { makeMediaRefFromSources } from "../../src/archive/makeMediaRefFromSources.ts";

const makeSource = (url: string): MediaSource => {
  return {
    url,
    expiresAt: "2026-09-27T11:00:00.000Z",
    width: 800,
    height: 600,
  };
};

describe("makeMediaRefFromSources", () => {
  it("builds a photograph from a thumbnail and a display copy", () => {
    const media = makeMediaRefFromSources({
      sources: new Map([
        ["thumb", makeSource("https://b2.test/thumb")],
        ["display", makeSource("https://b2.test/display")],
      ]),
      durationMs: null,
      altText: "14 September 2026",
    });

    expect(media).toEqual({
      thumb: makeSource("https://b2.test/thumb"),
      display: makeSource("https://b2.test/display"),
      poster: null,
      video: null,
      durationMs: null,
      altText: "14 September 2026",
    });
  });

  it("falls back through display and the original when one is missing", () => {
    const media = makeMediaRefFromSources({
      sources: new Map([["original", makeSource("https://b2.test/original")]]),
      durationMs: null,
      altText: "14 September 2026",
    });

    expect(media?.thumb.url).toBe("https://b2.test/original");
    expect(media?.display.url).toBe("https://b2.test/original");
  });

  it("carries a video's poster and both transcodes", () => {
    const media = makeMediaRefFromSources({
      sources: new Map([
        ["thumb", makeSource("https://b2.test/thumb")],
        ["display", makeSource("https://b2.test/display")],
        ["poster", makeSource("https://b2.test/poster")],
        ["video_mp4", makeSource("https://b2.test/mp4")],
      ]),
      durationMs: 22_000,
      altText: "A clip",
    });

    expect(media?.poster?.url).toBe("https://b2.test/poster");
    expect(media?.video).toEqual({
      webm: null,
      mp4: makeSource("https://b2.test/mp4"),
    });
    expect(media?.durationMs).toBe(22_000);
  });

  it("returns nothing for an item with no renditions at all", () => {
    expect(
      makeMediaRefFromSources({
        sources: new Map(),
        durationMs: null,
        altText: "14 September 2026",
      }),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write the failing test for the query**

Create `apps/server/test/archive/readMediaSources.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readMediaSources } from "../../src/archive/readMediaSources.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("readMediaSources", () => {
  it("signs every rendition of the ids it was given, and no others", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const drawnId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const otherId = await insertItem(database, { uploadedBy: memberId, seq: 2 });
    await insertRendition(database, { itemId: drawnId, purpose: "thumb" });
    await insertRendition(database, { itemId: drawnId, purpose: "display" });
    await insertRendition(database, { itemId: otherId, purpose: "thumb" });

    const sources = await readMediaSources({
      database,
      b2: createFakeB2Client(),
      itemIds: [drawnId],
      now: new Date(NOW),
      ttlSeconds: 3600,
    });

    expect([...sources.keys()]).toEqual([drawnId]);
    expect([...(sources.get(drawnId)?.keys() ?? [])].sort()).toEqual([
      "display",
      "thumb",
    ]);
    expect(sources.get(drawnId)?.get("thumb")).toEqual({
      url: `https://b2.test/get/${encodeURIComponent(`items/${drawnId}/thumb.jpg`)}`,
      // One hour after the request's own clock, so the client can refetch in
      // time rather than discovering a dead URL.
      expiresAt: "2026-09-27T11:00:00.000Z",
      width: 800,
      height: 600,
    });

    await database.destroy();
  });

  it("runs nothing for no ids", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const sources = await readMediaSources({
      database,
      b2: createFakeB2Client(),
      itemIds: [],
      now: new Date(NOW),
      ttlSeconds: 3600,
    });
    expect(sources.size).toBe(0);
    await database.destroy();
  });
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive`
Expected: FAIL, neither module resolves.

- [ ] **Step 4: Write `readMediaSources.ts`**

```ts
import type { MediaSource } from "@memory-shoebox/shared";
import type { B2Client } from "../b2/client.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/**
 * Query 5 of a timeline page: every stored object the page draws, signed.
 *
 * One batched `item_renditions WHERE item_id IN (:drawnItemIds)`, **never one
 * join per print**, and keyed by the ids actually drawn, so a collapsed burst
 * costs one item's renditions rather than forty-five.
 *
 * `item_renditions` holds storage **keys**. A URL is a short-lived signed
 * thing minted here at render, because a raw storage key in a payload is
 * forbidden outright (`conventions.md` § Forbidden in any payload). Signing is
 * in-process HMAC and talks to nothing.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, faked in tests.
 * @param options.itemIds The ids actually drawn.
 * @param options.now The request's own clock, which `expiresAt` counts from.
 * @param options.ttlSeconds `appConfig.media.signedUrlTtlSeconds`.
 * @returns Sources by item id, then by rendition purpose.
 */
export async function readMediaSources(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  itemIds: readonly string[];
  now: Date;
  ttlSeconds: number;
}): Promise<Map<string, Map<string, MediaSource>>> {
  if (options.itemIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("item_renditions")
    .select([
      "item_renditions.item_id as itemId",
      "item_renditions.purpose as purpose",
      "item_renditions.storage_key as storageKey",
      "item_renditions.width as width",
      "item_renditions.height as height",
    ])
    .where("item_renditions.item_id", "in", [...options.itemIds])
    .execute();

  const expiresAt = new Date(
    options.now.getTime() + options.ttlSeconds * 1000,
  ).toISOString();

  const signed = await Promise.all(
    rows.map(async (row) => {
      const url = await options.b2.presignGet({
        key: row.storageKey,
        expiresInSeconds: options.ttlSeconds,
      });
      return {
        itemId: row.itemId,
        purpose: row.purpose,
        source: { url, expiresAt, width: row.width, height: row.height },
      };
    }),
  );

  return signed.reduce<Map<string, Map<string, MediaSource>>>(
    (byItemId, entry) => {
      const sources = byItemId.get(entry.itemId) ?? new Map<string, MediaSource>();
      sources.set(entry.purpose, entry.source);
      byItemId.set(entry.itemId, sources);
      return byItemId;
    },
    new Map(),
  );
}
```

- [ ] **Step 5: Write `makeMediaRefFromSources.ts`**

```ts
import type { MediaRef, MediaSource } from "@memory-shoebox/shared";

/**
 * Everything needed to draw one print, from that item's signed renditions.
 *
 * `thumb` and `display` are non-nullable on `MediaRef` and ingest writes both,
 * so the fallback chain here is for a catalog that has lost one rather than
 * for the ordinary case: the display copy falls back to the original, and the
 * thumbnail to the display copy and then the original.
 *
 * **An item with no renditions at all returns `undefined`**, and its caller
 * leaves it out of `items` while leaving it in `itemCount`. That is the same
 * shape as a burst frame, which is counted and not drawn, so no count
 * disagrees with itself; dropping it from the count too would make a data
 * defect look like a visibility rule.
 *
 * @param options.sources That item's signed sources, by rendition purpose.
 * @param options.durationMs `items.duration_ms`. Non-null on every video.
 * @param options.altText The composed alt text. Never null.
 */
export function makeMediaRefFromSources(options: {
  sources: ReadonlyMap<string, MediaSource>;
  durationMs: number | null;
  altText: string;
}): MediaRef | undefined {
  const { sources } = options;
  const display =
    sources.get("display") ?? sources.get("original") ?? sources.get("thumb");
  const thumb =
    sources.get("thumb") ?? sources.get("display") ?? sources.get("original");

  if (display === undefined || thumb === undefined) {
    return undefined;
  }

  const webm = sources.get("video_webm") ?? null;
  const mp4 = sources.get("video_mp4") ?? null;

  return {
    thumb,
    display,
    poster: sources.get("poster") ?? null,
    video: webm === null && mp4 === null ? null : { webm, mp4 },
    durationMs: options.durationMs,
    altText: options.altText,
  };
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive`
Expected: PASS, every case.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/archive apps/server/test/archive
git commit -m "feat(archive): renditions signed in one batch, and the ref they build"
```

---

## Task 11: Alt text, composed where every `MediaRef` is minted

Query 7 and the composition rule. `items.md` gives the rule once and says it
applies wherever a `MediaRef` is minted, which includes every print in the
pile: a screen reader browsing the archive gets the names, not a bare date.

**Files:**

- Create: `apps/server/src/archive/readPeopleNamesByItemId.ts`
- Create: `apps/server/src/archive/makeAltTextFromItem.ts`
- Test: `apps/server/test/archive/makeAltTextFromItem.test.ts`
- Test: `apps/server/test/archive/readPeopleNamesByItemId.test.ts`

- [ ] **Step 1: Write the failing test for the composition**

Create `apps/server/test/archive/makeAltTextFromItem.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeAltTextFromItem } from "../../src/archive/makeAltTextFromItem.ts";

const CAPTURED_AT = "2026-09-14T21:30:00.000Z";

describe("makeAltTextFromItem", () => {
  it("is the date alone with nobody tagged", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: null,
        personNames: [],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("14 September 2026");
  });

  it("names one person before the date", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: null,
        personNames: ["Mateo"],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("Mateo, 14 September 2026");
  });

  it("joins the rest with commas and a final and", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: null,
        personNames: ["Mateo", "Papá", "Mamá"],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("Mateo, Papá and Mamá, 14 September 2026");
  });

  it("renders the date in the Shoebox's zone, not the server's", () => {
    // 21:30 UTC on the 14th is already the 15th in Sydney.
    expect(
      makeAltTextFromItem({
        altTextOverride: null,
        personNames: [],
        capturedAt: CAPTURED_AT,
        timezone: "Australia/Sydney",
      }),
    ).toBe("15 September 2026");
  });

  it("lets a typed description win outright", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: "Mateo asleep on his father's chest",
        personNames: ["Mateo"],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("Mateo asleep on his father's chest");
  });

  it("treats a blank override as no override", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: "   ",
        personNames: [],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("14 September 2026");
  });
});
```

- [ ] **Step 2: Write the failing test for the query**

Create `apps/server/test/archive/readPeopleNamesByItemId.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readPeopleNamesByItemId } from "../../src/archive/readPeopleNamesByItemId.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("readPeopleNamesByItemId", () => {
  it("returns names in tagging order, then alphabetically", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const mateoId = await insertPerson(database, { displayName: "Mateo" });
    const papaId = await insertPerson(database, { displayName: "Papá" });
    const mamaId = await insertPerson(database, { displayName: "Mamá" });
    await insertItemPerson(database, {
      itemId,
      personId: mateoId,
      tagged_at: NOW,
    });
    await insertItemPerson(database, {
      itemId,
      personId: papaId,
      tagged_at: shiftMinutes({ instant: NOW, minutes: 1 }),
    });
    await insertItemPerson(database, {
      itemId,
      personId: mamaId,
      tagged_at: shiftMinutes({ instant: NOW, minutes: 1 }),
    });

    expect(
      (await readPeopleNamesByItemId({ database, itemIds: [itemId] })).get(itemId),
    ).toEqual(["Mateo", "Mamá", "Papá"]);

    await database.destroy();
  });

  it("is empty for no ids", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    expect(
      (await readPeopleNamesByItemId({ database, itemIds: [] })).size,
    ).toBe(0);
    await database.destroy();
  });
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive`
Expected: FAIL, neither module resolves.

- [ ] **Step 4: Write `readPeopleNamesByItemId.ts`**

```ts
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/**
 * Query 7 of a timeline page: who is in the items it draws.
 *
 * One batched query keyed by the drawn ids, which is what keeps alt text off
 * the per-item path. `timeline.md` § Performance lists six to eight queries
 * and none of them is this one; `items.md` requires composed alt text wherever
 * a `MediaRef` is minted. The query count gives, because a screen reader in
 * the pile deserves the names, and this is still constant in the size of the
 * page.
 *
 * **No visibility predicate belongs on this join.** A people tag inherits its
 * item's rule exactly, so on an item the viewer may see there is no partially
 * visible people set. What keeps that true is that a `MediaRef` is only ever
 * minted for an item the viewer may see, not a filter here, and filtering here
 * would put `item_people` in a visibility expression, which Decision 7
 * forbids outright.
 *
 * Ordered `tagged_at ASC, display_name ASC`, which is the order the alt text
 * and the item viewer's people list both read in.
 *
 * @param options.database The Kysely handle.
 * @param options.itemIds The ids actually drawn.
 */
export async function readPeopleNamesByItemId(options: {
  database: DatabaseExecutor;
  itemIds: readonly string[];
}): Promise<Map<string, string[]>> {
  if (options.itemIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("item_people")
    .innerJoin("people", "people.id", "item_people.person_id")
    .select([
      "item_people.item_id as itemId",
      "people.display_name as displayName",
    ])
    .where("item_people.item_id", "in", [...options.itemIds])
    .orderBy("item_people.tagged_at", "asc")
    .orderBy("people.display_name", "asc")
    .execute();

  return rows.reduce<Map<string, string[]>>((namesByItemId, row) => {
    const names = namesByItemId.get(row.itemId) ?? [];
    names.push(row.displayName);
    namesByItemId.set(row.itemId, names);
    return namesByItemId;
  }, new Map());
}
```

- [ ] **Step 5: Write `makeAltTextFromItem.ts`**

```ts
/**
 * The one formatted date any payload in this contract carries.
 *
 * It is unavoidable: a screen reader needs prose, not an ISO timestamp. The
 * locale is not negotiable per reader, because the string is composed
 * server-side and the reader's own locale cannot reach it, and the product
 * ships one language (`items.md` Ruling 4). Formatters are expensive to build
 * and there are at most a handful of zones in play, so they are kept.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function _formatterFor(timezone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timezone);
  if (existing !== undefined) {
    return existing;
  }
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  formatters.set(timezone, formatter);
  return formatter;
}

/** "Mateo", "Mateo and Papá", "Mateo, Papá and Mamá". */
function _joinNames(names: readonly string[]): string {
  const last = names[names.length - 1] ?? "";
  return names.length < 2
    ? last
    : `${names.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * The alt text one item is served with. Never null, always composed here.
 *
 * `items.alt_text` wins outright when somebody has typed a real description.
 * Otherwise it is the people in tagging order and then the capture date:
 * "Mateo, Papá and Mamá, 14 September 2026", or the date alone when nobody is
 * tagged (Decision 9).
 *
 * @param options.altTextOverride `items.alt_text`, usually null.
 * @param options.personNames The people tagged, in `tagged_at` order.
 * @param options.capturedAt The instant the shutter fired.
 * @param options.timezone The `shoebox.timezone` setting.
 */
export function makeAltTextFromItem(options: {
  altTextOverride: string | null;
  personNames: readonly string[];
  capturedAt: string;
  timezone: string;
}): string {
  const override = options.altTextOverride?.trim() ?? "";
  if (override !== "") {
    return override;
  }

  const day = _formatterFor(options.timezone).format(
    new Date(options.capturedAt),
  );
  return options.personNames.length === 0
    ? day
    : `${_joinNames(options.personNames)}, ${day}`;
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive`
Expected: PASS, every case.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/archive apps/server/test/archive
git commit -m "feat(archive): alt text composed for every print in the pile"
```

---

## Task 12: Who may see it, and who put it there

Queries 6 and 8. The restricted marker on a print is composed from the rule's
subjects at read time and never stored: the rule is shared and deduped, and a
stored label goes stale the moment a group is renamed.

**Files:**

- Create: `apps/server/src/archive/readVisibilitySummaries.ts`
- Create: `apps/server/src/archive/readMemberRefs.ts`
- Test: `apps/server/test/archive/readVisibilitySummaries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/archive/readVisibilitySummaries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readMemberRefs } from "../../src/archive/readMemberRefs.ts";
import { readVisibilitySummaries } from "../../src/archive/readVisibilitySummaries.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertGroup,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("readVisibilitySummaries", () => {
  it("reads the seeded everyone rule with no subjects and no label", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    expect(
      (
        await readVisibilitySummaries({
          database,
          ruleIds: [EVERYONE_VISIBILITY_RULE_ID],
        })
      ).get(EVERYONE_VISIBILITY_RULE_ID),
    ).toEqual({ mode: "everyone", label: null, subjects: [] });

    await database.destroy();
  });

  it("labels an only-one-group rule with that group's name", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const groupId = await insertGroup(database, { name: "Just us two" });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    expect(
      (await readVisibilitySummaries({ database, ruleIds: [ruleId] })).get(
        ruleId,
      ),
    ).toEqual({
      mode: "only",
      label: "Just us two",
      subjects: [{ kind: "group", id: groupId, displayName: "Just us two" }],
    });

    await database.destroy();
  });

  it("leaves an except rule unlabelled, because the name would invert", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const groupId = await insertGroup(database, { name: "Cousins" });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    const summary = (
      await readVisibilitySummaries({ database, ruleIds: [ruleId] })
    ).get(ruleId);
    expect(summary?.label).toBeNull();
    expect(summary?.subjects).toEqual([
      { kind: "group", id: groupId, displayName: "Cousins" },
    ]);

    await database.destroy();
  });

  it("carries member subjects with the display name the product shows", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database, {
      display_name: null,
      email: "abuela@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });

    const summary = (
      await readVisibilitySummaries({ database, ruleIds: [ruleId] })
    ).get(ruleId);
    expect(summary?.subjects).toEqual([
      { kind: "member", id: memberId, displayName: "abuela" },
    ]);
    expect(summary?.label).toBeNull();

    await database.destroy();
  });
});

describe("readMemberRefs", () => {
  it("reads every member once, falling back to the email local part", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const namedId = await insertMember(database, { display_name: "Lucía" });
    const unnamedId = await insertMember(database, {
      display_name: null,
      email: "papa@example.com",
    });

    const members = await readMemberRefs(database);
    expect(members.get(namedId)).toEqual({
      memberId: namedId,
      displayName: "Lucía",
    });
    expect(members.get(unnamedId)).toEqual({
      memberId: unnamedId,
      displayName: "papa",
    });

    await database.destroy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/readVisibilitySummaries.test.ts`
Expected: FAIL, neither module resolves.

- [ ] **Step 3: Write `readMemberRefs.ts`**

```ts
import type { MemberRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";

/**
 * Query 8 of a timeline page: the per-request member map.
 *
 * Tens of rows, read once, so an uploader `MemberRef` is a lookup rather than
 * a join per print. The email is read and never served: it is only there
 * because a member with no display name falls back to its local part
 * (Decision 1), and `MemberRef` carries no email unless the route is
 * admin-scoped.
 *
 * @param database The Kysely handle.
 */
export async function readMemberRefs(
  database: DatabaseExecutor,
): Promise<Map<string, MemberRef>> {
  const rows = await database
    .selectFrom("members")
    .select(["members.id as id", "members.display_name as displayName", "members.email as email"])
    .execute();

  return new Map(
    rows.map((row) => {
      return [
        row.id,
        {
          memberId: row.id,
          displayName: getDisplayNameFromMember({
            storedDisplayName: row.displayName ?? undefined,
            email: row.email,
          }),
        },
      ];
    }),
  );
}
```

- [ ] **Step 4: Write `readVisibilitySummaries.ts`**

```ts
import type { VisibilitySummary } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";

/** One subject of one rule, as the interface draws it. */
type RuleSubject = {
  kind: "member" | "group";
  id: string;
  displayName: string;
};

/** The column is `CHECK IN ('everyone','only','except')`. */
function _getModeFromStoredValue(
  value: string,
): VisibilitySummary["mode"] {
  if (value === "only") {
    return "only";
  }
  return value === "except" ? "except" : "everyone";
}

/**
 * The words on the lock chip, or nothing.
 *
 * A rule whose whole subject set is **one group** is that group's name: "Just
 * us two" is a group in the fixtures, and it reads better than the list the
 * client would otherwise assemble. Everything else is null, and `apps/web`'s
 * `visibilityLabel` assembles "Only Papá, Mamá" from the subjects.
 *
 * `except` gets null too, and that is the point of the mode check rather than
 * an oversight: a bare "Just us two" on a rule meaning everyone **except**
 * those two says the opposite of what it means. The client prints "Everyone
 * except Cousins" instead, which is correct and is already built.
 */
function _makeLabelFromSubjects(options: {
  mode: VisibilitySummary["mode"];
  subjects: readonly RuleSubject[];
}): string | null {
  const [only] = options.subjects;
  return options.mode === "only" &&
    options.subjects.length === 1 &&
    only?.kind === "group"
    ? only.displayName
    : null;
}

/**
 * Query 6 of a timeline page: who may see each rule on it.
 *
 * Keyed by the distinct `visibility_rule_id` values the page carries, which is
 * a handful even on a 212-item day: rules are massively shared, because one
 * upload is one decision covering 264 files.
 *
 * The label is composed here and never stored. The rule is shared and deduped,
 * so a stored label would go stale the moment a group was renamed, and it
 * would go stale on 264 photographs at once.
 *
 * @param options.database The Kysely handle.
 * @param options.ruleIds The distinct rules on the page.
 */
export async function readVisibilitySummaries(options: {
  database: DatabaseExecutor;
  ruleIds: readonly string[];
}): Promise<Map<string, VisibilitySummary>> {
  if (options.ruleIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("visibility_rules")
    .leftJoin(
      "visibility_rule_subjects",
      "visibility_rule_subjects.rule_id",
      "visibility_rules.id",
    )
    .leftJoin("members", "members.id", "visibility_rule_subjects.member_id")
    .leftJoin("groups", "groups.id", "visibility_rule_subjects.group_id")
    .select([
      "visibility_rules.id as ruleId",
      "visibility_rules.mode as mode",
      "members.id as memberId",
      "members.display_name as memberDisplayName",
      "members.email as memberEmail",
      "groups.id as groupId",
      "groups.name as groupName",
    ])
    .where("visibility_rules.id", "in", [...options.ruleIds])
    .execute();

  const modesByRuleId = new Map(
    rows.map((row) => {
      return [row.ruleId, _getModeFromStoredValue(row.mode)];
    }),
  );

  const subjectsByRuleId = rows.reduce<Map<string, RuleSubject[]>>(
    (subjects, row) => {
      const existing = subjects.get(row.ruleId) ?? [];
      const subject = _makeSubjectFromRow(row);
      if (subject !== undefined) {
        existing.push(subject);
      }
      subjects.set(row.ruleId, existing);
      return subjects;
    },
    new Map(),
  );

  return new Map(
    [...modesByRuleId.entries()].map(([ruleId, mode]) => {
      const subjects = subjectsByRuleId.get(ruleId) ?? [];
      return [
        ruleId,
        { mode, label: _makeLabelFromSubjects({ mode, subjects }), subjects },
      ];
    }),
  );
}

/** One joined row as a subject, or nothing when the rule has none. */
function _makeSubjectFromRow(row: {
  memberId: string | null;
  memberDisplayName: string | null;
  memberEmail: string | null;
  groupId: string | null;
  groupName: string | null;
}): RuleSubject | undefined {
  if (row.memberId !== null && row.memberEmail !== null) {
    return {
      kind: "member",
      id: row.memberId,
      displayName: getDisplayNameFromMember({
        storedDisplayName: row.memberDisplayName ?? undefined,
        email: row.memberEmail,
      }),
    };
  }
  if (row.groupId !== null && row.groupName !== null) {
    return { kind: "group", id: row.groupId, displayName: row.groupName };
  }
  return undefined;
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/readVisibilitySummaries.test.ts`
Expected: PASS, every case.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/archive apps/server/test/archive
git commit -m "feat(archive): the lock chip's words, and the member map behind an uploader"
```

---

## Task 13: A band's own total, and what a selection is worth

Queries 10 and 11. The band's count is the **whole occasion's** per-viewer
total, so it takes the visibility predicate and not the page's selection: the
band prints what the occasion holds, not what the current filter leaves of it.

**Files:**

- Create: `apps/server/src/archive/readMilestoneItemCounts.ts`
- Create: `apps/server/src/archive/countSelectedItems.ts`
- Test: `apps/server/test/archive/readMilestoneItemCounts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/archive/readMilestoneItemCounts.test.ts`:

```ts
import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { countSelectedItems } from "../../src/archive/countSelectedItems.ts";
import { readMilestoneItemCounts } from "../../src/archive/readMilestoneItemCounts.ts";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilter.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  insertItem,
  insertItemMilestone,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertTag,
  insertVisibilityRule,
} from "../helpers/seedHelpers/seedHelpers.ts";

function makeViewer(memberId: string): Viewer {
  return {
    memberId,
    sessionId: "a-session",
    role: "viewer",
    isAdmin: false,
    visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
  };
}

describe("readMilestoneItemCounts", () => {
  let database: Kysely<Database>;
  let memberId: string;
  let milestoneId: string;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
    memberId = await insertMember(database);
    milestoneId = await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-17",
    });
  });

  it("counts what this viewer can see of the occasion", async () => {
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const visibleId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibility_rule_id: restrictedRuleId,
    });
    await insertItemMilestone(database, { itemId: visibleId, milestoneId });
    await insertItemMilestone(database, { itemId: hiddenId, milestoneId });

    expect(
      (
        await readMilestoneItemCounts({
          database,
          viewer: makeViewer(memberId),
          milestoneIds: [milestoneId],
        })
      ).get(milestoneId),
    ).toBe(1);
  });

  it("is the occasion's own total, not what a filter leaves of it", async () => {
    const taggedId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const untaggedId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    const tagId = await insertTag(database, { name: "beach" });
    await insertItemTag(database, { itemId: taggedId, tagId });
    await insertItemMilestone(database, { itemId: taggedId, milestoneId });
    await insertItemMilestone(database, { itemId: untaggedId, milestoneId });

    expect(
      (
        await readMilestoneItemCounts({
          database,
          viewer: makeViewer(memberId),
          milestoneIds: [milestoneId],
        })
      ).get(milestoneId),
    ).toBe(2);
  });

  it("is empty for no bands, and runs nothing", async () => {
    expect(
      (
        await readMilestoneItemCounts({
          database,
          viewer: makeViewer(memberId),
          milestoneIds: [],
        })
      ).size,
    ).toBe(0);
  });
});

describe("countSelectedItems", () => {
  it("counts items, frames included, filtered by the same predicate", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const tagId = await insertTag(database, { name: "beach" });
    const taggedId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibility_rule_id: restrictedRuleId,
    });
    await insertItem(database, { uploadedBy: memberId, seq: 3 });
    await insertItemTag(database, { itemId: taggedId, tagId });
    await insertItemTag(database, { itemId: hiddenId, tagId });

    expect(
      await countSelectedItems({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({}),
      }),
    ).toBe(2);
    expect(
      await countSelectedItems({
        database,
        viewer: makeViewer(memberId),
        filter: makeTimelineFilterFromQuery({ tags: [tagId] }),
      }),
    ).toBe(1);

    await database.destroy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/readMilestoneItemCounts.test.ts`
Expected: FAIL, neither module resolves.

- [ ] **Step 3: Write `readMilestoneItemCounts.ts`**

```ts
import { expressionBuilder } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";

/**
 * Query 10 of a timeline page: what each banded occasion holds, per viewer.
 *
 * `GROUP BY milestone_id` over `item_milestones` joined to visible items, for
 * the milestones **taking a band** only. Strips print no count, so they cost
 * nothing.
 *
 * **The visibility predicate, not the page's selection.** The band prints the
 * whole occasion's total ("212 items"), which is a fact about the occasion
 * rather than about the current filter: under a tag filter the band still says
 * what the occasion holds. A milestone's item set is the join table and never
 * a date range, so an item attached from outside the span counts here too.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.milestoneIds The occasions taking a band on this page.
 */
export async function readMilestoneItemCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  milestoneIds: readonly string[];
}): Promise<Map<string, number>> {
  if (options.milestoneIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("item_milestones")
    .innerJoin("items", "items.id", "item_milestones.item_id")
    .select((eb) => {
      return [
        "item_milestones.milestone_id as milestoneId",
        eb.fn.countAll<number>().as("itemCount"),
      ];
    })
    .where("item_milestones.milestone_id", "in", [...options.milestoneIds])
    .where(
      visibilityExpression({
        eb: expressionBuilder<Database, "items">(),
        viewer: options.viewer,
      }),
    )
    .groupBy("item_milestones.milestone_id")
    .execute();

  return new Map(
    rows.map((row) => {
      return [row.milestoneId, Number(row.itemCount)];
    }),
  );
}
```

- [ ] **Step 4: Write `countSelectedItems.ts`**

```ts
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilter.ts";

/**
 * What the whole selection is worth, in items.
 *
 * The filter strip's figure, and the facets route's `resultCount`. It counts
 * **items**, burst frames included, because the strip counts photographs and a
 * burst is a rendering collapse rather than fewer pictures.
 *
 * The same predicate as the rows, without the limit, which is the whole reason
 * the strip and the page cannot disagree.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 */
export async function countSelectedItems(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Promise<number> {
  const row = await options.database
    .selectFrom("items")
    .select((eb) => {
      return eb.fn.countAll<number>().as("itemCount");
    })
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter,
      }),
    )
    .executeTakeFirst();

  return Number(row?.itemCount ?? 0);
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/archive/readMilestoneItemCounts.test.ts`
Expected: PASS, every case.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/archive apps/server/test/archive
git commit -m "feat(archive): a band's own total, and what a selection is worth"
```

---

## Task 14: `GET /api/timeline`, assembled and served

The orchestration and the route. `readTimelinePage` runs no query of its own:
it composes the eleven modules built so far, which is what keeps it readable at
the size the day stream reaches.

**Files:**

- Create: `apps/server/src/archive/readTimelinePage.ts`
- Create: `apps/server/src/routes/timeline.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/routes/timeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { timelineResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertInstanceSetting,
  insertItem,
  insertItemPerson,
  insertMember,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** Every test here reads the archive as one signed-in member, at one instant. */
const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("GET /api/timeline", () => {
  it("answers an empty archive with the one shape the contract fixes", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      days: [],
      nextCursor: null,
      resultCount: null,
    });
    await close();
  });

  it("answers a day with its counts, its prints and their media", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database,
      member: { display_name: "Lucía" },
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_at: "2026-09-14T09:12:00.000Z",
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId, purpose: "thumb" });
    await insertRendition(database, { itemId, purpose: "display" });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = timelineResponseSchema.parse(response.json());
    expect(body.days).toHaveLength(1);
    const [day] = body.days;
    expect(day?.capturedOn).toBe("2026-09-14");
    expect(day?.itemCount).toBe(1);
    expect(day?.unseenCount).toBe(1);
    expect(day?.milestoneBand).toBeNull();
    expect(day?.milestoneStrips).toEqual([]);
    expect(day?.items).toHaveLength(1);

    const [item] = day?.items ?? [];
    expect(item?.itemId).toBe(itemId);
    expect(item?.kind).toBe("photo");
    expect(item?.isUnseen).toBe(true);
    expect(item?.uploadedBy).toEqual({ memberId, displayName: "Lucía" });
    expect(item?.burst).toBeNull();
    expect(item?.visibility).toEqual({
      mode: "everyone",
      label: null,
      subjects: [],
    });
    expect(item?.media.altText).toBe("Mateo, 14 September 2026");
    expect(item?.media.thumb.url).toContain("https://b2.test/get/");
    expect(item?.media.thumb.expiresAt).toBe("2026-09-27T11:00:00.000Z");
    await close();
  });

  it("reads the alt text date in the Shoebox's own zone", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Australia/Sydney",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_at: "2026-09-14T21:30:00.000Z",
      captured_on: "2026-09-15",
    });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(response.json().days[0].items[0].media.altText).toBe(
      "15 September 2026",
    );
    await close();
  });

  it("leaves an item with no renditions out of the prints and in the count", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, { uploadedBy: memberId, seq: 1 });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    expect(day.itemCount).toBe(1);
    expect(day.items).toEqual([]);
    await close();
  });

  it("carries a milestone-only day, which is still a day", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-08-02",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    expect(day.capturedOn).toBe("2026-08-02");
    expect(day.itemCount).toBe(0);
    expect(day.items).toEqual([]);
    expect(day.milestoneBand.milestone.name).toBe("Home from the hospital");
    expect(day.milestoneBand.dayPosition).toBe(1);
    expect(day.milestoneBand.dayCount).toBe(1);
    expect(day.milestoneBand.itemCount).toBe(0);
    await close();
  });

  it("returns resultCount only on an uncursored filtered request", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const unfiltered = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(unfiltered.json().resultCount).toBeNull();

    const filtered = await app.inject({
      method: "GET",
      url: "/api/timeline?from=2026-09-01",
      headers: { cookie },
    });
    expect(filtered.json().resultCount).toBe(1);
    await close();
  });

  it("pages, and the cursor comes back for a page that has more", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-13",
    });

    const first = await app.inject({
      method: "GET",
      url: "/api/timeline?limit=1",
      headers: { cookie },
    });
    expect(first.json().days).toHaveLength(1);
    expect(first.json().nextCursor).toEqual(expect.any(String));

    const second = await app.inject({
      method: "GET",
      url: `/api/timeline?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { cookie },
    });
    expect(second.json().days[0].capturedOn).toBe("2026-09-13");
    expect(second.json().nextCursor).toBeNull();
    expect(second.json().resultCount).toBeNull();
    await close();
  });

  it("refuses a cursor that belongs to a different selection", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-13",
    });

    const first = await app.inject({
      method: "GET",
      url: "/api/timeline?limit=1&from=2026-09-01",
      headers: { cookie },
    });
    const response = await app.inject({
      method: "GET",
      url: `/api/timeline?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    expect(response.json().details.fieldErrors.cursor).toBeDefined();
    await close();
  });

  it("refuses a cursor that does not decode", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline?cursor=not-a-cursor",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
    await close();
  });

  it("refuses a limit over the cap and a malformed date", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const overLimit = await app.inject({
      method: "GET",
      url: "/api/timeline?limit=31",
      headers: { cookie },
    });
    expect(overLimit.statusCode).toBe(400);
    expect(overLimit.json().details.fieldErrors.limit).toBeDefined();

    const badDate = await app.inject({
      method: "GET",
      url: "/api/timeline?from=14-09-2026",
      headers: { cookie },
    });
    expect(badDate.statusCode).toBe(400);
    expect(badDate.json().details.fieldErrors.from).toBeDefined();
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({ method: "GET", url: "/api/timeline" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("not_signed_in");
    await close();
  });

  it("shows an admin everything, with the clause dropped", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "admin" },
    });
    const otherMemberId = await insertMember(database);
    const restrictedRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: restrictedRuleId,
    });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(response.json().days[0].items[0].itemId).toBe(itemId);
    await close();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/timeline.test.ts`
Expected: FAIL, 404 on every request, because the route is not registered.

- [ ] **Step 3: Write `readTimelinePage.ts`**

```ts
import type {
  ItemSummary,
  MediaSource,
  MemberRef,
  MilestoneRef,
  TimelineDay,
  TimelineResponse,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client } from "../b2/client.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import {
  makeDrawnEntriesFromItemRows,
  type DrawnEntry,
} from "./collapseBursts.ts";
import { countSelectedItems } from "./countSelectedItems.ts";
import { makeAltTextFromItem } from "./makeAltTextFromItem.ts";
import { makeMediaRefFromSources } from "./makeMediaRefFromSources.ts";
import {
  getDayCountFromMilestone,
  getDayPositionFromMilestone,
  rankMilestonesForDay,
} from "./milestoneSpans.ts";
import { readBurstCovers } from "./readBurstCovers.ts";
import { readDayStream } from "./readDayStream.ts";
import type { CandidateDay } from "./readItemDays.ts";
import { readItemsForDays } from "./readItemsForDays.ts";
import { readMediaSources } from "./readMediaSources.ts";
import { readMemberRefs } from "./readMemberRefs.ts";
import { readMilestoneItemCounts } from "./readMilestoneItemCounts.ts";
import { readPeopleNamesByItemId } from "./readPeopleNamesByItemId.ts";
import { readVisibilitySummaries } from "./readVisibilitySummaries.ts";
import { hasAnyFilter, type TimelineFilter } from "./selectionFilter.ts";
import {
  makeDigestFromFilter,
  makeOpenedIdsForCursor,
  makeTimelineCursorFromPageState,
  type TimelinePageState,
} from "./timelineCursor.ts";

/** Everything the page needs about its items, one batched read each. */
type DrawnItemLookups = {
  mediaSources: Map<string, Map<string, MediaSource>>;
  personNames: Map<string, string[]>;
  visibilities: Map<string, VisibilitySummary>;
  members: Map<string, MemberRef>;
  timezone: string;
};

/** One day, once it is known which occasion takes its band. */
type BandedDay = {
  day: CandidateDay;
  band: MilestoneRef | undefined;
  strips: MilestoneRef[];
};

/** What one page of the day stream is read with. */
export type TimelinePageOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  filter: TimelineFilter;
  limit: number;
  /** Decoded and already checked against the filter digest by the route. */
  cursor: TimelinePageState | undefined;
  /** The request's own clock, which every `expiresAt` counts from. */
  now: Date;
  /** Optional, for the one defect this route can meet and must survive. */
  logger?: { warn: (details: object, message: string) => void };
};

/**
 * One page of the pile: days, their counts, their occasions and their prints.
 *
 * It runs no query of its own. Every read is one of the modules beside it, and
 * none of them is per item, per day or per burst: the day aggregate and the
 * milestones decide the page, then everything about it is fetched in batches
 * keyed by the ids actually drawn.
 *
 * **`itemCount` is not `items.length`.** It is every visible item on the day,
 * burst frames included, because the spine's "212 photos" counts photographs
 * and a burst is a rendering collapse rather than fewer pictures.
 *
 * @param options See {@link TimelinePageOptions}.
 */
export async function readTimelinePage(
  options: Readonly<TimelinePageOptions>,
): Promise<TimelineResponse> {
  const stream = await readDayStream({
    database: options.database,
    viewer: options.viewer,
    filter: options.filter,
    limit: options.limit,
    beforeDay: options.cursor?.lastDay,
    itemBudget: appConfig.timeline.pageItemBudget,
  });

  const bandedDays = _makeBandedDays({
    days: stream.days,
    milestones: stream.milestones,
    openedMilestoneIds: options.cursor?.openedMilestoneIds ?? [],
  });

  const itemsByDay = await _readItemsByDay({
    options,
    days: stream.days.map((day) => {
      return day.capturedOn;
    }),
  });

  const bandCounts = await readMilestoneItemCounts({
    database: options.database,
    viewer: options.viewer,
    milestoneIds: bandedDays.flatMap((banded) => {
      return banded.band === undefined ? [] : [banded.band.milestoneId];
    }),
  });

  return {
    days: bandedDays.map((banded) => {
      return _makeTimelineDay({ banded, bandCounts, itemsByDay });
    }),
    nextCursor: _makeNextCursor({ options, stream, bandedDays }),
    resultCount:
      hasAnyFilter(options.filter) && options.cursor === undefined
        ? await countSelectedItems({
            database: options.database,
            viewer: options.viewer,
            filter: options.filter,
          })
        : null,
  };
}

/**
 * Walks the page newest day first, carrying what has taken a band.
 *
 * The band rule is feed-ordered, so this cannot be done per day in isolation:
 * an occasion that opened on the 17th is a continuation strip on the 16th, and
 * the set it is carried in arrives from the cursor on every page but the first.
 */
function _makeBandedDays(options: {
  days: readonly CandidateDay[];
  milestones: readonly MilestoneRef[];
  openedMilestoneIds: readonly string[];
}): BandedDay[] {
  return options.days.reduce<{ banded: BandedDay[]; opened: string[] }>(
    (state, day) => {
      const ranked = rankMilestonesForDay({
        milestones: options.milestones,
        day: day.capturedOn,
        openedMilestoneIds: state.opened,
      });
      return {
        banded: [
          ...state.banded,
          { day, band: ranked.band, strips: ranked.strips },
        ],
        opened:
          ranked.band === undefined
            ? state.opened
            : [...state.opened, ranked.band.milestoneId],
      };
    },
    { banded: [], opened: [...options.openedMilestoneIds] },
  ).banded;
}

/** Queries 3 to 9: the prints on the page, ready to serve, grouped by day. */
async function _readItemsByDay(options: {
  options: Readonly<TimelinePageOptions>;
  days: readonly string[];
}): Promise<Map<string, ItemSummary[]>> {
  const rows = await readItemsForDays({
    database: options.options.database,
    viewer: options.options.viewer,
    filter: options.options.filter,
    days: options.days,
  });

  const entries = makeDrawnEntriesFromItemRows({
    rows,
    coverItemIdsByBurstId: await readBurstCovers({
      database: options.options.database,
      burstIds: [
        ...new Set(
          rows.flatMap((row) => {
            return row.burstId === null ? [] : [row.burstId];
          }),
        ),
      ],
    }),
  });

  if (entries.length === 0) {
    return new Map();
  }

  const lookups = await _readDrawnItemLookups({
    options: options.options,
    entries,
  });

  return entries.reduce<Map<string, ItemSummary[]>>((itemsByDay, entry) => {
    const summary = _makeItemSummaryFromEntry({ entry, lookups });
    if (summary === undefined) {
      options.options.logger?.warn(
        { itemId: entry.item.itemId },
        "an item with no renditions was counted and not drawn",
      );
      return itemsByDay;
    }
    const items = itemsByDay.get(entry.item.capturedOn) ?? [];
    items.push(summary);
    itemsByDay.set(entry.item.capturedOn, items);
    return itemsByDay;
  }, new Map());
}

/** Queries 5 to 9, keyed by the ids actually drawn. */
async function _readDrawnItemLookups(options: {
  options: Readonly<TimelinePageOptions>;
  entries: readonly DrawnEntry[];
}): Promise<DrawnItemLookups> {
  const itemIds = options.entries.map((entry) => {
    return entry.item.itemId;
  });
  const ruleIds = [
    ...new Set(
      options.entries.map((entry) => {
        return entry.item.visibilityRuleId;
      }),
    ),
  ];

  const [mediaSources, personNames, visibilities, members, settings] =
    await Promise.all([
      readMediaSources({
        database: options.options.database,
        b2: options.options.b2,
        itemIds,
        now: options.options.now,
        ttlSeconds: appConfig.media.signedUrlTtlSeconds,
      }),
      readPeopleNamesByItemId({
        database: options.options.database,
        itemIds,
      }),
      readVisibilitySummaries({
        database: options.options.database,
        ruleIds,
      }),
      readMemberRefs(options.options.database),
      readInstanceSettings({
        database: options.options.database,
        keys: ["shoebox.timezone"],
      }),
    ]);

  return {
    mediaSources,
    personNames,
    visibilities,
    members,
    timezone: settings["shoebox.timezone"],
  };
}

/** One print, or nothing at all when its renditions are missing. */
function _makeItemSummaryFromEntry(options: {
  entry: DrawnEntry;
  lookups: Readonly<DrawnItemLookups>;
}): ItemSummary | undefined {
  const { item, burst } = options.entry;
  const media = makeMediaRefFromSources({
    sources: options.lookups.mediaSources.get(item.itemId) ?? new Map(),
    durationMs: item.durationMs,
    altText: makeAltTextFromItem({
      altTextOverride: item.altTextOverride,
      personNames: options.lookups.personNames.get(item.itemId) ?? [],
      capturedAt: item.capturedAt,
      timezone: options.lookups.timezone,
    }),
  });

  if (media === undefined) {
    return undefined;
  }

  return {
    itemId: item.itemId,
    kind: item.kind,
    capturedAt: item.capturedAt,
    capturedOn: item.capturedOn,
    media,
    isUnseen: item.isUnseen,
    uploadedBy: options.lookups.members.get(item.uploadedBy) ?? {
      memberId: item.uploadedBy,
      displayName: "",
    },
    visibility: options.lookups.visibilities.get(item.visibilityRuleId) ?? {
      mode: "everyone",
      label: null,
      subjects: [],
    },
    burst: burst ?? null,
  };
}

/** One day, with its band resolved and its prints attached. */
function _makeTimelineDay(options: {
  banded: Readonly<BandedDay>;
  bandCounts: ReadonlyMap<string, number>;
  itemsByDay: ReadonlyMap<string, ItemSummary[]>;
}): TimelineDay {
  const { day, band, strips } = options.banded;
  return {
    capturedOn: day.capturedOn,
    itemCount: day.itemCount,
    unseenCount: day.unseenCount,
    milestoneBand:
      band === undefined
        ? null
        : {
            milestone: band,
            dayPosition: getDayPositionFromMilestone({
              milestone: band,
              day: day.capturedOn,
            }),
            dayCount: getDayCountFromMilestone(band),
            itemCount: options.bandCounts.get(band.milestoneId) ?? 0,
          },
    milestoneStrips: strips.map((milestone) => {
      return {
        milestone,
        dayPosition: getDayPositionFromMilestone({
          milestone,
          day: day.capturedOn,
        }),
        dayCount: getDayCountFromMilestone(milestone),
      };
    }),
    items: options.itemsByDay.get(day.capturedOn) ?? [],
  };
}

/** The cursor for the next page, or null at the end of the archive. */
function _makeNextCursor(options: {
  options: Readonly<TimelinePageOptions>;
  stream: { hasMore: boolean; milestones: readonly MilestoneRef[] };
  bandedDays: readonly BandedDay[];
}): string | null {
  const lastDay =
    options.bandedDays[options.bandedDays.length - 1]?.day.capturedOn;
  if (!options.stream.hasMore || lastDay === undefined) {
    return null;
  }

  return makeTimelineCursorFromPageState({
    lastDay,
    openedMilestoneIds: makeOpenedIdsForCursor({
      previousOpenedIds: options.options.cursor?.openedMilestoneIds ?? [],
      bandedIds: options.bandedDays.flatMap((banded) => {
        return banded.band === undefined ? [] : [banded.band.milestoneId];
      }),
      milestones: options.stream.milestones,
      lastDay,
    }),
    filterDigest: makeDigestFromFilter(options.options.filter),
  });
}
```

- [ ] **Step 4: Write the route**

Create `apps/server/src/routes/timeline.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  timelineRequestSchema,
  type TimelineResponse,
} from "@memory-shoebox/shared";
import { readTimelinePage } from "../archive/readTimelinePage.ts";
import {
  makeTimelineFilterFromQuery,
  type TimelineFilter,
} from "../archive/selectionFilter.ts";
import {
  getPageStateFromTimelineCursor,
  makeDigestFromFilter,
  type TimelinePageState,
} from "../archive/timelineCursor.ts";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * Decodes the cursor, or refuses the request.
 *
 * Two failures and one status: a cursor that does not decode and a cursor
 * whose digest names a different selection are both `400 invalid_request` with
 * `details.fieldErrors.cursor`. The second matters more than it looks: a
 * client that changed the filter without resetting the cursor would otherwise
 * get a page ranked against a different feed, with bands opening twice.
 */
function _getPageStateFromCursor(options: {
  cursor: string | undefined;
  filter: Readonly<TimelineFilter>;
}): TimelinePageState | undefined {
  if (options.cursor === undefined) {
    return undefined;
  }
  const state = getPageStateFromTimelineCursor(options.cursor);
  if (
    state === undefined ||
    state.filterDigest !== makeDigestFromFilter(options.filter)
  ) {
    throw ApiError.invalidRequest({
      cursor: ["This cursor does not belong to this selection."],
    });
  }
  return state;
}

/**
 * The day stream: `tech-specs/apis/timeline.md`.
 *
 * **One route, not two.** The `filtered` state of surface 2 and the results of
 * surface 6 are this endpoint with query parameters set: a filtered archive is
 * not a different object, and an API that made it one would invite the two to
 * drift.
 *
 * No `403` and no `404` exist here. The route addresses no row by id, and an
 * invisible item is simply absent from the page and from every count on it,
 * which is the same thing the 404 rule buys elsewhere.
 */
export async function timelineRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/timeline",
    async (request: FastifyRequest): Promise<TimelineResponse> => {
      const viewer = requireViewer(request);
      const query = timelineRequestSchema.parse(request.query);
      const filter = makeTimelineFilterFromQuery(query);

      return readTimelinePage({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        filter,
        limit: query.limit,
        cursor: _getPageStateFromCursor({ cursor: query.cursor, filter }),
        now: request.server.clock(),
        logger: request.log,
      });
    },
  );
}
```

- [ ] **Step 5: Register it**

In `apps/server/src/app.ts`, add the import beside the other route imports:

```ts
import { timelineRoutes } from "./routes/timeline.ts";
```

and the registration inside the `/api` plugin, after `meRoutes`:

```ts
      await timelineRoutes(api);
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/timeline.test.ts`
Expected: PASS, every case.

- [ ] **Step 7: Run the whole server suite, which must still be green**

Run: `pnpm --filter @memory-shoebox/server test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/archive apps/server/src/routes/timeline.ts apps/server/src/app.ts apps/server/test/routes/timeline.test.ts
git commit -m "feat(archive): GET /api/timeline, days with their counts and prints"
```

---

## Task 15: The contract, asserted

The properties `timeline.md` states once at its head and `step-4a.md` asks for
by name. These are not extra tests: each one is a sentence in the contract that
would otherwise be enforced by nothing.

**Files:**

- Create: `apps/server/test/routes/timelineContract.test.ts`

- [ ] **Step 1: Write the tests**

Create `apps/server/test/routes/timelineContract.test.ts`:

```ts
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "../../src/db/types/db.types.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createQueryCountingDatabase } from "../helpers/createQueryCountingDatabase.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertGroup,
  insertItem,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertPerson,
  insertRendition,
  insertTag,
  insertUploadSession,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
  setBurstCover,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async (overrides: { database?: Kysely<Database> } = {}) => {
  return createTestApp({
    ...overrides,
    clock: () => {
      return new Date(NOW);
    },
  });
};

/** One photograph, drawable, on a day. */
async function insertDrawableItem(
  database: Kysely<Database>,
  options: {
    uploadedBy: string;
    seq: number;
    capturedOn?: string;
    capturedAt?: string;
    visibilityRuleId?: string;
  },
): Promise<string> {
  const capturedOn = options.capturedOn ?? "2026-09-14";
  const itemId = await insertItem(database, {
    uploadedBy: options.uploadedBy,
    seq: options.seq,
    captured_on: capturedOn,
    captured_at: options.capturedAt ?? `${capturedOn}T09:00:00.000Z`,
    ...(options.visibilityRuleId === undefined
      ? {}
      : { visibility_rule_id: options.visibilityRuleId }),
  });
  await insertRendition(database, { itemId, purpose: "thumb" });
  await insertRendition(database, { itemId, purpose: "display" });
  return itemId;
}

describe("the empty archive and the invisible one", () => {
  it("are byte-identical on the wire", async () => {
    const empty = await makeApp();
    const emptyMember = await insertSignedInMember({ database: empty.database });
    const emptyResponse = await empty.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: emptyMember.cookie },
    });

    const restricted = await makeApp();
    const restrictedMember = await insertSignedInMember({
      database: restricted.database,
    });
    const otherMemberId = await insertMember(restricted.database);
    const hiddenRuleId = await insertVisibilityRule(restricted.database, {
      mode: "only",
    });
    await insertDrawableItem(restricted.database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibilityRuleId: hiddenRuleId,
    });
    const restrictedResponse = await restricted.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: restrictedMember.cookie },
    });

    expect(restrictedResponse.body).toBe(emptyResponse.body);
    expect(emptyResponse.body).toBe(
      '{"days":[],"nextCursor":null,"resultCount":null}',
    );

    await empty.close();
    await restricted.close();
  });

  it("carries no field that varies with what the viewer cannot see", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertDrawableItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibilityRuleId: hiddenRuleId,
    });
    await insertDrawableItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibilityRuleId: hiddenRuleId,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(Object.keys(response.json()).sort()).toEqual([
      "days",
      "nextCursor",
      "resultCount",
    ]);
    await close();
  });
});

describe("a day of 212 that reads as 204", () => {
  it("counts and draws only what the viewer may see, and names nothing else", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });

    const visibleIds = await Promise.all(
      Array.from({ length: 204 }, (_unused, index) => {
        return insertDrawableItem(database, {
          uploadedBy: memberId,
          seq: index + 1,
        });
      }),
    );
    const hiddenIds = await Promise.all(
      Array.from({ length: 8 }, (_unused, index) => {
        return insertDrawableItem(database, {
          uploadedBy: otherMemberId,
          seq: 300 + index,
          visibilityRuleId: hiddenRuleId,
        });
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    expect(day.itemCount).toBe(204);
    expect(day.unseenCount).toBe(204);
    expect(day.items).toHaveLength(204);
    expect(visibleIds).toHaveLength(204);
    hiddenIds.forEach((hiddenId) => {
      expect(response.body).not.toContain(hiddenId);
    });
    await close();
  });

  it("moves the count and the rows together when one item is restricted", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    await insertDrawableItem(database, { uploadedBy: memberId, seq: 1 });
    const movingId = await insertDrawableItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
    });
    const tagId = await insertTag(database, { name: "beach" });
    await insertItemTag(database, { itemId: movingId, tagId });
    const milestoneId = await insertMilestone(database, {
      name: "A day at the beach",
      startsOn: "2026-09-14",
    });
    await insertItemMilestone(database, { itemId: movingId, milestoneId });

    const before = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(before.json().days[0].itemCount).toBe(2);
    expect(before.json().days[0].items).toHaveLength(2);
    expect(before.json().days[0].milestoneBand.itemCount).toBe(1);

    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await database
      .updateTable("items")
      .set({ visibility_rule_id: hiddenRuleId })
      .where("id", "=", movingId)
      .execute();

    const after = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(after.json().days[0].itemCount).toBe(1);
    expect(after.json().days[0].items).toHaveLength(1);
    expect(after.json().days[0].milestoneBand.itemCount).toBe(0);
    await close();
  });

  it("keeps a photograph restricted to admins out of a viewer it tags", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const adminId = await insertMember(database, { role: "admin" });
    const adminsOnlyGroupId = await insertGroup(database, { name: "Admins" });
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId: hiddenRuleId,
      groupId: adminsOnlyGroupId,
    });
    const hiddenId = await insertDrawableItem(database, {
      uploadedBy: adminId,
      seq: 1,
      visibilityRuleId: hiddenRuleId,
    });
    // Being in a photograph is not a key to it (Decision 7).
    const personId = await insertPerson(database, {
      displayName: "Abuela Rosa",
      member_id: memberId,
    });
    await insertItemPerson(database, { itemId: hiddenId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(response.json().days).toEqual([]);
    await close();
  });
});

describe("the milestone-span union under a filter", () => {
  it("keeps a milestone-only day under a date range and drops it under a tag", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const taggedId = await insertDrawableItem(database, {
      uploadedBy: memberId,
      seq: 1,
      capturedOn: "2026-09-14",
    });
    const tagId = await insertTag(database, { name: "beach" });
    await insertItemTag(database, { itemId: taggedId, tagId });
    await insertMilestone(database, {
      name: "A quiet day",
      startsOn: "2026-09-13",
    });

    const dated = await app.inject({
      method: "GET",
      url: "/api/timeline?from=2026-09-01&until=2026-09-30",
      headers: { cookie },
    });
    expect(
      dated.json().days.map((day: { capturedOn: string }) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14", "2026-09-13"]);

    const tagged = await app.inject({
      method: "GET",
      url: `/api/timeline?tags=${tagId}`,
      headers: { cookie },
    });
    expect(
      tagged.json().days.map((day: { capturedOn: string }) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14"]);
    await close();
  });

  it("narrows to nothing on an unknown tag or person, rather than erroring", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertDrawableItem(database, { uploadedBy: memberId, seq: 1 });
    const unknownId = "0199c0a0-0000-7000-8000-00000000dead";

    const byTag = await app.inject({
      method: "GET",
      url: `/api/timeline?tags=${unknownId}`,
      headers: { cookie },
    });
    expect(byTag.statusCode).toBe(200);
    expect(byTag.json()).toEqual({
      days: [],
      nextCursor: null,
      resultCount: 0,
    });

    const byPerson = await app.inject({
      method: "GET",
      url: `/api/timeline?people=${unknownId}`,
      headers: { cookie },
    });
    expect(byPerson.statusCode).toBe(200);
    expect(byPerson.json().days).toEqual([]);
    await close();
  });
});

describe("paging the whole archive", () => {
  it("returns every day exactly once", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const days = [
      "2026-09-17",
      "2026-09-14",
      "2026-09-13",
      "2026-09-11",
      "2026-09-02",
    ];
    await Promise.all(
      days.map((capturedOn, index) => {
        return insertDrawableItem(database, {
          uploadedBy: memberId,
          seq: index + 1,
          capturedOn,
        });
      }),
    );
    // A milestone-only day between two item days, which must page like one.
    await insertMilestone(database, {
      name: "A quiet day",
      startsOn: "2026-09-12",
    });

    const walk = async (
      cursor: string | null,
      seen: string[],
    ): Promise<string[]> => {
      const response = await app.inject({
        method: "GET",
        url: `/api/timeline?limit=2${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
        headers: { cookie },
      });
      const body = response.json();
      const withThisPage = [
        ...seen,
        ...body.days.map((day: { capturedOn: string }) => {
          return day.capturedOn;
        }),
      ];
      return body.nextCursor === null
        ? withThisPage
        : walk(body.nextCursor, withThisPage);
    };

    const visited = await walk(null, []);
    expect(visited).toEqual([
      "2026-09-17",
      "2026-09-14",
      "2026-09-13",
      "2026-09-12",
      "2026-09-11",
      "2026-09-02",
    ]);
    expect(new Set(visited).size).toBe(visited.length);
    await close();
  });

  it("opens an occasion's band once, however the pages fall", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await Promise.all(
      ["2026-09-21", "2026-09-20", "2026-09-19"].map((capturedOn, index) => {
        return insertDrawableItem(database, {
          uploadedBy: memberId,
          seq: index + 1,
          capturedOn,
        });
      }),
    );
    await insertMilestone(database, {
      name: "Mateo's first week at home",
      startsOn: "2026-09-17",
      endsOn: "2026-09-21",
    });

    const first = await app.inject({
      method: "GET",
      url: "/api/timeline?limit=1",
      headers: { cookie },
    });
    // The feed runs newest first, so the band opens on the occasion's last day.
    expect(first.json().days[0].milestoneBand.dayPosition).toBe(5);
    expect(first.json().days[0].milestoneBand.dayCount).toBe(5);

    const second = await app.inject({
      method: "GET",
      url: `/api/timeline?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { cookie },
    });
    expect(second.json().days[0].milestoneBand).toBeNull();
    expect(second.json().days[0].milestoneStrips).toHaveLength(1);
    expect(second.json().days[0].milestoneStrips[0].dayPosition).toBe(4);
    await close();
  });

  it("gives the band to the narrowest span and strips the rest", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertDrawableItem(database, {
      uploadedBy: memberId,
      seq: 1,
      capturedOn: "2026-09-17",
    });
    await insertMilestone(database, {
      name: "Mateo's first week at home",
      startsOn: "2026-09-17",
      endsOn: "2026-09-21",
    });
    await insertMilestone(database, {
      name: "Home from the hospital",
      startsOn: "2026-09-17",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    const [day] = response.json().days;
    expect(day.milestoneBand.milestone.name).toBe("Home from the hospital");
    expect(day.milestoneStrips).toHaveLength(1);
    expect(day.milestoneStrips[0].milestone.name).toBe(
      "Mateo's first week at home",
    );
    // A strip prints "day 1 of 5" and a name, and carries no count.
    expect(day.milestoneStrips[0].dayCount).toBe(5);
    expect(day.milestoneStrips[0]).not.toHaveProperty("itemCount");
    await close();
  });
});

describe("a burst in the pile", () => {
  const seedBurst = async (
    database: Kysely<Database>,
    options: { memberId: string; hiddenRuleId?: string },
  ) => {
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: options.memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const frameIds = await Promise.all(
      [0, 1, 2].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: options.memberId,
          seq: index + 1,
          captured_on: "2026-09-14",
          captured_at: shiftMinutes({
            instant: "2026-09-14T06:41:00.000Z",
            minutes: index,
          }),
          burst_id: burstId,
          burst_index: index + 1,
          ...(index === 2 && options.hiddenRuleId !== undefined
            ? { visibility_rule_id: options.hiddenRuleId }
            : {}),
        });
        await insertRendition(database, { itemId, purpose: "thumb" });
        return itemId;
      }),
    );
    return { burstId, frameIds };
  };

  it("draws one stack whose count and span cover the visible frames only", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const { burstId, frameIds } = await seedBurst(database, {
      memberId: otherMemberId,
      hiddenRuleId,
    });
    const visibleRuleId = await database
      .selectFrom("items")
      .select("visibility_rule_id")
      .where("id", "=", frameIds[0] ?? "")
      .executeTakeFirstOrThrow();
    expect(visibleRuleId).toBeDefined();

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    // Two visible frames of three, so the day counts two and draws one print.
    expect(day.itemCount).toBe(2);
    expect(day.items).toHaveLength(1);
    expect(day.items[0].burst).toEqual({
      burstId,
      visibleFrameCount: 2,
      startsAt: "2026-09-14T06:41:00.000Z",
      endsAt: "2026-09-14T06:42:00.000Z",
      coverItemId: frameIds[0],
      hasUnseenFrames: true,
    });
    expect(response.body).not.toContain(frameIds[2]);
    await close();
  });

  it("falls back to the earliest visible frame when the cover is restricted", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const { burstId, frameIds } = await seedBurst(database, {
      memberId: otherMemberId,
      hiddenRuleId,
    });
    await setBurstCover(database, {
      burstId,
      coverItemId: frameIds[2] ?? "",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(response.json().days[0].items[0].burst.coverItemId).toBe(frameIds[0]);
    expect(memberId).toBeDefined();
    await close();
  });

  it("draws a burst of one visible frame as a plain print", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: otherMemberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      captured_on: "2026-09-14",
      burst_id: burstId,
      burst_index: 1,
    });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(response.json().days[0].items[0].burst).toBeNull();
    await close();
  });

  it("makes a burst with no visible frames vanish from the day entirely", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: otherMemberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    await Promise.all(
      [0, 1, 2].map(async (index) => {
        const itemId = await insertItem(database, {
          uploadedBy: otherMemberId,
          seq: index + 1,
          captured_on: "2026-09-14",
          burst_id: burstId,
          burst_index: index + 1,
          visibility_rule_id: hiddenRuleId,
        });
        await insertRendition(database, { itemId, purpose: "thumb" });
      }),
    );
    await insertDrawableItem(database, { uploadedBy: memberId, seq: 10 });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    const [day] = response.json().days;
    expect(day.itemCount).toBe(1);
    expect(day.items).toHaveLength(1);
    expect(response.body).not.toContain(burstId);
    await close();
  });
});

describe("the query plan", () => {
  it("costs the same for one print as for two hundred and fifty", async () => {
    const small = createQueryCountingDatabase(createDatabase(":memory:"));
    const smallApp = await makeApp({ database: small.database });
    const smallMember = await insertSignedInMember({
      database: smallApp.database,
    });
    await insertDrawableItem(smallApp.database, {
      uploadedBy: smallMember.memberId,
      seq: 1,
    });

    small.reset();
    const smallResponse = await smallApp.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: smallMember.cookie },
    });
    const smallQueries = small.getQueryCount();

    const large = createQueryCountingDatabase(createDatabase(":memory:"));
    const largeApp = await makeApp({ database: large.database });
    const largeMember = await insertSignedInMember({
      database: largeApp.database,
    });
    const largeDays = ["2026-09-14", "2026-09-13", "2026-09-12"];
    await Promise.all(
      Array.from({ length: 250 }, (_unused, index) => {
        return insertDrawableItem(largeApp.database, {
          uploadedBy: largeMember.memberId,
          seq: index + 1,
          capturedOn: largeDays[index % largeDays.length],
        });
      }),
    );
    await insertMilestone(largeApp.database, {
      name: "Three days",
      startsOn: "2026-09-12",
      endsOn: "2026-09-14",
    });

    large.reset();
    const largeResponse = await largeApp.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: largeMember.cookie },
    });
    const largeQueries = large.getQueryCount();

    expect(smallResponse.statusCode).toBe(200);
    expect(largeResponse.statusCode).toBe(200);
    expect(largeResponse.json().days).toHaveLength(3);
    // Three days and 250 prints cost what one day and one print costs, plus
    // the band count that only the large page has a band for. Neither number
    // grows with the page: that is the property, not the number itself.
    expect(largeQueries).toBeLessThanOrEqual(smallQueries + 1);
    expect(smallQueries).toBeLessThanOrEqual(14);

    await smallApp.close();
    await largeApp.close();
  });
});
```

Note on `migrateToLatest`: `createTestApp` runs it on whatever handle it is
given, including the counting one, which is why the counter is reset **after**
the app and the seeds are built.

- [ ] **Step 2: Run them**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/timelineContract.test.ts`
Expected: PASS. If the query-plan case fails, read the number before changing
the bound: a count that grows with the page is a real regression, and a count
that is merely higher than 14 means a query was added and the bound needs a
reason to move.

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/routes/timelineContract.test.ts
git commit -m "test(archive): the contract the timeline route carries"
```

---

## Task 16: `GET /api/timeline/rail`

The same day stream without items and without a limit. The rail is what
surface 2's `end` block sums its figures from, and what the one-time line after
a first sign-in reads its number from: the timeline has no total field, and
adding one would be a second place the two empty states could drift apart.

**Files:**

- Create: `apps/server/src/archive/readRailDays.ts`
- Modify: `apps/server/src/routes/timeline.ts`
- Test: `apps/server/test/routes/timelineRail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/timelineRail.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { timelineRailResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertTag,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("GET /api/timeline/rail", () => {
  it("lists every visible day with its per-viewer count", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-14",
    });
    await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 3,
      captured_on: "2026-09-14",
      visibility_rule_id: hiddenRuleId,
    });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 4,
      captured_on: "2026-09-11",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(timelineRailResponseSchema.parse(response.json())).toEqual({
      days: [
        { capturedOn: "2026-09-14", itemCount: 2 },
        { capturedOn: "2026-09-11", itemCount: 1 },
      ],
      nextCursor: null,
    });
    await close();
  });

  it("carries a milestone-only day at zero, which is the point", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertMilestone(database, {
      name: "A quiet day",
      startsOn: "2026-09-13",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
      headers: { cookie },
    });
    expect(response.json().days).toEqual([
      { capturedOn: "2026-09-14", itemCount: 1 },
      { capturedOn: "2026-09-13", itemCount: 0 },
    ]);
    await close();
  });

  it("matches the pile under the same filter", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const tagId = await insertTag(database, { name: "beach" });
    const taggedId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    await insertItemTag(database, { itemId: taggedId, tagId });
    await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-11",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/timeline/rail?tags=${tagId}`,
      headers: { cookie },
    });
    expect(response.json().days).toEqual([
      { capturedOn: "2026-09-14", itemCount: 1 },
    ]);
    await close();
  });

  it("is empty in a way that cannot tell the two empty states apart", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
      headers: { cookie },
    });
    expect(response.body).toBe('{"days":[],"nextCursor":null}');
    await close();
  });

  it("rejects limit and cursor rather than ignoring them", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const limited = await app.inject({
      method: "GET",
      url: "/api/timeline/rail?limit=10",
      headers: { cookie },
    });
    expect(limited.statusCode).toBe(400);
    expect(limited.json().details.fieldErrors.limit).toBeDefined();

    const cursored = await app.inject({
      method: "GET",
      url: "/api/timeline/rail?cursor=abc",
      headers: { cookie },
    });
    expect(cursored.statusCode).toBe(400);
    expect(cursored.json().details.fieldErrors.cursor).toBeDefined();
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/rail",
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/timelineRail.test.ts`
Expected: FAIL, 404 on every request.

- [ ] **Step 3: Write `readRailDays.ts`**

```ts
import type { RailDay } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { getUnionDaysFromMilestones, makeMergedDays } from "./mergeDays.ts";
import { readItemDays } from "./readItemDays.ts";
import { readOverlappingMilestones } from "./readOverlappingMilestones.ts";
import { hasContentFilter, type TimelineFilter } from "./selectionFilter.ts";

/**
 * Every visible day with its count, complete and unpaginated.
 *
 * The same day stream as the timeline, same union rule, same counts, without
 * the items. A milestone-only day appears at `itemCount: 0` and is jumpable,
 * which is the point of it being here.
 *
 * **The first query in the product that will hurt**
 * (`data-models.md` § The queries that will hurt first): a covering scan of
 * roughly 50,000 index entries on `(captured_on DESC, visibility_rule_id, id)`
 * plus the milestone expansion, unbounded in day count. It is the first thing
 * to cache, per `(memberId, visibilityGeneration)` plus an item-generation
 * counter, and it is deliberately not cached yet: nothing writes an item until
 * step 6a, so there is nothing to bump that counter and a cache with no
 * invalidation channel is a rail that goes stale on the first upload.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The same selection the pile under it carries.
 */
export async function readRailDays(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Promise<RailDay[]> {
  const itemDays = await readItemDays({
    database: options.database,
    viewer: options.viewer,
    filter: options.filter,
  });

  const milestoneDays = hasContentFilter(options.filter)
    ? []
    : getUnionDaysFromMilestones({
        milestones: await readOverlappingMilestones({
          database: options.database,
          fromDay: options.filter.from,
          untilDay: options.filter.until,
          beforeDay: undefined,
          sinceDay: undefined,
        }),
        fromDay: options.filter.from,
        untilDay: options.filter.until,
        beforeDay: undefined,
        sinceDay: undefined,
      });

  return makeMergedDays({ itemDays, milestoneDays }).map((day) => {
    return { capturedOn: day.capturedOn, itemCount: day.itemCount };
  });
}
```

- [ ] **Step 4: Add the route**

In `apps/server/src/routes/timeline.ts`, extend the imports and add the second
route inside `timelineRoutes`:

```ts
import {
  timelineRailRequestSchema,
  timelineRequestSchema,
  type TimelineRailResponse,
  type TimelineResponse,
} from "@memory-shoebox/shared";
import { readRailDays } from "../archive/readRailDays.ts";
```

```ts
  app.get(
    "/timeline/rail",
    async (request: FastifyRequest): Promise<TimelineRailResponse> => {
      const viewer = requireViewer(request);
      // `limit` and `cursor` are rejected by the schema rather than ignored:
      // the rail's whole job is to be complete, and silently accepting them
      // would let somebody build a paginated one by accident.
      const query = timelineRailRequestSchema.parse(request.query);

      return {
        days: await readRailDays({
          database: request.server.database,
          viewer,
          filter: makeTimelineFilterFromQuery(query),
        }),
        // Always null, present only to satisfy the collection envelope.
        nextCursor: null,
      };
    },
  );
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/timelineRail.test.ts`
Expected: PASS, every case.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/archive/readRailDays.ts apps/server/src/routes/timeline.ts apps/server/test/routes/timelineRail.test.ts
git commit -m "feat(archive): the jump rail, complete and unpaginated"
```

---

## Task 17: The vocabularies, and `GET /api/tags`

One aggregate per vocabulary, serving three routes. **Both are left joins from
the vocabulary table with the predicate in the `ON` clause and `COUNT(i.id)`
rather than `COUNT(*)`**: in the `WHERE` the left join collapses and a tag
whose every item is restricted disappears from the type-ahead, and with
`COUNT(*)` the null-extended row gives every one of them a floor of 1.

**Files:**

- Create: `apps/server/src/archive/makeNormalisedNameFromName.ts`
- Create: `apps/server/src/archive/readVocabularyCounts.ts`
- Create: `apps/server/src/routes/tags.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/routes/tags.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/tags.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tagsResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemTag,
  insertMember,
  insertTag,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("GET /api/tags", () => {
  it("counts per viewer, orders by count then name, and pages never", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const beachId = await insertTag(database, { name: "Beach" });
    const summerId = await insertTag(database, { name: "summer" });
    const firstId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const secondId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    await insertItemTag(database, { itemId: firstId, tagId: beachId });
    await insertItemTag(database, { itemId: secondId, tagId: beachId });
    await insertItemTag(database, { itemId: firstId, tagId: summerId });

    const response = await app.inject({
      method: "GET",
      url: "/api/tags",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(tagsResponseSchema.parse(response.json())).toEqual({
      tags: [
        { tag: { tagId: beachId, name: "Beach" }, itemCount: 2 },
        { tag: { tagId: summerId, name: "summer" }, itemCount: 1 },
      ],
      nextCursor: null,
    });
    await close();
  });

  it("keeps a tag whose every item is restricted, at zero", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const tagId = await insertTag(database, { name: "hospital" });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: hiddenRuleId,
    });
    await insertItemTag(database, { itemId, tagId });

    const response = await app.inject({
      method: "GET",
      url: "/api/tags",
      headers: { cookie },
    });
    expect(response.json().tags).toEqual([
      { tag: { tagId, name: "hospital" }, itemCount: 0 },
    ]);
    await close();
  });

  it("keeps a tag nothing has ever been tagged with, at zero", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const tagId = await insertTag(database, { name: "unused" });

    const response = await app.inject({
      method: "GET",
      url: "/api/tags",
      headers: { cookie },
    });
    expect(response.json().tags).toEqual([
      { tag: { tagId, name: "unused" }, itemCount: 0 },
    ]);
    await close();
  });

  it("narrows on the normalised name, ignoring case", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    await insertTag(database, { name: "Hospital" });
    await insertTag(database, { name: "beach" });

    const response = await app.inject({
      method: "GET",
      url: "/api/tags?q=HOSP",
      headers: { cookie },
    });
    expect(
      response.json().tags.map((entry: { tag: { name: string } }) => {
        return entry.tag.name;
      }),
    ).toEqual(["Hospital"]);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({ method: "GET", url: "/api/tags" });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/tags.test.ts`
Expected: FAIL, 404 on every request.

- [ ] **Step 3: Write `makeNormalisedNameFromName.ts`**

```ts
/**
 * A name as `tags.name_normalized` holds it: trimmed, lowercased,
 * whitespace-collapsed, NFC.
 *
 * The column exists so that "Hospital" and "hospital" are one tag, and this is
 * the same rule applied to the search term and to a person's display name,
 * which has no normalised column of its own.
 *
 * `toLocaleLowerCase` rather than `toLowerCase`, and NFC before it, because
 * the vocabulary is a family's own words: "Sofía" and "Papá" have to fold the
 * way SQLite's ASCII-only `LIKE` would not. Accents are kept rather than
 * stripped, so "sofia" does not match "Sofía": folding case is what the
 * contract asks for, and stripping accents is a different decision that
 * nothing has made.
 *
 * @param name The name as somebody typed it.
 */
export function makeNormalisedNameFromName(name: string): string {
  return name.normalize("NFC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
```

- [ ] **Step 4: Write `readVocabularyCounts.ts`**

```ts
import { expressionBuilder } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";
import { makeNormalisedNameFromName } from "./makeNormalisedNameFromName.ts";

/** One entry of a vocabulary, and what it is worth to this viewer. */
export type VocabularyCount = {
  id: string;
  name: string;
  /** What `q` matches, and the ordering's tiebreak. */
  nameNormalized: string;
  itemCount: number;
};

/** Count descending, then the normalised name, and never anything else. */
function _byCountThenName(
  left: Readonly<VocabularyCount>,
  right: Readonly<VocabularyCount>,
): number {
  return left.itemCount === right.itemCount
    ? left.nameNormalized.localeCompare(right.nameNormalized)
    : right.itemCount - left.itemCount;
}

/**
 * Every tag, with the count this viewer would see.
 *
 * **The predicate sits in the `ON` clause of the join to `items`.** In the
 * `WHERE` the left join collapses to an inner one and every tag whose items
 * are all restricted vanishes from the vocabulary, which makes a type-ahead
 * lie about what exists. The count is `COUNT(i.id)` and never `COUNT(*)`, or
 * the null-extended row gives an unused tag a floor of 1.
 *
 * This one aggregate serves `GET /api/tags` and both the ordering and the
 * `ownCount` of `GET /api/filters/facets`, which is why it is here rather than
 * inside either route. It is the aggregate `timeline.md` asks to be cached per
 * `(memberId, visibilityGeneration)`; the cache waits for step 6a to give it
 * something to invalidate on.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 */
export async function readTagCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
}): Promise<VocabularyCount[]> {
  const rows = await options.database
    .selectFrom("tags")
    .leftJoin("item_tags", "item_tags.tag_id", "tags.id")
    .leftJoin("items", (join) => {
      return join
        .onRef("items.id", "=", "item_tags.item_id")
        .on(
          visibilityExpression({
            eb: expressionBuilder<Database, "items">(),
            viewer: options.viewer,
          }),
        );
    })
    .select((eb) => {
      return [
        "tags.id as id",
        "tags.name as name",
        "tags.name_normalized as nameNormalized",
        eb.fn.count<number>("items.id").as("itemCount"),
      ];
    })
    .groupBy(["tags.id", "tags.name", "tags.name_normalized"])
    .execute();

  return rows
    .map((row) => {
      return {
        id: row.id,
        name: row.name,
        nameNormalized: row.nameNormalized,
        itemCount: Number(row.itemCount),
      };
    })
    .sort(_byCountThenName);
}

/**
 * Every person, with the count this viewer would see.
 *
 * The same shape and the same two hazards as {@link readTagCounts}, and one
 * more that matters more here: the person with no `item_people` rows at all is
 * the entire point of surface 7's `zero` state, and both mistakes delete them
 * from the directory.
 *
 * `people` has no normalised column, so the name is normalised in the
 * application, which is also where `q` is applied.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 */
export async function readPersonCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
}): Promise<VocabularyCount[]> {
  const rows = await options.database
    .selectFrom("people")
    .leftJoin("item_people", "item_people.person_id", "people.id")
    .leftJoin("items", (join) => {
      return join
        .onRef("items.id", "=", "item_people.item_id")
        .on(
          visibilityExpression({
            eb: expressionBuilder<Database, "items">(),
            viewer: options.viewer,
          }),
        );
    })
    .select((eb) => {
      return [
        "people.id as id",
        "people.display_name as name",
        eb.fn.count<number>("items.id").as("itemCount"),
      ];
    })
    .groupBy(["people.id", "people.display_name"])
    .execute();

  return rows
    .map((row) => {
      return {
        id: row.id,
        name: row.name,
        nameNormalized: makeNormalisedNameFromName(row.name),
        itemCount: Number(row.itemCount),
      };
    })
    .sort(_byCountThenName);
}
```

- [ ] **Step 5: Write the route**

Create `apps/server/src/routes/tags.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import { tagsRequestSchema, type TagsResponse } from "@memory-shoebox/shared";
import { makeNormalisedNameFromName } from "../archive/makeNormalisedNameFromName.ts";
import { readTagCounts } from "../archive/readVocabularyCounts.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * The tag vocabulary: `tech-specs/apis/timeline.md`.
 *
 * **Not paginated, deliberately.** The aggregate scans `item_tags` whole
 * whichever page is asked for, so cursoring would save serialisation and
 * nothing else, while a partial vocabulary makes a type-ahead lie. The
 * vocabulary is bounded by how much a family types, not by how much it
 * photographs.
 *
 * `q` is applied in the application over the same normalised name the column
 * holds, because the aggregate is already in memory and because folding case
 * for "Sofía" is something JavaScript does and SQLite's ASCII-only `LIKE` does
 * not.
 */
export async function tagsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tags", async (request: FastifyRequest): Promise<TagsResponse> => {
    const viewer = requireViewer(request);
    const query = tagsRequestSchema.parse(request.query);
    const search =
      query.q === undefined ? undefined : makeNormalisedNameFromName(query.q);

    const counts = await readTagCounts({
      database: request.server.database,
      viewer,
    });

    return {
      tags: counts
        .filter((count) => {
          return search === undefined || count.nameNormalized.includes(search);
        })
        .map((count) => {
          return {
            tag: { tagId: count.id, name: count.name },
            itemCount: count.itemCount,
          };
        }),
      nextCursor: null,
    };
  });
}
```

- [ ] **Step 6: Register it**

In `apps/server/src/app.ts`, beside the other route imports and registrations:

```ts
import { tagsRoutes } from "./routes/tags.ts";
```

```ts
      await tagsRoutes(api);
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/tags.test.ts`
Expected: PASS, every case.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/archive apps/server/src/routes/tags.ts apps/server/src/app.ts apps/server/test/routes/tags.test.ts
git commit -m "feat(archive): the tag vocabulary, zeros and all"
```

---

## Task 18: `GET /api/filters/facets`

Counts **narrow** (Decision 13): a chip shows what adding it to the current
selection would leave, not what it is worth on its own, so `beach 0` is visible
before anybody presses it and the no-results dead end is unreachable by
accident.

**Files:**

- Create: `apps/server/src/archive/readFacets.ts`
- Create: `apps/server/src/routes/filters.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/routes/filters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/filters.test.ts`:

```ts
import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { filterFacetsResponseSchema } from "@memory-shoebox/shared";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertItemTag,
  insertPerson,
  insertTag,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("GET /api/filters/facets", () => {
  let testApp: TestApp;
  let database: Kysely<Database>;
  let cookie: string;
  let beachId: string;
  let hospitalId: string;
  let elenaId: string;

  beforeEach(async () => {
    testApp = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    database = testApp.database;
    const member = await insertSignedInMember({ database });
    cookie = member.cookie;

    beachId = await insertTag(database, { name: "beach" });
    hospitalId = await insertTag(database, { name: "hospital" });
    elenaId = await insertPerson(database, { displayName: "Elena" });

    // Two at the beach, one of which has Elena in it; one at the hospital.
    const firstBeachId = await insertItem(database, {
      uploadedBy: member.memberId,
      seq: 1,
    });
    const secondBeachId = await insertItem(database, {
      uploadedBy: member.memberId,
      seq: 2,
    });
    const hospitalItemId = await insertItem(database, {
      uploadedBy: member.memberId,
      seq: 3,
    });
    await insertItemTag(database, { itemId: firstBeachId, tagId: beachId });
    await insertItemTag(database, { itemId: secondBeachId, tagId: beachId });
    await insertItemTag(database, {
      itemId: hospitalItemId,
      tagId: hospitalId,
    });
    await insertItemPerson(database, {
      itemId: firstBeachId,
      personId: elenaId,
    });
  });

  it("counts what every chip is worth with nothing selected", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/filters/facets",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(filterFacetsResponseSchema.parse(response.json())).toEqual({
      tags: [
        {
          tag: { tagId: beachId, name: "beach" },
          isSelected: false,
          narrowedCount: 2,
          ownCount: null,
        },
        {
          tag: { tagId: hospitalId, name: "hospital" },
          isSelected: false,
          narrowedCount: 1,
          ownCount: null,
        },
      ],
      people: [
        {
          person: { personId: elenaId, displayName: "Elena" },
          isSelected: false,
          narrowedCount: 1,
          ownCount: null,
        },
      ],
      resultCount: 3,
    });
    await testApp.close();
  });

  it("narrows every other chip against the selection, in one pass", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: `/api/filters/facets?tags=${beachId}`,
      headers: { cookie },
    });

    const body = response.json();
    expect(body.resultCount).toBe(2);
    // The selected chip carries its own worth and no narrowed count.
    expect(body.tags[0]).toEqual({
      tag: { tagId: beachId, name: "beach" },
      isSelected: true,
      narrowedCount: null,
      ownCount: 2,
    });
    // Nothing at the beach is also at the hospital, and the chip stays.
    expect(body.tags[1]).toEqual({
      tag: { tagId: hospitalId, name: "hospital" },
      isSelected: false,
      narrowedCount: 0,
      ownCount: null,
    });
    expect(body.people[0].narrowedCount).toBe(1);
    await testApp.close();
  });

  it("holds the row's order against the selection", async () => {
    const unfiltered = await testApp.app.inject({
      method: "GET",
      url: "/api/filters/facets",
      headers: { cookie },
    });
    const narrowed = await testApp.app.inject({
      method: "GET",
      url: `/api/filters/facets?tags=${hospitalId}`,
      headers: { cookie },
    });

    const names = (body: { tags: { tag: { name: string } }[] }) => {
      return body.tags.map((facet) => {
        return facet.tag.name;
      });
    };
    expect(names(narrowed.json())).toEqual(names(unfiltered.json()));
    await testApp.close();
  });

  it("reaches zero without erroring, which is what `none` is", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: `/api/filters/facets?tags=${beachId}&tags=${hospitalId}`,
      headers: { cookie },
    });
    expect(response.json().resultCount).toBe(0);
    await testApp.close();
  });

  it("takes an unknown id as a selection that matches nothing", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/filters/facets?tags=0199c0a0-0000-7000-8000-00000000dead",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().resultCount).toBe(0);
    await testApp.close();
  });

  it("answers 401 with no session", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/filters/facets",
    });
    expect(response.statusCode).toBe(401);
    await testApp.close();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/filters.test.ts`
Expected: FAIL, 404 on every request.

- [ ] **Step 3: Write `readFacets.ts`**

```ts
import type {
  FilterFacetsResponse,
  PersonFacet,
  TagFacet,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { countSelectedItems } from "./countSelectedItems.ts";
import {
  hasAnyFilter,
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilter.ts";
import {
  readPersonCounts,
  readTagCounts,
  type VocabularyCount,
} from "./readVocabularyCounts.ts";

/** Which join table a narrowed count is grouped over. */
type NarrowedSource = {
  table: "item_tags" | "item_people";
  column: "tag_id" | "person_id";
};

/**
 * `|selection ∩ chip|` for every chip at once.
 *
 * The saving grace of Decision 13: grouping by the join column over the
 * already-selected item set yields every chip's narrowed count in **one pass**
 * rather than one query per chip, which is exactly the narrow semantics.
 */
async function _readNarrowedCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  source: Readonly<NarrowedSource>;
}): Promise<Map<string, number>> {
  const rows = await options.database
    .selectFrom(options.source.table)
    .innerJoin("items", "items.id", `${options.source.table}.item_id`)
    .select((eb) => {
      return [
        `${options.source.table}.${options.source.column} as id`,
        eb.fn.countAll<number>().as("itemCount"),
      ];
    })
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter,
      }),
    )
    .groupBy(`${options.source.table}.${options.source.column}`)
    .execute();

  return new Map(
    rows.map((row) => {
      return [String(row.id), Number(row.itemCount)];
    }),
  );
}

/** One chip's two counts, of which exactly one is ever non-null. */
function _makeCounts(options: {
  count: Readonly<VocabularyCount>;
  isSelected: boolean;
  narrowed: ReadonlyMap<string, number>;
}): { narrowedCount: number | null; ownCount: number | null } {
  return options.isSelected
    ? { narrowedCount: null, ownCount: options.count.itemCount }
    : {
        narrowedCount: options.narrowed.get(options.count.id) ?? 0,
        ownCount: null,
      };
}

/**
 * Every chip on the filter surface, with what pressing it would leave.
 *
 * Three things the shape enforces and the copy depends on:
 *
 * - **Counts narrow.** `narrowedCount` is what adding that chip to the current
 *   selection would leave, never what the chip is worth alone.
 * - **A zero-count chip stays on the row and goes quiet.** Dropping it would
 *   reshuffle a row under somebody's finger, and `0` is itself the answer to
 *   "is there anything from the beach with Abuela in it".
 * - **The row's order never changes with the selection.** Both arrays are
 *   ordered by the viewer's **unfiltered** count descending, then name, and
 *   that order is held across every recomputation.
 *
 * With nothing selected the narrowed counts are the unfiltered ones and no
 * grouped query runs. `resultCount` is still a live count even then, because
 * the unfiltered aggregate cannot answer it: an item carrying no tags appears
 * in no tag group, so the vocabulary's totals are not the archive's total.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The selection as it stands.
 */
export async function readFacets(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Promise<FilterFacetsResponse> {
  const [tagCounts, personCounts] = await Promise.all([
    readTagCounts({ database: options.database, viewer: options.viewer }),
    readPersonCounts({ database: options.database, viewer: options.viewer }),
  ]);

  const isSelectionEmpty = !hasAnyFilter(options.filter);
  const unfilteredMap = (counts: readonly VocabularyCount[]) => {
    return new Map(
      counts.map((count) => {
        return [count.id, count.itemCount];
      }),
    );
  };

  const [narrowedTags, narrowedPeople, resultCount] = await Promise.all([
    isSelectionEmpty
      ? Promise.resolve(unfilteredMap(tagCounts))
      : _readNarrowedCounts({
          database: options.database,
          viewer: options.viewer,
          filter: options.filter,
          source: { table: "item_tags", column: "tag_id" },
        }),
    isSelectionEmpty
      ? Promise.resolve(unfilteredMap(personCounts))
      : _readNarrowedCounts({
          database: options.database,
          viewer: options.viewer,
          filter: options.filter,
          source: { table: "item_people", column: "person_id" },
        }),
    countSelectedItems({
      database: options.database,
      viewer: options.viewer,
      filter: options.filter,
    }),
  ]);

  const tags: TagFacet[] = tagCounts.map((count) => {
    const isSelected = options.filter.tagIds.includes(count.id);
    return {
      tag: { tagId: count.id, name: count.name },
      isSelected,
      ..._makeCounts({ count, isSelected, narrowed: narrowedTags }),
    };
  });

  const people: PersonFacet[] = personCounts.map((count) => {
    const isSelected = options.filter.personIds.includes(count.id);
    return {
      person: { personId: count.id, displayName: count.name },
      isSelected,
      ..._makeCounts({ count, isSelected, narrowed: narrowedPeople }),
    };
  });

  return { tags, people, resultCount };
}
```

- [ ] **Step 4: Write the route**

Create `apps/server/src/routes/filters.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  filterFacetsRequestSchema,
  type FilterFacetsResponse,
} from "@memory-shoebox/shared";
import { readFacets } from "../archive/readFacets.ts";
import { makeTimelineFilterFromQuery } from "../archive/selectionFilter.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * The filter surface's chip counts: `tech-specs/apis/timeline.md`.
 *
 * Selections AND across and within dimensions: two tags means both tags, and a
 * tag plus a person plus a date range means all three. That is what makes the
 * `none` state reachable and what its copy is about.
 *
 * An unknown tag or person id is not an error here either: it narrows the
 * selection to nothing, exactly as a real id with no matches would.
 */
export async function filtersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/filters/facets",
    async (request: FastifyRequest): Promise<FilterFacetsResponse> => {
      const viewer = requireViewer(request);
      const query = filterFacetsRequestSchema.parse(request.query);

      return readFacets({
        database: request.server.database,
        viewer,
        filter: makeTimelineFilterFromQuery(query),
      });
    },
  );
}
```

- [ ] **Step 5: Register it**

In `apps/server/src/app.ts`:

```ts
import { filtersRoutes } from "./routes/filters.ts";
```

```ts
      await filtersRoutes(api);
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/filters.test.ts`
Expected: PASS, every case.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/archive/readFacets.ts apps/server/src/routes/filters.ts apps/server/src/app.ts apps/server/test/routes/filters.test.ts
git commit -m "feat(archive): chip counts that narrow, zeros that stay"
```

---

## Task 19: `GET /api/people`

The directory, and the one visibility hazard on it: **a preferred face served
without the check is a restricted photograph published as a directory
thumbnail.**

**Files:**

- Create: `apps/server/src/archive/readPeopleDirectory.ts`
- Create: `apps/server/src/routes/people.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/routes/people.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/people.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { peopleResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("GET /api/people", () => {
  it("counts per viewer and carries the whole directory's size", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const mateoId = await insertPerson(database, { displayName: "Mateo" });
    const elenaId = await insertPerson(database, { displayName: "Elena" });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_on: "2026-09-14",
    });
    const secondId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_on: "2026-09-11",
    });
    await insertRendition(database, { itemId, purpose: "thumb" });
    await insertItemPerson(database, { itemId, personId: mateoId });
    await insertItemPerson(database, { itemId: secondId, personId: mateoId });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = peopleResponseSchema.parse(response.json());
    expect(body.peopleCount).toBe(2);
    expect(body.nextCursor).toBeNull();
    expect(body.people[0]?.person).toEqual({
      personId: mateoId,
      displayName: "Mateo",
    });
    expect(body.people[0]?.itemCount).toBe(2);
    expect(body.people[0]?.firstCapturedOn).toBe("2026-09-11");
    expect(body.people[0]?.lastCapturedOn).toBe("2026-09-14");
    // Nobody has been tagged in anything, which is a state of its own.
    expect(body.people[1]).toEqual({
      person: { personId: elenaId, displayName: "Elena" },
      itemCount: 0,
      firstCapturedOn: null,
      lastCapturedOn: null,
      face: null,
    });
    await close();
  });

  it("carries a person with no item_people rows at all", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const personId = await insertPerson(database, { displayName: "Abuela" });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    expect(response.json().people).toEqual([
      {
        person: { personId, displayName: "Abuela" },
        itemCount: 0,
        firstCapturedOn: null,
        lastCapturedOn: null,
        face: null,
      },
    ]);
    await close();
  });

  it("reads 0 for a person whose every photograph is invisible, not 1", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const personId = await insertPerson(database, { displayName: "Papá" });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: hiddenRuleId,
    });
    await insertRendition(database, { itemId, purpose: "thumb" });
    await insertItemPerson(database, { itemId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    const [person] = response.json().people;
    expect(person.itemCount).toBe(0);
    expect(person.face).toBeNull();
    expect(response.body).not.toContain(itemId);
    await close();
  });

  it("falls back from a preferred face the viewer cannot see", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      captured_at: "2026-09-14T09:00:00.000Z",
      visibility_rule_id: hiddenRuleId,
    });
    const visibleId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_at: "2026-09-13T09:00:00.000Z",
    });
    await insertRendition(database, { itemId: hiddenId, purpose: "thumb" });
    await insertRendition(database, { itemId: visibleId, purpose: "thumb" });
    const personId = await insertPerson(database, {
      displayName: "Mateo",
      preferred_face_item_id: hiddenId,
    });
    await insertItemPerson(database, { itemId: hiddenId, personId });
    await insertItemPerson(database, { itemId: visibleId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    const [person] = response.json().people;
    expect(person.face.url).toContain(encodeURIComponent(`items/${visibleId}`));
    expect(response.body).not.toContain(hiddenId);
    await close();
  });

  it("uses the preferred face when the viewer can see it", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const preferredId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      captured_at: "2026-09-10T09:00:00.000Z",
    });
    const recentId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      captured_at: "2026-09-14T09:00:00.000Z",
    });
    await insertRendition(database, { itemId: preferredId, purpose: "thumb" });
    await insertRendition(database, { itemId: recentId, purpose: "thumb" });
    const personId = await insertPerson(database, {
      displayName: "Mateo",
      preferred_face_item_id: preferredId,
    });
    await insertItemPerson(database, { itemId: preferredId, personId });
    await insertItemPerson(database, { itemId: recentId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    expect(response.json().people[0].face.url).toContain(
      encodeURIComponent(`items/${preferredId}`),
    );
    await close();
  });

  it("narrows by name without changing the directory's size", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    await insertPerson(database, { displayName: "Sofía" });
    await insertPerson(database, { displayName: "Papá" });

    const response = await app.inject({
      method: "GET",
      url: "/api/people?q=sof",
      headers: { cookie },
    });
    expect(response.json().people).toHaveLength(1);
    expect(response.json().people[0].person.displayName).toBe("Sofía");
    expect(response.json().peopleCount).toBe(2);
    await close();
  });

  it("never carries a memberId, however the person is linked", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertPerson(database, {
      displayName: "Abuela Rosa",
      member_id: memberId,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/people",
      headers: { cookie },
    });
    expect(response.body).not.toContain(memberId);
    expect(Object.keys(response.json().people[0].person)).toEqual([
      "personId",
      "displayName",
    ]);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({ method: "GET", url: "/api/people" });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/people.test.ts`
Expected: FAIL, 404 on every request.

- [ ] **Step 3: Write `readPeopleDirectory.ts`**

```ts
import { expressionBuilder } from "kysely";
import type {
  DirectoryPerson,
  MediaSource,
  PeopleResponse,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client } from "../b2/client.ts";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";
import { makeNormalisedNameFromName } from "./makeNormalisedNameFromName.ts";
import { readMediaSources } from "./readMediaSources.ts";

/** One person, before their face has been resolved. */
type DirectoryRow = {
  personId: string;
  displayName: string;
  preferredFaceItemId: string | null;
  itemCount: number;
  firstCapturedOn: string | null;
  lastCapturedOn: string | null;
};

/**
 * Query 1: the directory, counted and dated per viewer.
 *
 * > **The single most likely bug in this slice.** The visibility predicate
 * > must sit in the **`ON` clause of the `items` join, not in the `WHERE`**.
 * > In the `WHERE` it filters away the null-extended rows, the left join
 * > collapses to an inner join, and **everybody with no visible items
 * > disappears**, including the person with none at all who is the entire
 * > point of surface 7's `zero` state. The bug is invisible in any fixture
 * > where every person has at least one visible photograph, which is every
 * > fixture anybody writes by hand.
 * >
 * > Its quieter twin: the count must be **`COUNT(i.id)`, never `COUNT(*)`**,
 * > or every person gets a floor of 1 and "Nothing yet" becomes "1 photo and
 * > video".
 */
async function _readDirectoryRows(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
}): Promise<DirectoryRow[]> {
  const rows = await options.database
    .selectFrom("people")
    .leftJoin("item_people", "item_people.person_id", "people.id")
    .leftJoin("items", (join) => {
      return join
        .onRef("items.id", "=", "item_people.item_id")
        .on(
          visibilityExpression({
            eb: expressionBuilder<Database, "items">(),
            viewer: options.viewer,
          }),
        );
    })
    .select((eb) => {
      return [
        "people.id as personId",
        "people.display_name as displayName",
        "people.preferred_face_item_id as preferredFaceItemId",
        eb.fn.count<number>("items.id").as("itemCount"),
        eb.fn
          .min("items.captured_on")
          .$castTo<string | null>()
          .as("firstCapturedOn"),
        eb.fn
          .max("items.captured_on")
          .$castTo<string | null>()
          .as("lastCapturedOn"),
      ];
    })
    .groupBy([
      "people.id",
      "people.display_name",
      "people.preferred_face_item_id",
    ])
    .execute();

  return rows.map((row) => {
    return { ...row, itemCount: Number(row.itemCount) };
  });
}

/**
 * Queries 2 and 3: one face id per person, or none.
 *
 * The preferred face **if that item is visible to this viewer**, otherwise the
 * most recent visible item tagged with that person, otherwise nothing and the
 * client draws the ghost frame it already has.
 *
 * The fallback is one grouped argmax over `item_people`, **not one query per
 * person**: SQLite answers a bare column beside a single `MAX()` from the row
 * that produced the maximum, which is the documented behaviour this relies on.
 */
async function _readFaceItemIds(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  rows: readonly DirectoryRow[];
}): Promise<Map<string, string>> {
  const predicate = visibilityExpression({
    eb: expressionBuilder<Database, "items">(),
    viewer: options.viewer,
  });

  const preferredIds = options.rows.flatMap((row) => {
    return row.preferredFaceItemId === null ? [] : [row.preferredFaceItemId];
  });
  const visiblePreferred =
    preferredIds.length === 0
      ? []
      : await options.database
          .selectFrom("items")
          .select("items.id as itemId")
          .where("items.id", "in", preferredIds)
          .where(predicate)
          .execute();
  const visiblePreferredIds = new Set(
    visiblePreferred.map((row) => {
      return row.itemId;
    }),
  );

  const stillNeedingFace = options.rows.filter((row) => {
    return (
      row.itemCount > 0 &&
      (row.preferredFaceItemId === null ||
        !visiblePreferredIds.has(row.preferredFaceItemId))
    );
  });

  const fallbacks =
    stillNeedingFace.length === 0
      ? []
      : await options.database
          .selectFrom("item_people")
          .innerJoin("items", "items.id", "item_people.item_id")
          .select((eb) => {
            return [
              "item_people.person_id as personId",
              eb.fn.max("items.captured_at").as("capturedAt"),
              "items.id as itemId",
            ];
          })
          .where(
            "item_people.person_id",
            "in",
            stillNeedingFace.map((row) => {
              return row.personId;
            }),
          )
          .where(predicate)
          .groupBy("item_people.person_id")
          .execute();

  return new Map([
    ...fallbacks.map((row): [string, string] => {
      return [row.personId, row.itemId];
    }),
    ...options.rows.flatMap((row): [string, string][] => {
      return row.preferredFaceItemId !== null &&
        visiblePreferredIds.has(row.preferredFaceItemId)
        ? [[row.personId, row.preferredFaceItemId]]
        : [];
    }),
  ]);
}

/**
 * The people directory, faces resolved per viewer.
 *
 * `peopleCount` is the whole directory's size before `q` narrows it, so
 * surface 7 can say "6 of 10 people" and nobody concludes somebody has been
 * removed. It is **not** per viewer, which is one of the contract's three
 * documented exceptions: a person's existence is not visibility-scoped, only
 * their photographs are.
 *
 * `q` is applied here rather than in SQL: the directory is tens of rows, so
 * the filter is free, it makes `peopleCount` free with it, and it gets "Sofía"
 * and "Papá" right, which SQLite's ASCII-only `LIKE` case folding would not.
 *
 * Ordered by `itemCount` descending then display name, so the people with
 * nothing sort to the end rather than being hidden.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, faked in tests.
 * @param options.viewer The request's viewer.
 * @param options.search The `q` parameter, already normalised.
 * @param options.now The request's own clock.
 */
export async function readPeopleDirectory(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  search: string | undefined;
  now: Date;
}): Promise<PeopleResponse> {
  const rows = await _readDirectoryRows({
    database: options.database,
    viewer: options.viewer,
  });

  const narrowed = rows
    .filter((row) => {
      return (
        options.search === undefined ||
        makeNormalisedNameFromName(row.displayName).includes(options.search)
      );
    })
    .sort((left, right) => {
      return left.itemCount === right.itemCount
        ? left.displayName.localeCompare(right.displayName)
        : right.itemCount - left.itemCount;
    });

  const faceItemIds = await _readFaceItemIds({
    database: options.database,
    viewer: options.viewer,
    rows: narrowed,
  });

  const mediaSources = await readMediaSources({
    database: options.database,
    b2: options.b2,
    itemIds: [...faceItemIds.values()],
    now: options.now,
    ttlSeconds: appConfig.media.signedUrlTtlSeconds,
  });

  return {
    people: narrowed.map((row): DirectoryPerson => {
      return {
        person: { personId: row.personId, displayName: row.displayName },
        itemCount: row.itemCount,
        firstCapturedOn: row.firstCapturedOn,
        lastCapturedOn: row.lastCapturedOn,
        face: _makeFaceFromSources({
          sources: mediaSources.get(faceItemIds.get(row.personId) ?? ""),
        }),
      };
    }),
    nextCursor: null,
    peopleCount: rows.length,
  };
}

/**
 * The card's thumbnail, and only that.
 *
 * One source rather than a `MediaRef`: the card draws a decorative image with
 * an empty alt and never opens it, so a display URL, video sources and
 * generated alt text would all be minted unread.
 */
function _makeFaceFromSources(options: {
  sources: ReadonlyMap<string, MediaSource> | undefined;
}): MediaSource | null {
  return (
    options.sources?.get("thumb") ??
    options.sources?.get("display") ??
    options.sources?.get("original") ??
    null
  );
}
```

- [ ] **Step 4: Write the route**

Create `apps/server/src/routes/people.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  peopleRequestSchema,
  type PeopleResponse,
} from "@memory-shoebox/shared";
import { makeNormalisedNameFromName } from "../archive/makeNormalisedNameFromName.ts";
import { readPeopleDirectory } from "../archive/readPeopleDirectory.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * The people directory: `tech-specs/apis/timeline.md`.
 *
 * **`memberId` is absent from every entry**, which is why `DirectoryPerson`
 * wraps the frozen `PersonRef` and adds nothing that could stand in for one.
 * Members and non-members are drawn identically: holding an account is a
 * permission fact and this is a family.
 */
export async function peopleRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/people",
    async (request: FastifyRequest): Promise<PeopleResponse> => {
      const viewer = requireViewer(request);
      const query = peopleRequestSchema.parse(request.query);

      return readPeopleDirectory({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        search:
          query.q === undefined
            ? undefined
            : makeNormalisedNameFromName(query.q),
        now: request.server.clock(),
      });
    },
  );
}
```

- [ ] **Step 5: Register it**

In `apps/server/src/app.ts`:

```ts
import { peopleRoutes } from "./routes/people.ts";
```

```ts
      await peopleRoutes(api);
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/people.test.ts`
Expected: PASS, every case.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/archive/readPeopleDirectory.ts apps/server/src/routes/people.ts apps/server/src/app.ts apps/server/test/routes/people.test.ts
git commit -m "feat(archive): the people directory, with a face that resolves per viewer"
```

---

## Task 20: `POST /api/items/seen`, the one-way latch

**This route takes item-derived ids and deliberately returns no 404.** An id
that does not exist and an id the viewer's predicate excludes are both silently
ignored. Per-id feedback of any kind, a 404, a partial-success body, even a
count of rows written, would turn a batch endpoint into a visibility oracle:
post one id, read the number back, learn whether a photograph exists that you
are not allowed to see.

**Files:**

- Create: `apps/server/src/archive/latchItemsSeen.ts`
- Create: `apps/server/src/routes/items.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/routes/itemsSeen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/routes/itemsSeen.test.ts`:

```ts
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertItem,
  insertMember,
  insertUploadSession,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

const readViewedItemIds = async (
  database: Kysely<Database>,
  memberId: string,
): Promise<string[]> => {
  const rows = await database
    .selectFrom("item_views")
    .select("item_id")
    .where("member_id", "=", memberId)
    .execute();
  return rows
    .map((row) => {
      return row.item_id;
    })
    .sort();
};

describe("POST /api/items/seen", () => {
  it("latches what the viewer can see and answers nothing at all", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId, seq: 1 });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [itemId] },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(await readViewedItemIds(database, memberId)).toEqual([itemId]);
    await close();
  });

  it("ignores an invisible id and a nonexistent one, identically", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: hiddenRuleId,
    });

    const hidden = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [hiddenId] },
    });
    const nonexistent = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: ["0199c0a0-0000-7000-8000-00000000dead"] },
    });

    expect(hidden.statusCode).toBe(204);
    expect(nonexistent.statusCode).toBe(204);
    expect(hidden.body).toBe(nonexistent.body);
    expect(await readViewedItemIds(database, memberId)).toEqual([]);
    await close();
  });

  it("is one-way: a second post writes nothing and moves nothing", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId, seq: 1 });

    await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [itemId] },
    });
    const first = await database
      .selectFrom("item_views")
      .select(["id", "first_seen_at"])
      .where("member_id", "=", memberId)
      .executeTakeFirstOrThrow();

    const second = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [itemId] },
    });

    expect(second.statusCode).toBe(204);
    const after = await database
      .selectFrom("item_views")
      .select(["id", "first_seen_at"])
      .where("member_id", "=", memberId)
      .execute();
    expect(after).toEqual([first]);
    await close();
  });

  it("expands a collapsed stack to its visible frames", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: otherMemberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const visibleFrameIds = await Promise.all(
      [1, 2].map((index) => {
        return insertItem(database, {
          uploadedBy: otherMemberId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
        });
      }),
    );
    await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 3,
      burst_id: burstId,
      burst_index: 3,
      visibility_rule_id: hiddenRuleId,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [], burstIds: [burstId] },
    });

    expect(response.statusCode).toBe(204);
    expect(await readViewedItemIds(database, memberId)).toEqual(
      [...visibleFrameIds].sort(),
    );
    await close();
  });

  it("writes nothing at all for an empty batch", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, { uploadedBy: memberId, seq: 1 });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [] },
    });

    expect(response.statusCode).toBe(204);
    expect(await readViewedItemIds(database, memberId)).toEqual([]);
    await close();
  });

  it("refuses more than five hundred ids, and an id that is not a uuid", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const tooMany = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: {
        itemIds: Array.from({ length: 501 }, () => {
          return "0199c0a0-0000-7000-8000-00000000dead";
        }),
      },
    });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().error).toBe("invalid_request");

    const notAUuid = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: ["7"] },
    });
    expect(notAUuid.statusCode).toBe(400);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      payload: { itemIds: [] },
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/itemsSeen.test.ts`
Expected: FAIL, 404 on every request.

- [ ] **Step 3: Write `latchItemsSeen.ts`**

```ts
import { expressionBuilder, sql } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";

/**
 * Marks what the viewer has had on screen, once and only once.
 *
 * One statement, `INSERT ... ON CONFLICT DO NOTHING`, **with the visibility
 * predicate inside the `SELECT` that feeds it**. That placement is the whole
 * design: the filtering happens inside the statement rather than in a
 * pre-check, so there is no branch anybody can later add a log line to and no
 * shape in which this route can report on the ids it was given.
 *
 * `first_seen_at` is set once and never updated, and there is no
 * `last_seen_at` by design: maintaining one would reintroduce a write on every
 * impression, which is the entire cost the collapse avoids. `first_opened_at`,
 * `last_opened_at` and `open_count` belong to the item viewer and are not
 * touched here.
 *
 * Scrolling a 212-item day therefore writes 212 rows the first time and
 * nothing ever again, which matters because SQLite has a single writer and
 * that writer is also taking uploads.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.itemIds Items the viewer has had on screen.
 * @param options.burstIds Stacks, expanded to their visible frames here.
 * @param options.now The instant written as `first_seen_at`.
 */
export async function latchItemsSeen(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemIds: readonly string[];
  burstIds: readonly string[];
  now: string;
}): Promise<void> {
  if (options.itemIds.length === 0 && options.burstIds.length === 0) {
    return;
  }

  await options.database
    .insertInto("item_views")
    .columns(["id", "member_id", "item_id", "first_seen_at"])
    .expression((eb) => {
      return eb
        .selectFrom("items")
        .select([
          // `create_id()` is `createId()` itself, registered on the
          // connection, so one statement mints a uuid per row rather than the
          // application minting hundreds and sending them.
          sql<string>`create_id()`.as("id"),
          eb.val(options.viewer.memberId).as("member_id"),
          "items.id as item_id",
          eb.val(options.now).as("first_seen_at"),
        ])
        .where((inner) => {
          return inner.or([
            ...(options.itemIds.length === 0
              ? []
              : [inner("items.id", "in", [...options.itemIds])]),
            ...(options.burstIds.length === 0
              ? []
              : [inner("items.burst_id", "in", [...options.burstIds])]),
          ]);
        })
        .where(
          visibilityExpression({
            eb: expressionBuilder<Database, "items">(),
            viewer: options.viewer,
          }),
        );
    })
    .onConflict((onConflict) => {
      return onConflict.columns(["member_id", "item_id"]).doNothing();
    })
    .execute();
}
```

- [ ] **Step 4: Write the route**

Create `apps/server/src/routes/items.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { itemsSeenRequestSchema } from "@memory-shoebox/shared";
import { latchItemsSeen } from "../archive/latchItemsSeen.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * One item and the latch that clears its accent dot:
 * `tech-specs/apis/timeline.md`.
 *
 * Only the latch lives here today. The rest of the item slice, which is
 * `GET /api/items/:itemId` and everything hanging off one photograph, belongs
 * to a later step and lands in this module.
 *
 * **`204`, no body, and no per-id feedback of any kind.** There is genuinely
 * nothing to return, and a shape that reported anything would be a visibility
 * oracle: post one id, read the number back, learn whether a photograph exists
 * that you are not allowed to see.
 */
export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/items/seen",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const viewer = requireViewer(request);
      const body = itemsSeenRequestSchema.parse(request.body);

      await latchItemsSeen({
        database: request.server.database,
        viewer,
        itemIds: body.itemIds,
        burstIds: body.burstIds,
        now: request.server.clock().toISOString(),
      });

      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 5: Register it**

In `apps/server/src/app.ts`:

```ts
import { itemsRoutes } from "./routes/items.ts";
```

```ts
      await itemsRoutes(api);
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/itemsSeen.test.ts`
Expected: PASS, every case.

- [ ] **Step 7: Prove the latch and the timeline agree**

Add one case to `apps/server/test/routes/timelineContract.test.ts`:

```ts
describe("the latch and the day", () => {
  it("clears the accent dots the timeline reported", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertDrawableItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });

    const before = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(before.json().days[0].unseenCount).toBe(1);
    expect(before.json().days[0].items[0].isUnseen).toBe(true);

    await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [itemId] },
    });

    const after = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(after.json().days[0].unseenCount).toBe(0);
    expect(after.json().days[0].items[0].isUnseen).toBe(false);
    expect(after.json().days[0].itemCount).toBe(1);
    await close();
  });
});
```

Run: `pnpm --filter @memory-shoebox/server test -- apps/server/test/routes/timelineContract.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/archive/latchItemsSeen.ts apps/server/src/routes/items.ts apps/server/src/app.ts apps/server/test/routes
git commit -m "feat(archive): the one-way seen latch, which reports nothing"
```

---

## Task 21: The documentation, and the whole gate

`AGENTS.md`: "Treat updating the docs as part of the definition of done, not an
afterthought."

**Files:**

- Create: `docs/archive.md`
- Modify: `docs/server.md`
- Modify: `docs/architecture.md`
- Modify: `docs/configuration.md`

- [ ] **Step 1: Write `docs/archive.md`**

Create it with these sections, written at the level `AGENTS.md` asks for, which
is what the pieces are and why the key decisions went the way they did, never
restating the code:

1. **What the read path is**: six routes, one selection expression, and the
   rule that no count visibility can filter may ever be stored.
2. **The day stream**: days are derived (`GROUP BY captured_on`, no `days`
   table), the union with milestone spans, and Ruling 1 on what a filter does
   to it. Include the table of which filter keeps the union.
3. **The cursor**: what `{d, o, f}` encodes, why the opened set travels, and
   why a digest mismatch is a `400`.
4. **Bursts at read time**: the zero, one and two-or-more rules, the cover
   fallback, and why the count and the span are computed over visible frames.
5. **The `ON` clause, in the three places it decides the answer**: the
   `item_views` anti-join, the people directory, and the two vocabularies.
   Name `COUNT(i.id)` beside it.
6. **What is deliberately not here**: the caches (step 6a gives them something
   to invalidate on), the rollups keyed by `(dimension, visibility_rule_id)`
   (`data-models.md` says do not build them yet), and a re-signing route
   (Ruling 3: the client refetches the page in place).
7. **The query plan**, as the table in the design document, with the note that
   the invariant is constancy in page size rather than any one number.

- [ ] **Step 2: Update `docs/server.md`**

- Add `archive/` to the layout block, with the one-line description "the day
  stream, the vocabularies, the directory and the seen latch".
- Add the five new modules to the routes table:

```markdown
| `timeline.ts`       | `GET /api/timeline` and `GET /api/timeline/rail`     |
| `filters.ts`        | `GET /api/filters/facets`                            |
| `tags.ts`           | `GET /api/tags`                                      |
| `people.ts`         | `GET /api/people`                                    |
| `items.ts`          | `POST /api/items/seen`; the rest of the item slice   |
|                     | is a later step                                      |
```

- Correct the sentence "Nine of the contract's 78 routes are built and the
  other sixty-nine are specified and unbuilt": it is now fifteen and
  sixty-three.
- Add a line under Routes pointing at `docs/archive.md` for the read path.

- [ ] **Step 3: Update `docs/architecture.md`**

In § What is not built yet, remove the read slice and leave the rest as it
stands.

- [ ] **Step 4: Update `docs/configuration.md`**

Add the two new `app.config.ts` knobs to whatever list that file keeps of them,
with one line each: the page item budget and the signed URL lifetime. If the
file documents only environment variables, add nothing and say so in the
commit message rather than inventing a section.

- [ ] **Step 5: Run the whole gate**

Run: `pnpm check`
Expected: format, lint, type-check, build and every test green, across all
packages.

If `oxfmt` rewrites files, commit the rewrite. If `oxlint` reports a file over
400 lines or a function over 45, split it rather than silencing the rule.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: the archive read path, and where its rules live"
```

- [ ] **Step 7: Hand back for review**

Do not mark step 4a `done` here. The step file's status moves to `done` when
the branch merges, which is the reviewer's step, not this one.

---

## Self-review, done while writing

**Spec coverage.** Every decision in the design document has a task: 1 in Task
5, 2 in Task 9, 3 in Task 11, 4 in Tasks 16 and 17 (the uncached functions and
the comments saying so), 5 and 7 in Task 8, 6 in Task 6, 8 and 9 in Task 9, 10
and 12 in Task 15, 11 in Task 16, 13 and 14 in Tasks 5 and 15, 15 in Task 12,
16 in Task 10, 17 in Tasks 1 and 10, 18 in Task 19, 19 in Task 18, 20 in Tasks
3 and 16.

**Every route:** `GET /api/timeline` (Task 14), `GET /api/timeline/rail` (16),
`GET /api/filters/facets` (18), `GET /api/tags` (17), `GET /api/people` (19),
`POST /api/items/seen` (20).

**Every verification bullet in `step-4a.md`:** `pnpm check` (Task 21);
byte-identical empty and invisible archives (15); a count and its rows moving
together (15); 212 reading as 204 (15); the date filter keeping a
milestone-only day and the tag filter dropping it (15); an unknown id narrowing
rather than erroring (15); paging returning every day exactly once (15); the
query plan constant in page size (15).

**Type consistency.** `TimelineFilter` (Task 5) is the parameter of every
reader. `CandidateDay` is defined in `readItemDays.ts` (Task 8) and imported by
`mergeDays.ts` and `readDayStream.ts`. `ItemRow` is defined in
`readItemsForDays.ts` (Task 9) and imported by `collapseBursts.ts` and
`readTimelinePage.ts`. `DrawnEntry` and `DrawnBurst` come from
`collapseBursts.ts`. `VocabularyCount` comes from `readVocabularyCounts.ts`
(Task 17) and is used by `readFacets.ts` (Task 18). `makeSelectionExpressionFromFilter`
takes `{ viewer, filter }` and builds its own expression builder, everywhere.
`readMediaSources` returns `Map<itemId, Map<purpose, MediaSource>>` and is
called by both `readTimelinePage` and `readPeopleDirectory` with the same
argument names.
