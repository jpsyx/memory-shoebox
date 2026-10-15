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
| `GET /api/timeline/rail`  | Every visible day with total, photo and video counts, unpaginated    |
| `GET /api/filters/facets` | Tag and person chip counts for the current selection, narrowing      |
| `GET /api/tags`           | The tag vocabulary with per-viewer counts                            |
| `GET /api/people`         | The people directory, with a face that resolves per viewer           |
| `POST /api/items/seen`    | The one-way latch, which reports nothing about the ids it was handed |

`src/routes/timeline.ts`, `filters.ts`, `tags.ts` and `people.ts` are thin:
they parse with the schema from `@memory-shoebox/shared`, call one reader, and
return it. The seen latch is the exception to the layout rather than to the
shape: it is just as thin, and it lives in `routes/items/` because the path it
sits under is an item's, beside the item slice
([server.md](server.md#the-item-slice)). Everything below is
`apps/server/src/archive/`.

## Layout

```
apps/server/src/archive/
├── selectionFilter.ts        normalise the query; the one selection expression
├── timelineCursor.ts         encode, decode, prune, and the filter digest
├── readItemDays.ts           query 1: days, media counts, the unseen anti-join
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

## Explicit media availability

The rendition batch reads catalog identity, MIME type, byte size and oriented
pixels, then selects representations before obtaining B2 leases. Archive,
people, occasion, removal and completed-upload reads request `thumbnail` media;
a burst strip also requests thumbnails. Unused displays and originals are not
signed. Each source retains its actual issuance and expiry from the shared B2
lease cache.

`MediaRef` carries the item's catalog width and height independently of its
nullable thumbnail, display, poster and playback. Photo display candidates
include the JPEG display fallback and generated 960px/WebP candidates.
A visible item or burst frame with no preview remains in the response, with a
placeholder and the same aspect ratio. Missing sources are `pending` only when
a durable pending/running job matches the current original and recipe; old-source,
old-policy and unavailable work cannot produce a false pending state. Existing
usable representations stay ready while upgrades run.

`readMediaSources` returns `{ sourcesByItemId, previewStatesByItemId }`. Each
nonempty authorized batch costs two catalog queries: renditions and current
processing state. This adds one query per batch, independent of item count,
without media fetching or per-item status queries. Timeline, selection, removal,
detail, burst, speculative and completed-upload DTOs retain the state. The people
directory consumes only the selected source map because its face DTO has no
processing-state field. Empty batches still issue no queries.

A browser-compatible photo original can substitute only within the purpose's
limits: 480px/128 KiB for thumbnails, or 2048px/1.5 MiB for a selected display.
The 960px candidate targets 512 KiB. These byte targets guide generated JPEG
encoding; a valid generated derivative over target remains available for
foreground reads, with its actual byte size exposed for later speculative
budgeting. Video bytes never serve an image role. Only a selected-video read
may receive an original playback fallback; thumbnail and speculative reads
cannot receive it.

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
with the total `itemCount`, separate `photoCount` and `videoCount` aggregates,
and `unseenCount` from the `item_views` anti-join. Nothing has to be kept in
step with anything. An item that changes visibility changes the day it belongs
to on the next read, and there is no denormalised total for a restricted item
to leak through.

The complete jump rail returns `itemCount`, `photoCount` and `videoCount`
for each day. The media counts use the same viewer and selection predicate
as the total, include every visible burst frame, and do not depend on loaded
timeline pages. A milestone-only day carries zero for all three counts.

The one cost is the union. Because a day is only ever a group of items, a
milestone with no visible items on one of its dates has no day to be drawn on,
and surface 2's `milestone-empty` state exists precisely for that case. So the
stream is the union of the distinct `captured_on` of visible items **and every
date inside every overlapping milestone span**, expanded in the application
(`mergeDays.ts`, `milestoneSpans.ts`). Milestones have no visibility of their
own, so a milestone-only day looks the same to everybody.

The day-stream milestone query is bounded, and its bound is provable.
Global band ranking separately reads the complete small milestone catalog.
Item days are fetched nearest the exclusive cursor boundary, with
`LIMIT limit + 1`. The extra day bounds the far edge of the milestone window:
a floor for older reads, a ceiling for newer reads. Days beyond it cannot
reach this page. With fewer item days there is no far edge, so the remaining
small milestone catalog is eligible. The rail keeps its complete descending
defaults.

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
across pages. Older reads use `captured_on < :d`, newer reads use
`captured_on > :d`. The pile has no
in-day pagination affordance, and inventing one in an API would have been a
design change made in the wrong document.

A single day of 212 photographs therefore arrives whole. The guard against ten
of those is `appConfig.timeline.pageItemBudget`: stop adding days once the
running visible-item total passes it, but always return at least one day,
however large. This budget is applied nearest the requested boundary before
normalizing every response to newest-first order. Both edge cursors use one
bounded SQL statement with visible, selection-exact item existence probes and,
when content filters permit them, occasion-day existence probes. Hidden rows
and unfiltered totals cannot create a cursor.

## The cursor

Base64url over `{ v: 2, d, f, direction }`, in `timelineCursorHelpers.ts`:

| Field       | Holds                                        |
| ----------- | -------------------------------------------- |
| `v`         | Cursor version, currently `2`                |
| `d`         | The exclusive `captured_on` boundary         |
| `f`         | A truncated SHA-256 of the normalised filter |
| `direction` | `older` or `newer`                           |

`nextCursor` requests days older than the oldest returned day;
`previousCursor` requests days newer than the newest returned day. Both are
null when no eligible day exists on that side. Empty and fully restricted
archives have the same four response fields and null cursors. The effective
`until=min(until, at)` of a jump remains part of the normalized filter in both
directions, so reversing never escapes the jump.

Bands come from `milestones/getDayBandAssignmentsFromMilestoneSpans.ts`,
a pure assignment across every date in every milestone span, newest first.
The narrowest unintroduced covering span wins, then earliest start, then
smallest milestone ID. Only winners become introduced. Continuations sort
by start and ID. The assignment is independent of viewer, filters, page size
and jump position; a filtered day stays a continuation even if its opening
band was omitted. Item counts remain per viewer and only bands have counts.
Upload emails use the same assignment for their day's milestone name.

Unversioned `{ d, f }` and `{ d, o, f }` cursors remain accepted as older
reads: a supplied `o` must be an array of valid UUIDs, then it is discarded.
It cannot influence ranking. Unknown versions and missing or invalid v2
directions are refused.

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

Owners and admins can remove a photo from an expanded burst without deleting
it. The photo becomes a standalone print on the same day, preserving its
metadata and conversation. Item settings offer return to the original burst
when its capture day still matches. Group history survives removal of every
frame; restoring reuses the original group and ordering. Server-provided
per-frame capabilities restrict controls to the photo owner or an admin, and
all burst counts and positions remain visibility-filtered.

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
| 2   | Milestones overlapping the day-stream window               | always                      |
| 2a  | Complete milestone catalog for global band assignment      | always                      |
| 3   | Items for the chosen days                                  | when the page has a day     |
| 4   | `bursts.cover_item_id` for the burst ids on the page       | when the page has a burst   |
| 5   | `item_renditions` for the drawn ids                        | when the page draws an item |
| 6   | Rule subjects for the distinct `visibility_rule_id` values | when the page draws an item |
| 7   | `item_people` for the drawn ids, for alt text              | when the page draws an item |
| 8   | The member map, for uploader `MemberRef`s                  | when the page draws an item |
| 9   | `shoebox.timezone`, for the date inside alt text           | when the page draws an item |
| 10  | Per-viewer `itemCount` for milestones taking a **band**    | when the page has a band    |
| 11  | `resultCount`                                              | filtered, uncursored only   |
| 12  | Bounded older/newer day existence                          | nonempty pages              |

The optional validated `includeResultCount=true` requests the existing filtered
count once at the head of a retained-page refresh after eviction. Ordinary
cursor reads still return null. This flag changes neither selection nor cursor
digest, and costs one extra SQL statement per filtered refresh, rather than
one per cursor page.

Queries 5 to 9 are keyed by the ids actually **drawn**, so a collapsed
forty-five-frame burst costs one item's renditions and one item's people rather
than forty-five. Query 6 left-joins `members` and `groups` for the subject
display names, so a `VisibilitySummary` needs nothing further. Signing is
in-process HMAC over distinct storage keys and touches no network.

Measured for C2 through the counting Kysely plugin: a single-print route
request costs **14** statements and the 250-print, banded request costs **15**.
The unchanged ceiling and small-versus-large assertion still pass. Direct
cursor-page assembly costs **11** executions for both directions and both
roles, before and after adding 1,000 unrelated items; the base was **10**.
The edge existence query is the one new statement.

`EXPLAIN QUERY PLAN` shows admin candidate and item-existence reads using
`items_navigation_capture` with exclusive date bounds, without a temporary
grouping tree. Non-admin reads preserve the base planner limitation: the
visibility-or-uploader predicate uses `items_rule_captured_on` and
`items_uploaded_by` in a multi-index OR, then groups the eligible range in a
temporary tree. SQL has date keysets and bounded returned days in both
directions, but this plan is not proof of bounded row work or early stopping
for non-admin viewers. The small complete milestone catalog can also scan.
Changing that access plan requires measurement and a separate decision.

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
client draws the shared unavailable preview. Served without that check, a
preferred face is a restricted photograph published as a directory thumbnail.

**A facet's `narrowedCount` is what adding that chip would leave**, never what
the chip is worth on its own, so `beach 0` is visible before anybody presses
it. Every chip comes back every time, zeros included, because a row that
reshuffles under a finger is worse than a zero and `0` is itself the answer.
`narrowedCount` is null exactly when `isSelected`, and `ownCount` is non-null
exactly when `isSelected`, so exactly one of the two is a number on every chip.

## The client half

Everything above is `apps/server`. The browser's half of the same stream is
`apps/web/src/api/timeline/`, `api/vocabularies/`, `api/seen/seen.ts` and
`apps/web/src/surfaces/Timeline/`, built in step 5b, and the four things below
are here rather than in [web.md](web.md) because none of them makes sense
apart from the route it talks to. The surfaces themselves, and what the URL
carries, are [web.md § The six built surfaces](web.md#the-six-built-surfaces).

**The infinite query is keyed by the string the request is built from.**
`makeTimelineQueryOptionsFromView` pages on `nextCursor` and `previousCursor`,
stops on null, and retains at most five pages. A
cursor carries `f`, the digest of the filter it was minted under, and the
server answers `400` rather than guessing when one is presented against a
different selection, so a selection change has to land under a different query
key or the next page is refused. Deriving the key from the same rendered query
string the request is built from is what guarantees that, rather than a
hand-kept list of which fields matter; `limit` is outside the digest, so
nothing about page size can strand a scroll. Both boundary callbacks in the
actual `useTimelineData` caller inspect the query's current fetch state and use
`cancelRefetch: false`, excluding opposite-direction and refresh races even
before React rerenders. A measured near-start sentinel invokes that guarded callback one viewport ahead.
Both sentinels reobserve when the exact query returns to idle; paging or recovery
occupancy disconnects them, so an intersection during a previous read cannot strand
forward or reverse traversal.

Each web page retains its request-start `metadataUpdatedAt` and a scalar
`selectionResultCount` from the uncursored response or latest refresh head.
Appending, reversing and eviction preserve existing page timestamps. Carrying
the count in these same five pages survives remount without an extra cache.
A sequential retained-page refresh requests a new count only for its first
cursor page, then propagates it within that fetch's AbortSignal ownership;
late canceled operations cannot replace the next operation's count. The reader
uses weak signal keys with scalar values, so older retained query options cannot
keep the signal's abort-listener closure and evicted pages alive. Raw facet
choices keep their full selection while the strip's count keeps the effective
jump boundary.

An empty retained refresh head triggers one client retry from the uncursored
effective selection, then ordinary older traversal resumes. This includes the
surviving boundary day without changing exclusive server cursors. Web-only
`requestCursor` provenance atomically normalizes cached `pageParams` through
Query's public structural-sharing callback, preserving truthful cursor replay
and the five-page cap. Recovery costs one extra HTTP page request and a second
filtered count; an empty retry stops with null edges. Server cursor formats,
date limits and visibility predicates stay the same.

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

**Media renewal follows actual visibility.** The member-owned lease coordinator
batches foreground renewal independently from timeline metadata. Positive
zero-margin intersections, not mounting or overscan, authorize automatic work.
Queued automatic requests recheck visibility before flushing, while explicit
retry can operate invisibly. Renewal preserves each page's metadataUpdatedAt
and never refetches the whole inactive timeline to refresh signatures.

**Measured row windowing bounds the stream.** TanStack Virtual windows normal
grid rows and individual fan lines, while metadata remains in five atomic-day
pages. A thousand-item day and a 200-frame expanded fan therefore need only the
visible rows and one measured viewport of overscan on either side. Day shells
retain their date spine and jump target. Headers preserve server-ranked
milestone order. Original item offsets feed the scatter seeds, intrinsic image
ratios reserve a media box independent of native missing-source, loading, loaded
or failed-image fallback. Accessible alt text and uncropped fit remain intact;
sparse days retain their normal print scale.

Native scroll anchoring is disabled only within the windowed stream. Virtual
owns ordinary measurement adjustments; structural regrouping uses one saved
reading-item correction through its public scroll API. The owned instant correction
acknowledges actual window offset through the public offset observer and cancels
its completed absolute command before later row measurements, avoiding a skipped
adjustment while native scroll-event readback is pending. Rendered geometry comes
from its public measurement snapshot with stable estimates for unmeasured
rows. The retained-row size map is width-scoped; public measure() clears
obsolete internal keys after page retirement or width change, and retained
measurements remain estimates without a separate historical cache. A single
focused row can remain beyond the five-page window, stripped to its own members,
until blur or authoritative retirement.

The media provider keeps at most 20 compact view anchors and 20 expanded IDs
per view. Evicted expansion metadata reserves a scalar height until positive
intersection or explicit opening reloads frames. Browsing frame arrays and
unobserved burst Query copies are pruned when closed, evicted or beyond the
expansion LRU. Selected-frame ownership remains separate. Exact saved-cursor
recovery preserves effective selection, fresh count and request-start page
provenance, with a retry action for network failure and a surviving-position
fallback for authoritative absence. See [web.md](web.md) for ownership and
cancellation details.

`e2e/media/timeline.spec.ts` exercises the actual local Fastify catalog and
browser layout in Chromium/WebKit at desktop and phone widths. It covers a
5,000-item traversal, atomic 1,000-item day, page eviction and Back offsets,
200-frame fans, focus and selection, jump boundaries, and positive-viewport
source/seen work. The earlier content-visibility-only measurements in
[the step design](superpowers/specs/2026-09-29-the-pile-design.md) describe the
previous implementation, not the current windowing acceptance result.

## Person identity and tag corrections

The people directory includes active members because each has a linked person,
created by setup/sign-in or backfilled for existing accounts. Their names follow
account names. Removing account access preserves the person's identity and tags;
new pending invitations do not appear until accepted. No ad-hoc record is linked
merely because its name matches a member.

The item tagging editor reads action capabilities from
`GET /api/items/:itemId/people/options`. Counts remain scoped to photographs the
caller can see. An ad-hoc person's creator or an admin may rename them across
the archive. Any content editor may delete an ad-hoc person if no other item
references them; the server counts hidden references too and removes the
current tag atomically. Pending upload plans for that person are cancelled,
with their label and history preserved, to prevent the deleted identity from
being recreated during ingest. Removing a tag alone still preserves the person. Linked
members have neither global action. These operations never grant visibility.

## Editing a timeline selection

`POST /api/items/bulk-edit` applies one action to between 1 and 500 distinct
item IDs and returns an empty `204`. Its shared discriminated contract is
`BulkEditItemsRequest`: `tags` carries names, `people` carries existing person
IDs or new names, `milestone` carries one occasion ID, and `delete` carries
only the selection. This endpoint lives in the item slice, alongside the
archive's seen latch.

Every batch acquires one immediate SQLite transaction before rechecking the
member's active session, role, current visibility rules and selected items.
Missing and hidden items produce the same bare `404` for the entire batch.
Only uploaders and admins may edit. Deletion additionally requires ownership
of every selected item or admin authority; a mixed-owner selection fails
with `403` without deleting any item. No action skips part of the selection.

Tags and people are additive. Existing joins retain their attribution and
timestamps, tag names use the normal normalization, and a newly entered
person is created once and reused across the selected items. The final union
on each item must stay within the existing 50-tag and 30-person caps. An
overflow or any later failure rolls back the whole operation, including new
vocabulary entries. Occasion attachment uses the existing delta service,
retaining other attachments, existing mismatch acknowledgements and capture
dates; newly attached out-of-span items use the usual mismatch workflow.

Deletion reuses the item cascade, including removal-request settlement and
queued mail, object-deletion jobs, individual audit events and empty-burst
cleanup. Storage deletion remains background work after commit. Bulk edits
never read item detail or record an item open, and writes have no automatic
retry.

### Selecting and editing from the timeline

Uploaders and admins can enter **Select photos** beside **Find** in the main
timeline header, tick
individual photos or videos, and use the same tag, people, and milestone
controls as upload. Existing tags and people stay attached. A stack opens into
individually selectable frames fetched with the active filters; cached browsing
fans are not reused for selection. **Tick loaded photos** includes every frame of
every matching burst in the loaded days, following burst pagination with the
same tag, people, date and occasion filters; it does not select
unloaded days or bypass the active filters. Selection is capped at 500 items;
a larger loaded selection is refused with an explanation instead of being
silently truncated. Changing filters or jumping to another date clears ticks.

**Delete** opens a modal naming the selected count and warning that deletion,
including comments and reactions, cannot be undone. Cancel is focused first.
The chosen IDs stay frozen while the modal is open, and submission locks the
controls until the request settles. A refusal retains the selection and gives
recovery instructions; an uncertain response blocks repeat submission until
the dialog is closed and the refreshed timeline reviewed. Closing that review
clears both selected IDs and copied burst frames so deleted frames cannot
linger. A missing selection also requires a fresh review. Locally invalid
labels stay editable and are rejected before any request is sent. The server checks
ownership, so uploaders can delete their own media and admins can delete any
visible media. The header action exists only while the timeline is mounted, and disappears
on People, account, and other surfaces. Leaving selection or completing an
edit returns keyboard focus to that header action. No timeline bulk controls
are shown to viewers.

Confirmed changes refresh timeline days, totals, filter facets, vocabularies,
milestones and burst state. They never read item permalinks merely to edit them,
so bulk work does not add phantom opens. The toolbar inherits upload's ink and
square controls, wraps into two columns on phones, and measures the header so
its sticky position still works with wrapped navigation or zoom. Timeline tick
marks sit away from visibility labels, unseen dots and video runtimes.
