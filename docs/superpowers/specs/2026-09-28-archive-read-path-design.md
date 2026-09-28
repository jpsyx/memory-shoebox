# Step 4a: the archive read path

The whole read side of the pile: the day stream with its milestone bands and
its per-viewer counts, the jump rail, filtering and search, the tag and people
directories, and the one-way latch that clears the accent dots. Six routes,
and the hardest query in the product.

This is the step design for
[`plan/step-4a.md`](../../prds/2026-09-27-memory-shoebox/plan/step-4a.md). The
product spec it reads is `docs/PRODUCT.md` and the design spec; the route
contract it implements is
[`tech-specs/apis/timeline.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md),
binding, with
[`conventions.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md)
above it. Nothing here restates those documents. What it records is the
decisions they leave open, the ones they answer in two places that disagree,
and the shape the code takes.

## What this delivers

| Route                     | What it is                                                             |
| ------------------------- | ---------------------------------------------------------------------- |
| `GET /api/timeline`       | A page of days with their items, milestone bands, strips and counts    |
| `GET /api/timeline/rail`  | Every visible day with its count, unpaginated                          |
| `GET /api/filters/facets` | Tag and person chip counts for a selection, narrowing                  |
| `GET /api/tags`           | The tag vocabulary with per-viewer counts                              |
| `GET /api/people`         | The people directory, with a face that resolves per viewer             |
| `POST /api/items/seen`    | The one-way latch, which reports nothing about the ids it was given    |

Plus the contract those six need in `packages/shared`, and the two additions
`timeline.md` § Additions requested asks of the frozen DTOs.

## What already exists, and what it settles

- **The visibility predicate** is step 3a's `visibilityExpression` and
  `applyVisibilityFilter` (`apps/server/src/visibility/`). It is the one
  sanctioned reader of `Viewer.visibleRuleIds`, it parenthesises the `or` as a
  unit, and it hands an admin `true` rather than an absent clause so it can sit
  in an `ON`. Nothing in this step rewrites that expression.
- **The request context** is `Viewer` on `request.viewer`, with `requireViewer`
  for the 401. Every route here is `session` and `viewer`.
- **Rate limiting** is applied by the middleware. An authenticated route naming
  no rule gets `authenticatedDefault`, which is the contract's 600 per minute
  per session, so none of these six names a rule.
- **Errors**: a thrown `ZodError` already becomes `400 invalid_request` with
  `details.fieldErrors` through `registerErrorHandler`. Routes parse with a
  schema and throw; they do not assemble error bodies.
- **The member display name** falls back to the email local part through
  `getDisplayNameFromMember` (Decision 1). Every `MemberRef` in this slice goes
  through it.
- **Signed URLs** come from `B2Client.presignGet`, which is in-process HMAC and
  touches no network. Tests get `createFakeB2Client`.
- **Local days** come from `getLocalDayFromInstant` with `shoebox.timezone`.
  The only place this slice needs it is the date inside composed alt text.

## Decisions

### 1. One selection expression, built once, shared by every count and every row

`makeSelectionExpressionFromFilter` composes step 3a's `visibilityExpression`
with the date range, one `EXISTS` per selected tag, one per selected person,
and the milestone attachment, and returns a single Kysely expression. The day
aggregate, the item page, `resultCount`, the rail, the facet counts and the
seen latch all take that same object.

This is the rule that outranks the others made structural: a count and the
rows it heads cannot disagree when they are the same expression, and they
start to the moment somebody retypes the clause. `EXISTS` rather than repeated
joins, because a repeated join fans out and turns a count into a multiple of
itself (`timeline.md` § Performance).

`item_people` appears only as a filter the caller asked for, never as part of
visibility. Being in a photograph is not a key to it (Decision 7).

### 2. Within a day, items come back oldest first

`ORDER BY captured_at ASC, seq ASC`. The feed runs newest day first and each
day runs forwards inside itself, so a day reads the way it happened: the
morning, then the park, then the bath.

Nothing in `timeline.md`, the design spec, `DESIGN.md` or the fixtures settled
this, and it had to be settled here rather than in the browser: DESIGN.md
§ Do's seeds the messy pile's tilt, offset and z-order from the item's index,
so the order the server sends is the order the wall is built from. A client
that re-sorted would reshuffle the wall.

`seq` is the tiebreak because two frames of a burst can share a millisecond,
and a total order is what stops the wall moving between requests.

### 3. Alt text is composed on the timeline, at the cost of one more batched query

`items.md` says `MediaRef.altText` "is never null and is composed
server-side", and that the rule "applies wherever a `MediaRef` or a
`BurstFrameRef` is minted". `timeline.md` § Performance lists six to eight
queries and none of them reads `item_people`. The two cannot both hold, and
the one that gives is the query count: a screen reader in the pile gets
"Mateo, Papá and Mamá, 14 September 2026" like everywhere else.

So there is one more batched query, `item_people WHERE item_id IN
(:drawnItemIds)`, keyed by the ids actually drawn, which is a collapsed
burst's cover rather than its forty-five frames. It is constant in the size of
the page, which is the property § Performance is really asserting.

Composition follows `items.md` § `GET /api/items/:itemId` transformation 2
exactly: a non-blank `items.alt_text` override wins outright; otherwise the
people in `tagged_at ASC, display_name ASC` order joined with commas and a
final "and", then the capture date; with no people, the date alone. The date
renders in `shoebox.timezone` and `en-GB` (`items.md` Ruling 4). **No
visibility predicate goes on that people join**: a `MediaRef` is only ever
minted for an item the viewer may see, and filtering there would put
`item_people` in a visibility expression.

### 4. No caches in this step

`timeline.md` calls the unfiltered rail "the first thing to cache" per
`(memberId, visibilityGeneration)` plus an item-generation counter, and asks
the same of the tag aggregate. Nothing writes an item until step 6a, so there
is nothing to bump that counter yet, and a cache with no invalidation channel
is a rail that goes stale on the first upload and stays stale.

What this step does instead is put each cacheable query behind one function
(`readRailDays`, `readTagCounts`, `readPersonCounts`), so the cache is a
wrapper in one place when the write path that invalidates it exists.

### 5. The milestone-span union, and the window that bounds it

The day stream is the union of the distinct `captured_on` of visible items and
every date inside every overlapping milestone span, expanded in the
application (`data-models.md` § `items`).

**The union applies only when no content filter is set** (`timeline.md`
Ruling 1). A date range alone is a window on the same timeline, so
milestone-only days survive it, clipped to `[from, until]`, and surface 2's
`milestone-empty` state keeps working under a date window. A tag, a person or
`attachedToMilestoneId` is a content predicate, and a day with zero matching
items is not a result.

The milestone query is bounded rather than unbounded, and the bound is
provable. Fetch item days with `LIMIT limit + 1`; if that returns a
`(limit + 1)`-th day, no date below it can reach this page, because every such
date already has at least `limit + 1` item days above it in the merged
descending order. So milestones overlapping
`[day(limit + 1), cursorDay]` are all that can matter. With fewer than
`limit + 1` item days there is no lower bound and every milestone at or below
the cursor is fetched, which is tens of rows.

### 6. The cursor carries the band state, and a digest of the filter

Base64url over `{ "d": <last day returned>, "o": [<milestone ids that took a
band>], "f": <filter digest> }`.

`o` is the opened set, pruned to milestones whose `starts_on` is strictly
before `d`, which keeps it at zero to two entries. What counts as opened is
what **took a band**, never merely what appeared, so an occasion that has only
ever been a continuation strip still gets its full band on the next day it
wins one.

`f` is a SHA-256 of the normalised filter, truncated, and a mismatch is a
`400` rather than a page ranked against a different feed. Normalising means:
tag and person ids sorted and deduplicated, dates as given or absent, the
milestone attachment and its `exclude` flag, and nothing else. `limit` is
deliberately **not** in the digest: changing the page size mid-scroll is not a
different feed.

The cursor is not signed. It encodes nothing the caller does not already know
and grants nothing: every query it feeds still carries the viewer's own
predicate.

### 7. A day is atomic, and the guard is a soft budget

`limit` counts days, default 10, capped at 30, and a day never splits across
pages, so the next page is `captured_on < :d` strictly. The pile has no in-day
pagination affordance and inventing one here would be a design change made in
an API document.

The guard against a very fat day is a soft budget: stop adding days once the
running visible-item total passes 400, but always return at least one day,
however large. `nextCursor` is non-null whenever the budget or the limit cut
the page short, so nothing is lost, it is only deferred.

### 8. Bursts resolve at read time, and a stack takes its first frame's place

Frames are ordinary items and arrive already visibility-filtered. The `bursts`
row is read for one column, `cover_item_id`, and never to decide what to draw.

| Visible frames | What the day gets                                                               |
| -------------- | -------------------------------------------------------------------------------- |
| 0              | Nothing. No entry, no count, and no code: it is what frames being items buys     |
| 1              | One plain print, `burst: null`. Never a `BurstSummary` with `visibleFrameCount: 1` |
| 2 or more      | One entry whose `burst` is a `BurstSummary` over the visible frames alone        |

The cover is `bursts.cover_item_id` when that frame is visible, otherwise the
earliest visible frame. `visibleFrameCount`, `startsAt` and `endsAt` are
computed over the visible frames only: the stored span would leak the
restricted frames through the endpoints of "06:41 to 06:44" exactly as a
stored count would leak them through a denominator.

The collapsed entry sits at the position of its **earliest visible frame**,
which is the only position consistent with decision 2: a burst is a contiguous
run, so the stack stands where the run started.

### 9. `hasUnseenFrames` costs no query, and is why steady-state browsing is silent

The addition `timeline.md` requests is computed from the anti-join the item
query already runs, aggregated per burst in process.

Without it the collapsed stack is the one place the client cannot tell whether
`POST /api/items/seen` would do anything, so it would either send on every page
view, which breaks "steady-state browsing costs zero writes" on a database with
one writer that is also taking uploads, or never send, which leaves
forty-four frames permanently new.

### 10. The empty archive is a contract, and the test has to hold milestones equal

With no visible days the body is exactly
`{ "days": [], "nextCursor": null, "resultCount": null }`, and a brand-new
archive and a viewer restricted from everything produce byte-identical bodies.
No `hiddenCount`, no `archiveIsEmpty`, no `firstCapturedOn`, no diagnostic.

One thing the assertion needs stated, because a test written carelessly proves
the wrong thing: **milestones have no visibility of their own** (Decision 5),
so an archive holding a milestone shows that milestone-only day to everybody,
including a viewer who can see no items. The byte-identity pair therefore
compares two archives with the same milestones, which for the simple case is
none. That is not a weakening of the contract; it is the contract, which is
about items the viewer cannot see rather than about occasions everybody can.

### 11. The first-sign-in line reads the rail, not the timeline

`timeline.md` says the one-time line after a first sign-in "reads its number
from here" and that "the client takes it from this response's total". There is
no total on `TimelineResponse`: `resultCount` is null on an unfiltered request
by design, and transformation 10 says the `end` state's figures are summed in
the browser from `GET /api/timeline/rail`.

So the number is the rail's summed `itemCount`, which is viewer-filtered,
never a seed, and costs the client nothing it was not already fetching. Adding
a total to the timeline would be the second place the two empty states could
drift apart, which is what transformation 10 refuses.

### 12. The `ON` clause, in the three places it decides the answer

The single most likely bug in this slice, and it is silent in every fixture
where everybody has at least one visible photograph.

| Query               | What must sit in the `ON`                       | What the `WHERE` would do                            |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| The day aggregate   | `item_views.member_id = :me`                    | Turn the anti-join inner: every seen item disappears |
| The people directory | The visibility predicate on the `items` join   | Collapse the left join: everybody with nothing goes  |
| The tag vocabulary  | The visibility predicate on the `items` join    | Drop every tag whose items are all restricted        |

The quieter twin travels with it: the count is `COUNT(i.id)`, never
`COUNT(*)`, or the null-extended row gives every row a floor of 1 and
"Nothing yet" becomes "1 photo and video".

### 13. `resultCount` counts items, and what counts as a filter

`resultCount` is the number of **items** the whole selection is worth, burst
frames included, which is what the filter strip prints. It is null when no
filter is set and null on any request carrying a cursor, because the strip is
drawn once from the first page.

A request is filtered when any of `tags`, `people`, `from`, `until` or
`attachedToMilestoneId` is present. `excludeAttached` without
`attachedToMilestoneId` is meaningless and is ignored rather than rejected:
the contract calls it "only meaningful beside" the other, and a `400` there
would break a bookmark for no benefit.

### 14. An unknown id narrows to nothing, and never errors

An unknown `tagId`, `personId` or `attachedToMilestoneId` returns an empty
result exactly as a real id with no matches would. Erroring would make the
route an existence oracle for a vocabulary, and would break a bookmarked
filter the moment somebody merged a tag.

This is why no route in the slice takes an id it could 404 on, and why
`POST /api/items/seen` reports nothing at all: an id that does not exist and
an id the predicate excludes are both silently ignored, the filtering happens
inside the statement rather than in a pre-check, and there is no branch
anybody can later add a log line to.

### 15. `VisibilitySummary.label` is a group's name, and only in `only` mode

`conventions.md` says the label is "composed from the rule's subjects at read
time, never stored", and gives one example, "Just us two", which the fixtures
show is a **group name** (`prototypes/src/data/fixtures.ts`, `grp-just-us`).
`apps/web`'s `visibilityLabel` already assembles "Only Papá, Mamá" from the
subjects when `label` is null, and prefers the label when it is not.

So: `label` is the group's name when the rule is `only` with exactly one group
subject and no member subjects, and null in every other case, including
`everyone`. `except` mode gets null too, because a bare "Just us two" on a rule
that means everyone **except** those two says the opposite of what it means.
The client's fallback then prints "Everyone except Cousins", which is correct
and is already built.

### 16. A `MediaRef` needs renditions, and an item with none is counted but not drawn

`thumb` and `display` are non-nullable on `MediaRef`, and ingest (step 6a)
writes both. This step still has to say what happens when they are missing,
because a page that throws on one malformed row is a page nobody can read.

The fallback chain is `display` then `original` for the display source, and
`thumb` then `display` then `original` for the thumbnail. An item with no
renditions at all cannot be drawn: it is **left out of `items` and left in
`itemCount`**, and the server logs it once. That is the same shape as a burst
frame, which is counted and not drawn, so no count disagrees with itself, and
the alternative, dropping it from the count too, would make a data defect look
like a visibility rule.

`video.webm`, `video.mp4` and `poster` map from the `video_webm`, `video_mp4`
and `poster` purposes and stay null when absent. `durationMs` comes from
`items.duration_ms`.

### 17. Signed URLs live one hour, and the numbers live where they can be shared

One hour (`timeline.md` Ruling 3): comfortably longer than an uninterrupted
scroll, short enough that the bearer-link trade stays small. When
`expiresAt` passes, the client refetches the page in place and merges by id;
there is no re-signing route, deliberately.

| Number                            | Home                        | Why there                                                        |
| --------------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `limit` default 10, cap 30        | `packages/shared` `LIMITS`  | The schema validates it, so both halves need it                  |
| 500 ids on the seen latch         | `packages/shared` `LIMITS`  | Same                                                             |
| The 400-item page budget          | `app.config.ts`             | Product tuning, server-only, and that file exists for exactly it |
| The 3600-second URL lifetime      | `app.config.ts`             | Same, with Ruling 3's reasoning beside it                        |

One consequence worth recording rather than fixing here: `presignGet` sets
`ResponseCacheControl` to seven days while this slice signs for one hour, and
a fresh signature is a fresh URL, so a browser that refetches a page after an
hour refetches the bytes. The fix, if it is ever worth one, is signing from a
rounded instant so the URL is stable within its window. It is not this step's
scope and it is not a correctness problem.

### 18. `peopleCount` is not per viewer, and the face is the hazard that is

`peopleCount` counts `people` rows before `q` narrows them, so surface 7 can
say "6 of 10 people" and nobody concludes somebody has been removed. It is one
of `conventions.md`'s three documented exceptions: a person's existence is not
visibility-scoped, only their photographs are.

The face is the part that is. It resolves to `preferred_face_item_id` **if
that item is visible to this viewer**, otherwise the most recent visible item
tagged with that person, otherwise null and the client draws the ghost frame
it already has. A preferred face served without the check is a restricted
photograph published as a directory thumbnail.

`q` is applied in the application over the fetched rows, not in SQL: the
directory is tens of rows, so the filter is free, it makes `peopleCount` free
with it, and it gets "Sofía" and "Papá" right, which SQLite's ASCII-only
`LIKE` case folding would not. Matching is case-insensitive over NFC and
accent-sensitive, so "sofia" does not match "Sofía"; that is the documented
reason for moving it into the application and not an invitation to go further.

### 19. Facets narrow, zeros stay, and exactly one count is non-null per chip

`narrowedCount` is what adding that chip to the current selection would leave,
never what the chip is worth alone (Decision 13), so `beach 0` is visible
before anybody presses it. Every chip is returned every time, zeros included,
because a row that reshuffles under a finger is worse and `0` is itself the
answer.

`narrowedCount` is null exactly when `isSelected`, and `ownCount` is non-null
exactly when `isSelected`. Exactly one of the two is non-null on every chip,
which is what stops a client rendering the wrong number.

The row order is the viewer's **unfiltered** count descending, then display
name, held across every recomputation, and it comes from the same aggregate
that serves `GET /api/tags` and `GET /api/people`. Every chip's narrowed count
comes out of one `GROUP BY` over the already-selected item set, never one
query per chip.

### 20. The rail rejects `limit` and `cursor` rather than ignoring them

The rail's whole job is to be complete. A paginated rail cannot be jumped
through, and silently accepting the parameters would let somebody build one by
accident. Both are a `400` naming the parameter in `details.fieldErrors`.
Unknown parameters are still ignored, as everywhere else: the contract rejects
these two by name, not everything it does not recognise.

## The day stream, as one algorithm

```
1  filter    ← normalise(query)                       // ids sorted, deduped
2  page      ← decode(cursor); 400 if digest(filter) ≠ page.f
3  itemDays  ← group by captured_on, count, unseen anti-join,
                 where selection and captured_on < page.d,
                 order desc, limit n+1
4  window    ← [itemDays[n]?.capturedOn ?? -∞, page.d]
5  spanDays  ← expand(milestones overlapping window)  // only when no content filter
               clipped to [from, until]
6  days      ← merge(itemDays, spanDays) desc, cut at n days or 400 items,
                 always ≥ 1 day
7  items     ← where captured_on in days and selection,
                 order captured_at asc, seq asc
8  entries   ← collapse bursts(items)                 // in process
9  batches   ← covers, renditions, rule subjects, people, band counts,
                 members, resultCount
10 bands     ← rank(milestones, day, opened) per day  // ported exactly
11 cursor    ← { d: last day, o: opened ∪ banded, pruned, f }
```

Step 10 is a port of `prototypes/src/data/milestones.ts`
`rankMilestonesForDay`, including its `alreadyOpened` argument and its tie
break: of the milestones covering a day, the band is the one with the
narrowest span that has not already taken a band further up **this feed**, and
ties break by earliest start. Everything else covering the day is a
continuation strip with its own `dayPosition` and `dayCount`. The feed runs
newest first, so a multi-day occasion opens its band on its **last** date and
the strips descend with it. The client draws what it is given and re-derives
none of it.

## The queries, and what is constant

The property to hold is not a number, it is that **none of the queries is per
item, per day or per burst**. For a page that draws items:

| #   | Query                                                       | When                          |
| --- | ----------------------------------------------------------- | ----------------------------- |
| 1   | Candidate days, with counts and the unseen anti-join        | always                        |
| 2   | Milestones overlapping the window                           | always                        |
| 3   | Items for the chosen days                                   | when the page has a day       |
| 4   | `bursts.cover_item_id` for the burst ids on the page        | when the page has a burst     |
| 5   | `item_renditions WHERE item_id IN (:drawnItemIds)`          | when the page draws an item   |
| 6   | Rule subjects for the distinct `visibility_rule_id` values  | when the page draws an item   |
| 7   | `item_people` for the drawn ids, for alt text               | when the page draws an item   |
| 8   | The member map, for uploader `MemberRef`s                   | when the page draws an item   |
| 9   | `shoebox.timezone`, for the date inside alt text            | when the page draws an item   |
| 10  | Per-viewer `itemCount` for milestones taking a **band**     | when the page has a band      |
| 11  | `resultCount`                                               | filtered, uncursored only     |

Queries 5 to 9 are keyed by the ids actually drawn, so a collapsed
forty-five-frame burst costs one item's renditions and one item's people
rather than forty-five. Query 6 left-joins `members` and `groups` for the
subject display names, so composing a `VisibilitySummary` needs nothing
further. Signing is in-process HMAC over distinct storage keys.

The other five routes: the rail is 2, the facets route is 2 with nothing
selected and 5 with a selection, `/api/tags` is 1, `/api/people` is 4, and the
seen latch is 1 statement.

## Module layout

```
packages/shared/src/
  timeline.ts          the six routes' schemas and this slice's shared types
  dtos.ts              + BurstSummary.hasUnseenFrames, + the span doc comment
  limits.ts            + timelineDefaultDays, timelineMaxDays, seenMaxIds

apps/server/src/archive/
  selectionFilter.ts       normalise the query, makeSelectionExpressionFromFilter
  timelineCursor.ts        encode, decode, the filter digest
  readDayStream.ts         queries 1 and 2, the merge, the budget, the cut
  milestoneBands.ts        span expansion, rankMilestonesForDay, day positions
  collapseBursts.ts        rows → drawn entries, covers, spans, hasUnseenFrames
  makeMediaRefFromRenditions.ts  renditions → MediaRef, signed, with fallbacks
  readAltTexts.ts          query 7, the composition rule, the en-GB date
  readVisibilitySummaries.ts  query 6, subjects and the group-name label
  readMemberRefs.ts        query 8, the per-request member map
  readTimelinePage.ts      the orchestration above, and nothing else
  readRailDays.ts          the rail
  readTagCounts.ts         the unfiltered tag aggregate, shared by two routes
  readPersonCounts.ts      the unfiltered person aggregate, shared by two
  readFacets.ts            narrowed counts and resultCount
  readPeopleDirectory.ts   the four queries, including the face fallback
  latchItemsSeen.ts        the one statement

apps/server/src/routes/
  timeline.ts   GET /timeline, GET /timeline/rail
  filters.ts    GET /filters/facets
  tags.ts       GET /tags
  people.ts     GET /people
  items.ts      POST /items/seen        (step 5a fills the rest of this in)
```

Each file has one job and a test beside it. `readTimelinePage.ts` orchestrates
and queries nothing itself, which is what keeps it readable at the size the
day stream reaches.

## Contract additions

Both are the ones `timeline.md` § Additions requested asks for, and nothing
else is widened:

1. **`BurstSummary.hasUnseenFrames: boolean`**, whether any visible frame of
   this burst has no `item_views` row for this viewer.
2. **A doc-comment clarification on `BurstSummary.startsAt` / `endsAt`**, no
   shape change: they are `MIN`/`MAX` of `captured_at` over the **visible**
   frames, not `bursts.starts_at` / `ends_at`.

New in `packages/shared/src/timeline.ts`: `timelineRequestSchema`,
`timelineResponseSchema`, `timelineDaySchema`, `dayMilestoneBandSchema`,
`dayMilestoneStripSchema`, `timelineRailRequestSchema`,
`timelineRailResponseSchema`, `railDaySchema`, `filterFacetsRequestSchema`,
`filterFacetsResponseSchema`, `tagFacetSchema`, `personFacetSchema`,
`tagsRequestSchema`, `tagsResponseSchema`, `tagCountSchema`,
`peopleRequestSchema`, `peopleResponseSchema`, `directoryPersonSchema`,
`itemsSeenRequestSchema`, and the types inferred from each. Collections use
`collectionSchema`; `TimelineResponse` extends it with `resultCount`.

Repeated query parameters arrive from Fastify as `string | string[]`, so the
request schemas normalise a single value into an array rather than making the
client send two.

## Verification

Everything `step-4a.md` § Verification asks for, plus what the contract names:

- `pnpm check` green.
- **Byte identity**: a brand-new archive and a fully restricted viewer return
  identical bodies; no response field varies with the existence of items the
  viewer cannot see.
- **A count and its rows move together**: restrict one item, assert the day's
  `itemCount`, its `unseenCount`, the tag count, the person count, the band's
  count and the rows all move by exactly that item.
- **212 reads as 204** to somebody restricted from eight, with nothing in the
  payload naming the other eight.
- **The evaluation's named test**: an item restricted to admins and
  people-tagged for the viewer is absent from that viewer's day and from its
  `itemCount`.
- **Ruling 1**: a date-range filter keeps a milestone-only day; a tag filter
  drops it.
- **Unknown ids narrow**: an unknown tag, person or milestone id returns an
  empty result rather than an error.
- **Paging**: walking the whole archive returns every day exactly once, days
  never split, and the band state survives the cursor so an occasion opens one
  band across pages.
- **The query plan**: the same query count for a one-item page and a 250-item
  page, asserted through a counting Kysely plugin.
- **The `ON`-clause trio**: a person with no `item_people` rows appears with
  `itemCount` 0; a person whose every item is invisible reads 0 and not 1; a
  tag whose every item is invisible stays in the vocabulary at 0; a day of
  seen items still appears with `unseenCount` 0 rather than vanishing.
- **The face**: a preferred face that is invisible falls back to the most
  recent visible item; a person with no visible item returns null rather than
  a signed URL.
- **The bursts**: zero visible frames vanishes and is not counted; one renders
  as a plain print with `burst: null`; the cover falls back when the stored
  cover is invisible; the span and the count cover visible frames only.
- **The latch**: an invisible id and a nonexistent id both return `204` and
  write nothing; a second post writes nothing and changes nothing; `burstIds`
  expand to visible frames; over 500 ids is a `400`.
- **The rail**: `limit` or `cursor` is a `400`.

## Documentation

`docs/server.md` gains the new route modules in its table and the archive
directory in its layout. `docs/architecture.md` § What is not built yet loses
the read slice. A new `docs/archive.md` records the day stream, the union, the
band rule and the burst collapse, because those are the three things a future
reader cannot recover from the code without the reasoning. `app.config.ts`
gains two knobs with their reasoning beside them, as that file requires.

## What this step deliberately leaves

`GET /api/items/:itemId` and everything hanging off one item, including
`GET /api/bursts/:burstId/frames`, are step 5a. Creating or editing a tag, a
person or a milestone is step 5a and step 7a. Every surface is step 4b and
step 5b. The caches are deferred until step 6a gives them something to
invalidate on, and rollups keyed by `(dimension, visibility_rule_id)` are not
built at all, which `data-models.md` § The queries that will hurt first is
explicit about.
