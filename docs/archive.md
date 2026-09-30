# Reading the archive (`apps/server/src/archive`)

The pile, the jump rail, the filter chips, the two vocabularies and the accent
dots: everything the family sees when they scroll, and nothing that writes an
item. Six routes over one SQLite catalog, and the hardest query in the product
sits behind the first of them.

The contract is
[`apis/timeline.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md),
binding, with
[`conventions.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md)
above it, and the schema is
[`data-models.md`](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md).
The arguments behind the twenty decisions this slice had to make are
[the step design](superpowers/specs/2026-09-28-archive-read-path-design.md).
This file says what the modules are, how they fit, and which of those decisions
a reader cannot recover by reading the code. § The client half, at the foot,
crosses to `apps/web` for the browser's half of the same stream.

## The six routes

| Route                     | What it answers                                                      |
| ------------------------- | -------------------------------------------------------------------- |
| `GET /api/timeline`       | A page of days with their items, milestone bands, strips and counts  |
| `GET /api/timeline/rail`  | Every visible day with its count, complete and unpaginated           |
| `GET /api/filters/facets` | Tag and person chip counts for the current selection, narrowing      |
| `GET /api/tags`           | The tag vocabulary with per-viewer counts                            |
| `GET /api/people`         | The people directory, with a face that resolves per viewer           |
| `POST /api/items/seen`    | The one-way latch, which reports nothing about the ids it was handed |

`src/routes/timeline.ts`, `filters.ts`, `tags.ts`, `people.ts` and `items.ts`
are thin: they parse with the schema from `@memory-shoebox/shared`, call one
reader, and return it. Everything below is `apps/server/src/archive/`.

## Layout

```
apps/server/src/archive/
├── selectionFilter.ts        normalise the query; the one selection expression
├── timelineCursor.ts         encode, decode, prune, and the filter digest
├── readItemDays.ts           query 1: days, itemCount, the unseen anti-join
├── readOverlappingMilestones.ts  query 2: the occasions covering the window
├── milestoneSpans.ts         span expansion, day positions, rankMilestonesForDay
├── mergeDays.ts              the union, the merge, the budget, the cut
├── readDayStream.ts          the two queries and the merge, as one page of days
├── readItemsForDays.ts       query 3: the items on those days
├── collapseBursts.ts         item rows to drawn entries, covers, spans, unseen
├── readBurstCovers.ts        query 4: `bursts.cover_item_id`, and nothing else
├── readMediaSources.ts       query 5: renditions
├── makeMediaRefFromSources.ts  renditions to a signed MediaRef, with fallbacks
├── readVisibilitySummaries.ts  query 6: rule subjects, and the group-name label
├── readPeopleNamesByItemId.ts  query 7: who is in the drawn items
├── makeAltTextFromItem.ts    the composition rule, and the one formatted date
├── readMemberRefs.ts         query 8: the per-request member map
├── readMilestoneItemCounts.ts  query 10: what a banded occasion holds
├── countSelectedItems.ts     query 11: `resultCount`
├── readTimelinePage.ts       the orchestration, and no query of its own
├── readRailDays.ts           the rail
├── readVocabularyCounts.ts   the unfiltered tag and person aggregates
├── readFacets.ts             narrowed counts, and the facets route's resultCount
├── readPeopleDirectory.ts    the directory, including the face fallback
├── latchItemsSeen.ts         one statement, `INSERT ... ON CONFLICT DO NOTHING`
└── makeNormalisedNameFromName.ts  a name as `name_normalized` holds it
```

## One selection expression, and one rule above all of them

`makeSelectionExpressionFromFilter` composes the viewer's predicate from
[auth.md § The visibility predicate](auth.md) with the date range, one `EXISTS`
per selected tag, one per selected person, and the milestone attachment, and
returns a single Kysely expression. The day aggregate, the item query,
`resultCount`, the rail, the facet counts and the seen latch all take that same
object.

That is structural rather than tidy. A count and the rows it heads cannot
disagree while they are the same expression, and they begin to the moment
somebody retypes the clause. `EXISTS` rather than repeated joins, because a
repeated join fans out and turns a count into a multiple of itself
(`timeline.md` § Performance).

`item_people` appears in that expression only as a filter the caller asked for.
Being in a photograph is not a key to it.

The rule that governs the whole slice comes from `conventions.md`: **no count
that visibility can filter may ever be stored.** Every number in every response
here is computed for the viewer who asked, which is why there are no rollups
and why the caches below are deferred rather than merely unbuilt.

## The day stream

### A day is derived, not stored

There is no `days` table. A day is a `GROUP BY captured_on` over visible items,
with two counts beside it: `itemCount`, and `unseenCount` from the `item_views`
anti-join. Nothing has to be kept in step with anything, an item that changes
visibility changes the day it belongs to on the next read, and there is no
denormalised total for a restricted item to leak through.

The one cost is the union. Because a day is only ever a group of items, a
milestone with no visible items on one of its dates has no day to be drawn on,
and surface 2's `milestone-empty` state exists precisely for that case. So the
stream is the union of the distinct `captured_on` of visible items **and every
date inside every overlapping milestone span**, expanded in the application
(`mergeDays.ts`, `milestoneSpans.ts`). Milestones have no visibility of their
own, so a milestone-only day looks the same to everybody.

The milestone query is bounded, and the bound is provable rather than a guess.
Item days are fetched with `LIMIT limit + 1`; if a `(limit + 1)`-th day comes
back, no date below it can reach this page, because every such date already has
at least `limit + 1` item days above it in the merged descending order. Only
milestones overlapping `[that day, the cursor's day]` can matter. With fewer
than `limit + 1` item days there is no floor, and every milestone at or below
the cursor is fetched, which is tens of rows.

### What a filter does to the union

`timeline.md` Ruling 1: the union applies only when no **content** filter is
set. A date range is a window on the same feed; a tag, a person or a milestone
attachment is a predicate on what is on the day, and a day with no matching
items is not a result.

| Filter                  | A milestone-only day          |
| ----------------------- | ----------------------------- |
| None                    | Appears                       |
| `from` / `until`        | Appears, clipped to the range |
| `tags`                  | Drops                         |
| `people`                | Drops                         |
| `attachedToMilestoneId` | Drops                         |

`hasContentFilter` in `selectionFilter.ts` is that distinction, and
`readDayStream` and `readRailDays` are the only things that ask it.
`hasAnyFilter` is a different question, asked by `resultCount`: a request is
filtered, and so gets a number for the filter strip, when any of `tags`,
`people`, `from`, `until` or `attachedToMilestoneId` is present.

### A day is atomic, and the guard is a soft budget

`limit` counts days, defaults to 10 and caps at 30, and a day never splits
across pages, so the next page is `captured_on < :d` strictly. The pile has no
in-day pagination affordance, and inventing one in an API would have been a
design change made in the wrong document.

A single day of 212 photographs therefore arrives whole. The guard against ten
of those is `appConfig.timeline.pageItemBudget`: stop adding days once the
running visible-item total passes it, but always return at least one day,
however large. `nextCursor` is non-null whenever the budget or the limit cut
the page short, so nothing is lost, only deferred.

## The cursor

Base64url over `{ d, o, f }`, in `timelineCursor.ts`:

| Field | Holds                                        |
| ----- | -------------------------------------------- |
| `d`   | The `captured_on` of the last day returned   |
| `o`   | The milestone ids that have taken a band     |
| `f`   | A truncated SHA-256 of the normalised filter |

**`o` is why the cursor exists at all.** The band rule is feed-ordered: of the
milestones covering a day, the band goes to the one with the narrowest span
that has not already taken a band further up this feed, ties breaking by
earliest start, and everything else covering the day becomes a continuation
strip. That makes a page's ranking depend on the pages before it, and no later
page can recompute it from the day alone. So the opened set travels. It records
what **took a band**, never what merely appeared, so an occasion that has only
ever been a strip still gets its full band on the first day it wins one, and it
is pruned to milestones starting strictly before `d`, which keeps it at zero to
two entries.

`f` is what stops a client changing the filter without resetting the cursor and
receiving a page ranked against a different feed. A mismatch is a `400`, not a
silent reset and not a best effort: the page would be coherent with neither
selection. Normalising means the tag and person ids sorted and deduplicated,
the dates as given or absent, the milestone attachment and its `exclude` flag,
and nothing else. `limit` is deliberately outside the digest, because changing
the page size mid-scroll is not a different feed.

The cursor is not signed. It encodes nothing the caller does not already know
and grants nothing: every query it feeds still carries the viewer's own
predicate.

## The `ON` clause, in the four places it decides the answer

The single most likely bug in this slice, named as such by `timeline.md`, and
silent in every hand-written fixture, because a fixture where everybody has at
least one visible photograph and nothing has been seen yet gives the same
answer either way.

| Query                              | What must sit in the `ON`                    | What the `WHERE` does instead                         |
| ---------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| The day aggregate (`readItemDays`) | `item_views.member_id = :me`                 | Turns the anti-join inner: every seen item disappears |
| The people directory               | The visibility predicate on the `items` join | Collapses the left join: everybody with nothing goes  |
| The tag vocabulary                 | The visibility predicate on the `items` join | Drops every tag whose items are all restricted        |
| The person vocabulary              | The visibility predicate on the `items` join | Drops every person whose items are all restricted     |

The first one is the worst, because its symptom is the archive emptying as
somebody reads it. The other three make a type-ahead lie about what exists.

The quieter twin travels with the last three: the count is **`COUNT(i.id)`,
never `COUNT(*)`**. On a left join the null-extended row is still a row, so
`COUNT(*)` gives every tag and every person with nothing visible a floor of 1,
and "Nothing yet" is rendered as "1 photo and video". The day aggregate is the
one that may count all rows, because it is driven from `items` and a grouped
day therefore always has at least one; its exposure is the `ON` clause alone.

This is also why `visibilityExpression` hands an admin the literal `true`
rather than nothing at all. An absent `WHERE` restricts nothing, but an absent
`ON` condition changes which rows the join matches. See
[auth.md § The visibility predicate](auth.md) for the two shapes and why there
are two.

## Bursts at read time

Frames are ordinary `items` rows and arrive already visibility-filtered, so
`collapseBursts.ts` decides what to draw from the rows it was given. The
`bursts` table is read for exactly one column, `cover_item_id`, and never to
decide what exists.

| Visible frames | What the day gets                                                                       |
| -------------- | --------------------------------------------------------------------------------------- |
| 0              | Nothing: no entry, no count, and no code to write. That is what frames being items buys |
| 1              | One plain print, `burst: null`. Never a `BurstSummary` with `visibleFrameCount: 1`      |
| 2 or more      | One entry whose `burst` is a `BurstSummary` over the visible frames alone               |

The cover is `bursts.cover_item_id` when that frame is visible, and otherwise
the earliest visible frame. `visibleFrameCount`, `startsAt` and `endsAt` are
computed over the visible frames only, never from `bursts.starts_at` and
`bursts.ends_at`: a stored span leaks the restricted frames through the
endpoints of "06:41 to 06:44" exactly as a stored count leaks them through a
denominator.

The collapsed entry stands at the position of its **earliest visible frame**. A
burst is a contiguous run, and items within a day come back oldest first
(`ORDER BY captured_at ASC, seq ASC`), so the stack stands where the run
started. That order is the server's to decide rather than the browser's:
`DESIGN.md` § Do's seeds the messy pile's tilt, offset and z-order from the
item's index, so a client that re-sorted would reshuffle the wall.

`hasUnseenFrames` costs no extra query. It is the anti-join the day aggregate
already runs, aggregated per burst in process, and it is the reason
steady-state browsing costs zero writes: a collapsed stack is the one place the
client otherwise cannot tell whether `POST /api/items/seen` would do anything,
so it would either post on every page view, against a database with one writer
that is also taking uploads, or never post, leaving forty-four frames
permanently new.

## What is deliberately absent

- **The caches.** `timeline.md` calls the unfiltered rail "the first thing to
  cache", per `(memberId, visibilityGeneration)` plus an item-generation
  counter, and asks the same of the tag aggregate. Nothing writes an item until
  step 6a, so there is nothing to bump that counter yet, and a cache with no
  invalidation channel is a rail that goes stale on the first upload and stays
  stale. What this slice does instead is put every cacheable query behind one
  function (`readRailDays`, `readTagCounts`, `readPersonCounts`), so the cache
  is a wrapper in one place when the write path that invalidates it exists.
- **The rollups.** Counts keyed by `(dimension, visibility_rule_id)` are not
  built at all. `data-models.md` § The queries that will hurt first is explicit
  that they wait until an instance is measured, and the rule above says why
  they are the dangerous kind of optimisation: a stored count is a count
  visibility can no longer filter.
- **A re-signing route.** Signed media URLs live one hour
  (`appConfig.media.signedUrlTtlSeconds`, `timeline.md` Ruling 3). When one
  expires the client refetches the affected page in place and merges by id,
  which keeps the scroll position and re-evaluates visibility on the way
  through. A route that re-signs a list of storage keys would be a second path
  to a bearer link, authorised separately from the page that produced it.
- **Anything about one item.** `GET /api/items/:itemId` and
  `GET /api/bursts/:burstId/frames` are step 5a; creating or editing a tag, a
  person or a milestone is step 5a and step 7a.
- **An existence oracle.** An unknown `tagId`, `personId` or
  `attachedToMilestoneId` narrows to nothing rather than erroring, and the seen
  latch reports nothing at all about the ids it was handed. No route in the
  slice takes an id it could 404 on, which is also what keeps a bookmarked
  filter working after somebody merges a tag.

## The query plan

None of the queries is per item, per day or per burst. For a page that draws
items:

| #   | Query                                                      | When                        |
| --- | ---------------------------------------------------------- | --------------------------- |
| 1   | Candidate days, with counts and the unseen anti-join       | always                      |
| 2   | Milestones overlapping the window                          | always                      |
| 3   | Items for the chosen days                                  | when the page has a day     |
| 4   | `bursts.cover_item_id` for the burst ids on the page       | when the page has a burst   |
| 5   | `item_renditions` for the drawn ids                        | when the page draws an item |
| 6   | Rule subjects for the distinct `visibility_rule_id` values | when the page draws an item |
| 7   | `item_people` for the drawn ids, for alt text              | when the page draws an item |
| 8   | The member map, for uploader `MemberRef`s                  | when the page draws an item |
| 9   | `shoebox.timezone`, for the date inside alt text           | when the page draws an item |
| 10  | Per-viewer `itemCount` for milestones taking a **band**    | when the page has a band    |
| 11  | `resultCount`                                              | filtered, uncursored only   |

Queries 5 to 9 are keyed by the ids actually **drawn**, so a collapsed
forty-five-frame burst costs one item's renditions and one item's people rather
than forty-five. Query 6 left-joins `members` and `groups` for the subject
display names, so a `VisibilitySummary` needs nothing further. Signing is
in-process HMAC over distinct storage keys and touches no network.

Measured, through the counting Kysely plugin in
`apps/server/test/helpers/createQueryCountingDatabase.ts`: a page costs **11** queries for
a single print, **12** for 250 prints across three days, and **12** again for
500 prints across seven days. The invariant those numbers demonstrate is
constancy in the size of the page, not any one of them; the standing assertion
is that the large page costs no more than the small one plus the band count it
alone has a band for.

The other five routes: the rail is 2, the facets route is 2 with nothing
selected and 5 with a selection, `GET /api/tags` is 1, `GET /api/people` is 4,
and the latch is a single statement.

## Two more things that are easy to get backwards

**`peopleCount` is not per viewer.** It counts `people` rows before `q`
narrows them, so surface 7 can say "6 of 10 people" without anybody concluding
somebody has been removed. It is one of `conventions.md`'s three documented
exceptions: a person's existence is not visibility-scoped, only their
photographs are. The face is the part that is, and it resolves to
`preferred_face_item_id` **only if that item is visible to this viewer**,
otherwise the most recent visible item tagged with them, otherwise null and the
client draws the ghost frame it already has. Served without that check, a
preferred face is a restricted photograph published as a directory thumbnail.

**A facet's `narrowedCount` is what adding that chip would leave**, never what
the chip is worth on its own, so `beach 0` is visible before anybody presses
it. Every chip comes back every time, zeros included, because a row that
reshuffles under a finger is worse than a zero and `0` is itself the answer.
`narrowedCount` is null exactly when `isSelected`, and `ownCount` is non-null
exactly when `isSelected`, so exactly one of the two is a number on every chip.

## The client half

Everything above is `apps/server`. The browser's half of the same stream is
`apps/web/src/api/timeline/`, `api/vocabularies/`, `api/items/seen.ts` and
`apps/web/src/surfaces/Timeline/`, built in step 5b, and the four things below
are here rather than in [web.md](web.md) because none of them makes sense
apart from the route it talks to. The surfaces themselves, and what the URL
carries, are [web.md § The six built surfaces](web.md#the-six-built-surfaces).

**The infinite query is keyed by the string the request is built from.**
`timelineInfiniteQueryOptions` pages on `nextCursor` and stops on null. A
cursor carries `f`, the digest of the filter it was minted under, and the
server answers `400` rather than guessing when one is presented against a
different selection, so a selection change has to land under a different query
key or the next page is refused. Deriving the key from the same rendered query
string the request is built from is what guarantees that, rather than a
hand-kept list of which fields matter; `limit` is outside the digest, so
nothing about page size can strand a scroll.

**The latch sends nothing when everything in view is already seen.** One
intersection observer watches the whole pile, the prints announce themselves
with `data-item-id` and `data-burst-id`, and the batch goes 500ms after the
last thing came into view, capped at `LIMITS.seenMaxIds`. A `MutationObserver`
beside it hands over every print that arrives after the archive mounted, which
is all of them on a cold load and every page the infinite scroll appends.
`getSeenRequestFromSightings` returns nothing at all when no item in the batch
carries `isUnseen` and no burst in it carries `hasUnseenFrames`, which the
client knows without asking: that pair of flags is exactly what makes the
decision local, and `hasUnseenFrames` exists because a collapsed stack is the
one place the client holds no per-frame answer. Steady-state browsing
therefore costs zero requests on this route, which is what § Performance asks
for and what matters to a database with one writer that is also taking
uploads. A stack posts its `burstId` rather than frames it does not hold, the
accent dot goes out locally, and nothing is refetched to learn what the client
has just caused.

**Re-signing is one timer for the page.** `useReSigning` scans the loaded
pages for the earliest `MediaSource.expiresAt`, sets a single timeout for
thirty seconds before it, and on fire refetches the infinite query. TanStack
Query replaces every loaded page together and each print is keyed by its
`itemId`, so "merge by id" in Ruling 3 is React's own reconciliation: no node
unmounts, nothing above the viewport changes height, and the scroll offset
survives because nothing navigated. One timer rather than one per page,
because a hundred timers for a fact that moves once an hour are a hundred
things to clear on unmount. The delay is clamped to 2,147,483,647 ms, since a
longer one overflows the 32-bit integer `setTimeout` keeps it in and fires on
the next tick rather than never: a real signature lives about an hour, but a
fixture claiming decades would otherwise refetch immediately.

**`content-visibility` is the whole of the scroll strategy, and no virtualizer
was added.** `.pile` is a CSS multi-column box and a multi-column box cannot
be windowed, because the browser has to lay out every child to balance the
columns; there is no way to render half a day. What can be skipped is a whole
day, so `.pile` carries `content-visibility: auto` with
`contain-intrinsic-size: auto 1200px`, roughly the screen and a half an
ordinary day comes to, and the browser skips layout, paint and hit-testing for
every day that is not near the viewport, which is most of them. It costs one
CSS rule and no dependency.

Then it was measured rather than felt. `e2e/scroll.spec.ts` scrolls the seeded
340-item day thirty thousand pixels in six-hundred-pixel steps at a 400px
viewport, against a built app served by the real Fastify process, and finds
**61 frames a second, no long tasks, and a longest task of 0 ms** on an idle
machine, against thresholds of 30 frames a second and 200 ms. Both thresholds
are assertions in that spec rather than numbers left in a document to rot, so
a change that makes the pile heavy fails the run instead of quietly
disagreeing with this paragraph. They are wide because the figures move with
whatever else the machine is doing. The argument is in
[the step design](superpowers/specs/2026-09-29-the-pile-design.md)
§ What the measurement found.
