# Reading the archive

> Historical source references. `reference/` and `@memory-shoebox/reference` below are historical shorthand for the retired surface package at commit `3e09157b`, not current paths or runnable instructions. Read that commit for the original source spelling. Product decisions remain binding; current implementation and acceptance are documented in `docs/web.md` and step 9 verification.

The read path for the pile: the day stream, the jump rail, filtering and
search, the people directory, the two empty states, and the one-way seen latch
that clears the accent dots. **Not here:** one item and anything hanging off it
(`GET /api/items/:itemId`, burst siblings, comments, reactions, who has viewed
it), creating or editing tags, people or milestones, uploading, and every
admin surface. Those belong to other slices; this one only reads, except for
the latch, which writes nothing the viewer cannot already see.

Three properties hold across every route below and are asserted once here
rather than repeated six times:

- **Every count is a per-viewer aggregate**, produced by the identical
  predicate fragment as the rows it heads. The fragment is built once per
  request as a single reusable expression and is never retyped, so a count and
  its page cannot disagree (`data-models.md` § One rule that outranks the
  others). No count in this slice reads a stored column, and none may become
  one.
- **Nothing in this slice addresses a row by an item-derived id in a way that
  can 404.** The filter routes take tag and person ids, which are not
  visibility-scoped; `POST /api/items/seen` takes item ids and deliberately
  does not report on them. See that route's error table for why.
- **Payload identity between an empty archive and an invisible one** is a
  contract, not an accident. `GET /api/timeline` is the route that carries it.

## Routes

| Method | Path                  | Auth    | Role   | Purpose                                                      |
| ------ | --------------------- | ------- | ------ | ------------------------------------------------------------ |
| GET    | `/api/timeline`       | session | viewer | A page of days with their items, milestone bands and counts. |
| GET    | `/api/timeline/rail`  | session | viewer | The jump rail: every visible day with its count.             |
| GET    | `/api/filters/facets` | session | viewer | Tag and person chip counts for a given selection.            |
| GET    | `/api/tags`           | session | viewer | The tag vocabulary with per-viewer counts.                   |
| GET    | `/api/people`         | session | viewer | The people directory.                                        |
| POST   | `/api/items/seen`     | session | viewer | The one-way latch that clears accent dots.                   |

`Role: viewer` means the lowest role suffices. An admin runs the same handler
with the visibility clause omitted, which is both correct and fastest
(`conventions.md` § The visibility predicate).

---

## The day stream

#### `GET /api/timeline`

**Surface** 2 `timeline`, states `pile`, `burst`, `milestone`,
`milestone-span`, `milestone-two`, `milestone-empty`, `single`, `filtered`,
`end`; surface 5 `empty`, states `new`, `restricted`; surface 6 `filter`,
states `tag`, `person`, `dates`, `several`, `none`
**Auth** session required · **Role** viewer

**One route, not two.** The `filtered` state of surface 2 and the results of
surface 6 are this endpoint with query parameters set. There is no
`/api/search`, no `/api/filter/results` and no second day shape. A filtered
archive is not a different object, and an API that made it one would invite
the two to drift.

**Request**

```ts
type TimelineRequest = {
  query: {
    /**
     * Repeated, not comma-joined: `?tags=a&tags=b`. ANDed with everything else.
     */
    tags?: string[];
    /**
     * Repeated. Person ids, ANDed. Being in a photograph is not a key to it.
     */
    people?: string[];
    /** Inclusive capture date, `YYYY-MM-DD`. Capture, never upload. */
    from?: string;
    /** Inclusive capture date, `YYYY-MM-DD`. */
    until?: string;
    /** Days, not items. Default 10, capped at 30. */
    limit?: number;
    /** Opaque. See Transformations for what it encodes. */
    cursor?: string;
    /**
     * Narrows to items already attached to this milestone, or with
     * `exclude: true`, to items not attached to it. The milestone slice's
     * attach picker drives from here rather than reinventing this query
     * language: `GET /api/milestones/:milestoneId/candidates` serves the
     * span suggestion, and everything the picker's "A day, a tag, a person"
     * field does is this route with parameters set.
     */
    attachedToMilestoneId?: string;
    /** Only meaningful beside `attachedToMilestoneId`. */
    excludeAttached?: boolean;
  };
};
```

**The one-time line after a first sign-in reads its number from here.** The
auth slice's `CreateSessionResponse.isFirstSignIn` is the trigger and carries
no count, because the count is viewer-filtered and belongs to a route that
applies the predicate. The client takes it from this response's total rather
than from the session, and it must never come from a seed
(`data-models.md` Decision 3).

An unknown `tagId` or `personId` is **not an error**: it narrows the result to
nothing, exactly as a real id with no matches would. Erroring would make the
route an existence oracle for a vocabulary, and would break a bookmarked
filter the moment somebody merged a tag.

**Response** `200`

```ts
type TimelineResponse = {
  days: TimelineDay[];
  /**
   * Encodes the last day returned plus the opened-milestone set. Null at the
   * end.
   */
  nextCursor: string | null;
  /**
   * What the whole selection is worth, for the filter strip. Null when no
   * filter is set, and null on any request carrying a cursor: the strip is
   * drawn once from the first page, and recounting on every page would repeat
   * the most expensive predicate in the slice for a number nobody re-reads.
   */
  resultCount: number | null;
};
```

`TimelineDay`, `DayMilestoneBand` and `DayMilestoneStrip` are in
§ Shared types in this slice. `ItemSummary`, `BurstSummary`, `MediaRef`,
`MemberRef`, `VisibilitySummary` and `MilestoneRef` are the frozen DTOs.

**Errors**

| Status | Code              | When                                                                                                                                                          |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request` | `limit` over 30; a malformed date; a cursor that does not decode, or whose filter digest does not match the query. `details.fieldErrors` names the parameter. |
| 401    | `not_signed_in`   | No session, or an expired one.                                                                                                                                |
| 429    | `rate_limited`    | 600 per minute per session, applied by the middleware.                                                                                                        |

No 403 and no 404 exist on this route. It addresses no row by id, and an
invisible item is simply absent from the page and from every count on it,
which is the same thing the 404 rule buys elsewhere
(`conventions.md` § Errors).

**Transformations**

1. **The day stream is a union, and days are derived.** There is no `days`
   table: a day is `GROUP BY captured_on` (`data-models.md` § `items`). The
   stream is the union of the distinct `captured_on` of visible items **and
   every date inside every overlapping milestone span**, so a milestone day
   with no items still appears and still has a date to be a cursor. Spans are
   expanded in the application, never materialised; milestones are tens of
   rows.

   **The union applies only when no tag and no person filter is set.** A date
   range alone is a window on the same timeline, so milestone-only days inside
   it survive and surface 2's `milestone-empty` state keeps working under a
   date range. A tag or a person is a content predicate, and a day with zero
   matching items is not a result: adding one would put an empty day in the
   middle of a result list whose strip says 88. Flagged in
   § Rulings, because the data model does not rule on it.

2. **One full milestone band per day, resolved by the server** (Decision 14).
   Of the milestones covering a day, the band is the one with the **narrowest
   span** that has not already taken a band on a day earlier in this same
   feed; ties break by **earliest start**. Everything else covering that day
   is a continuation strip carrying its own `dayPosition` and `dayCount`. This
   reproduces `reference/src/data/milestones.ts` `rankMilestonesForDay`
   exactly, including its `alreadyOpened` argument: what counts as opened is
   what **took a band** further up the feed, never merely what appeared there,
   so an occasion that has only ever been a strip still gets its full band on
   the next day it wins one. **The client must not re-derive any of this**; it
   draws `milestoneBand` and `milestoneStrips` as given.

   A consequence worth stating: the feed runs newest first, so "the first of
   its days you meet" is a multi-day occasion's **last** date. The band opens
   there and the strips descend with it. That is what the prototype does and
   this contract matches it.

3. **The band rule is feed-ordered, so the cursor carries state.** The cursor
   is base64url over `{ "d": <captured_on of the last day returned>,
"o": [<milestone ids that have taken a band>], "f": <digest of the
normalised filter> }`. `o` is pruned to milestones whose `starts_on` is
   strictly before `d`, since no other milestone can cover a later page, which
   keeps it at zero to two entries. `f` exists so a client that changes the
   filter without resetting the cursor gets a `400` instead of a page ranked
   against a different feed.

4. **A day is atomic.** `limit` counts days and a day never splits across
   pages, so the next page is `captured_on < :d`, strictly, rather than the
   `<=` the data model suggests for a splittable day. The pile has no in-day
   pagination affordance, and inventing one here would be a design change
   made in an API document. The guard against a very fat day is a soft budget:
   the server stops adding days once the running visible-item total passes
   400, but always returns at least one day, however large.

5. **`itemCount` is not `items.length`.** `itemCount` is every visible item on
   the day, burst frames included, because the spine's "212 photos" is a count
   of photographs and a burst is a rendering collapse rather than fewer
   pictures. `items` carries one entry per print the pile draws, so a
   forty-five frame burst contributes forty-five to `itemCount` and one entry
   to `items`.

6. **Bursts resolve at read time** (`data-models.md` § `bursts`). Frames are
   ordinary items, so they arrive already visibility-filtered; the burst row is
   never consulted to decide what to draw, only to read `cover_item_id`.
   - **Zero visible frames**: nothing is drawn and nothing is counted. This
     needs no code, which is the point of frames being items.
   - **One visible frame**: `burst` is `null` on that `ItemSummary` and it
     renders as a plain print. The server does **not** send a `BurstSummary`
     with `visibleFrameCount: 1`, so a stack of one is not something the
     client can accidentally draw.
   - **Two or more**: one entry whose `burst` is a `BurstSummary`. The cover is
     `bursts.cover_item_id` when that frame is visible, otherwise the earliest
     visible frame. `visibleFrameCount`, `startsAt` and `endsAt` are all
     computed over the **visible** frames only: a stored span would leak the
     restricted frames through its endpoints exactly as a stored count would
     through its denominator.
7. `VisibilitySummary.label` ("Just us two") is composed from the rule's
   subjects at read time, never stored (`data-models.md` § Visibility tables).
   Rules are massively shared, so a page of 212 prints resolves a handful of
   distinct rules.
8. `isUnseen` comes from an anti-join against `item_views` for this member.
   `unseenCount` is the same anti-join aggregated, so the spine's "31 new" and
   the dots on the prints are the same fact counted once.
9. **The empty archive.** With no visible days the body is exactly:

   ```json
   { "days": [], "nextCursor": null, "resultCount": null }
   ```

   **Assertion: a brand-new archive and a viewer restricted from everything
   produce byte-identical bodies on this route.** There is no field above that
   can differ, and none may be added: no `hiddenCount`, no `archiveIsEmpty`,
   no `firstCapturedOn`, no diagnostic (`conventions.md` § Forbidden in any
   payload). The copy that differs between surface 5's two states is chosen in
   the browser from the viewer's own role and the member list, never from this
   payload. Tests to write:
   - `timeline: a brand-new archive and a fully restricted viewer return byte-identical bodies`
   - `timeline: no response field varies with the existence of items the viewer cannot see`
   - `timeline: an item restricted to admins and people-tagged for the viewer is absent from that viewer's day and from its itemCount` (named by `data-models.md` § The evaluation)

10. **The end of the archive** is `nextCursor: null` on an unfiltered request.
    The figures surface 2's `end` state prints (total items, total days, the
    first day) are summed in the browser from `GET /api/timeline/rail`, which
    has already scanned exactly that. They are deliberately **not** fields
    here: a totals object on an empty archive would be a second place the two
    empty states could drift apart.

**Performance**

One page is a constant six to eight queries regardless of how many days and
items it holds. None of them is per item, per day or per burst.

| #   | Query                                                                                        | Notes                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Candidate days: `GROUP BY captured_on` with `COUNT(*)` and the unseen anti-join, `LIMIT n+1` | Rides `(captured_on DESC, visibility_rule_id, id)`; the group-by runs in index order and the limit stops early. The `item_views` join is `LEFT JOIN ... ON v.item_id = i.id AND v.member_id = :me`, **in the `ON` clause**: in the `WHERE` it becomes an inner join and every seen item disappears. |
| 2   | Milestones overlapping the page window                                                       | Tens of rows, `INDEX (starts_on, ends_on)`. Spans expanded in the application, then merged with query 1's dates and re-sorted before the page is cut.                                                                                                                                               |
| 3   | Items for the chosen days                                                                    | `captured_on IN (:days)` plus the predicate. Returns every visible frame, so burst grouping and the cover choice happen in process with no further query.                                                                                                                                           |
| 4   | `bursts.cover_item_id` for the burst ids on the page                                         | Tens of rows at most.                                                                                                                                                                                                                                                                               |
| 5   | **Signed URLs: one batched `item_renditions WHERE item_id IN (:drawnItemIds)`**              | Keyed by the ids actually drawn, so a collapsed burst costs one item's renditions rather than forty-five. **Never one join per print.** Signing itself is in-process HMAC.                                                                                                                          |
| 6   | Subjects for the distinct `visibility_rule_id` values on the page                            | A handful of rules even on a 212-item day, because rules are shared.                                                                                                                                                                                                                                |
| 7   | Per-viewer `itemCount` for the milestones taking a **band** on this page                     | `GROUP BY milestone_id` over `item_milestones` joined to visible items. Strips print no count, so they cost nothing.                                                                                                                                                                                |
| 8   | `resultCount`, first page of a filtered request only                                         | The same predicate without the limit.                                                                                                                                                                                                                                                               |

Uploader `MemberRef`s are served from the per-request member map (tens of
rows, read once), not joined per item.

**Filtering uses `EXISTS`, one per selected tag and one per selected person,
never repeated joins**: repeated joins fan out and turn a count into a
multiple of itself, and each `EXISTS` is a single index probe.
`item_tags` and `item_people` are indexed **both ways** precisely so the
planner can drive from whichever predicate is most selective
(`data-models.md` § `tags`, `item_tags`, `people`, `item_people`); run `ANALYZE`
and let it choose rather than hinting.

```sql
  AND (i.visibility_rule_id IN (:visibleRuleIds) OR i.uploaded_by = :viewerMemberId)
  AND i.captured_on >= :from AND i.captured_on <= :until
  AND EXISTS (SELECT 1 FROM item_tags   t WHERE t.item_id = i.id AND t.tag_id   = :tag1)
  AND EXISTS (SELECT 1 FROM item_people p WHERE p.item_id = i.id AND p.person_id = :person1)
```

Payload size is the real constraint rather than query time: a 212-item day is
roughly 150 KB of JSON once every `MediaRef` carries a thumb and a display
URL, which is what the 400-item soft budget exists to cap.

---

#### `GET /api/timeline/rail`

**Surface** 2 `timeline`, every state (the rail never leaves), and the figures
under `end`
**Auth** session required · **Role** viewer

**Request**

```ts
type TimelineRailRequest = {
  query: {
    /**
     * The same filter state as the timeline, so the rail matches the pile under
     * it.
     */
    tags?: string[];
    people?: string[];
    from?: string;
    until?: string;
  };
};
```

`limit` and `cursor` are **rejected**, not ignored. The rail's whole job is to
be complete; a paginated rail cannot be jumped through, and silently accepting
the parameters would let somebody build one by accident.

**Response** `200`

```ts
type TimelineRailResponse = {
  days: RailDay[];
  /** Always null. Present only to satisfy the collection envelope. */
  nextCursor: null;
};
```

**Errors**

| Status | Code              | When                                               |
| ------ | ----------------- | -------------------------------------------------- |
| 400    | `invalid_request` | A malformed date, or `limit` or `cursor` supplied. |
| 401    | `not_signed_in`   | No session, or an expired one.                     |
| 429    | `rate_limited`    | 600 per minute per session.                        |

**Transformations**

- The same day stream as `GET /api/timeline`, same union rule, same counts,
  without items. A milestone-only day appears with `itemCount: 0` and is
  jumpable, which is the point.
- **No totals field.** Surface 2's `end` block sums `itemCount`, takes
  `days.length` and reads the last entry's `capturedOn` for "the first day
  anything went up". Surface 6's `open` state reads the same three numbers.
  Deriving them costs nothing over 948 entries and keeps the empty response
  down to `{ "days": [], "nextCursor": null }`, with nothing in it that could
  distinguish an empty archive from an invisible one.

**Performance**

The first query in the product that will hurt (`data-models.md` § The queries
that will hurt first): a covering scan of roughly 50,000 index entries on
`(captured_on DESC, visibility_rule_id, id)`, plus the milestone expansion.
Single-digit milliseconds, unbounded in day count, and **the first thing to
cache**.

Cache the unfiltered response per `(memberId, visibilityGeneration)`, which is
already the cache key for the rule expansion, invalidated additionally by any
item insert or delete through a single in-process counter bumped on the write
paths, with a short TTL as a backstop. A filtered rail is **not** cached: it
shares the filter query's plan, is requested far less often, and caching it
would multiply the key space by the selection.

---

## Filtering and the vocabularies

#### `GET /api/filters/facets`

**Surface** 6 `filter`, states `open`, `tag`, `person`, `dates`, `several`,
`none`; surface 2 `timeline`, state `filtered` (the strip's total)
**Auth** session required · **Role** viewer

**Request**

```ts
type FilterFacetsRequest = {
  query: {
    /**
     * The selection as it stands. Identical parameters to GET /api/timeline.
     */
    tags?: string[];
    people?: string[];
    from?: string;
    until?: string;
  };
};
```

**Response** `200`

```ts
type FilterFacetsResponse = {
  tags: TagFacet[];
  people: PersonFacet[];
  /**
   * What the current selection is worth. The figure in the filter strip. Zero
   * is a real answer.
   */
  resultCount: number;
};
```

**Errors**

| Status | Code              | When                           |
| ------ | ----------------- | ------------------------------ |
| 400    | `invalid_request` | A malformed date.              |
| 401    | `not_signed_in`   | No session, or an expired one. |
| 429    | `rate_limited`    | 600 per minute per session.    |

An unknown tag or person id in the selection is not an error here either, for
the same reason as on the timeline.

**Transformations**

1. **Counts narrow** (Decision 13). `narrowedCount` is what **adding that chip
   to the current selection** would leave, not what the chip is worth on its
   own, so `beach 0` is visible before anybody presses it and the no-results
   dead end is unreachable by accident.
2. **A zero-count chip stays on the row and goes quiet.** The server returns
   every chip every time, including the zeros. Dropping them would reshuffle a
   row under somebody's finger, and `0` is itself the answer to "is there
   anything from the beach with Abuela in it".
3. **The row's order never changes with the selection.** Both arrays are
   ordered by the viewer's **unfiltered** count descending, then display name,
   and that order is held across every recomputation. The unfiltered figures
   come from the same cached aggregate that serves `GET /api/tags` and
   `GET /api/people`, so holding the order costs no live query.
4. **A selected chip carries no count.** `narrowedCount` is `null` exactly
   when `isSelected` is true, because the result strip already states what the
   selection is worth and a second number beside it would be the same figure
   said twice or, worse, a different one. `ownCount` is the mirror image: it
   is sent **only** on selected chips, where surface 6's `none` state needs it
   to say "Elena is in 23 photographs and there are 141 tagged beach, but none
   of them are the same ones". Exactly one of the two is non-null on every
   chip, which is what stops a client rendering the wrong number.
5. Selections AND across and within dimensions: two tags means both tags, and
   a tag plus a person plus a date range means all three. That is what makes
   `none` reachable and what its copy is about.

**Performance**

The most expensive query on the filter surface (`data-models.md` § The queries
that will hurt first): `GROUP BY tag_id` over `item_tags` joined to visible
items, roughly 150,000 rows at three tags per item. **10 to 30 ms**, and it
runs again on every filter change rather than once, which is the accepted cost
of Decision 13.

The saving grace is that **every chip's narrowed count comes out of one pass,
not one query per chip**. Grouping by `tag_id` over the already-selected item
set yields `|selection ∩ tag|` for every tag simultaneously, which is exactly
the narrow semantics. So an active selection is three live queries:

| #   | Query                                                           |
| --- | --------------------------------------------------------------- |
| 1   | `GROUP BY tag_id` over `item_tags` joined to the selection      |
| 2   | `GROUP BY person_id` over `item_people` joined to the selection |
| 3   | `COUNT(*)` over the selection, for `resultCount`                |

With nothing selected, all three are served from the cached unfiltered
aggregate and no live query runs at all, which is why surface 6's `open` state
is instant.

**Debounce expectation:** the free-text field debounces at **250 ms** on the
trailing edge and cancels any request in flight. A chip press or a date change
fires **immediately and undebounced**: a press is a deliberate act and has to
feel like one, and at 10 to 30 ms it does. In-flight responses are discarded
if a newer selection has been made, so the row cannot settle on a stale set of
numbers.

---

#### `GET /api/tags`

**Surface** 6 `filter`, all states (the search field's vocabulary)
**Auth** session required · **Role** viewer

**Request**

```ts
type TagsRequest = {
  query: {
    /** Substring match on the normalised name, for the type-ahead. */
    q?: string;
  };
};
```

**Response** `200`

```ts
type TagsResponse = {
  tags: TagCount[];
  /** Always null: see Transformations. */
  nextCursor: null;
};
```

**Errors**

| Status | Code            | When                           |
| ------ | --------------- | ------------------------------ |
| 401    | `not_signed_in` | No session, or an expired one. |
| 429    | `rate_limited`  | 600 per minute per session.    |

**Transformations**

- `itemCount` is the viewer's own count. A tag whose every item is restricted
  from this viewer reads `0` and stays in the vocabulary, for the same reason
  a zero chip stays on the row.
- Ordered by `itemCount DESC, nameNormalized ASC`.
- **Not paginated, deliberately.** The aggregate scans `item_tags` whole
  whichever page is asked for, so cursoring saves serialisation and nothing
  else, while a partial vocabulary makes a type-ahead lie. The vocabulary is
  bounded by how much a family types, not by how much it photographs. If a bad
  import ever pushes it past 500 rows the tail is cut and `nextCursor` starts
  carrying the keyset `(itemCount, nameNormalized)`; that is a defect signal
  rather than a paging need.
- `q` matches `tags.name_normalized` (trimmed, lowercased,
  whitespace-collapsed, NFC), which is the column that exists so "Hospital"
  and "hospital" are one tag.

**Performance**

The same `GROUP BY tag_id` over `item_tags` as the facets route, and the same
10 to 30 ms. Cache it per `(memberId, visibilityGeneration)` plus the item
generation counter; that one cached result also supplies the facets row's
stable ordering, so the two routes share a single aggregate rather than
computing it twice.

---

## People

#### `GET /api/people`

**Surface** 7 `people`, states `all`, `zero`, `narrowed`; surface 6 `filter`,
the "Who is in it" chip row's vocabulary
**Auth** session required · **Role** viewer

**Request**

```ts
type PeopleRequest = {
  query: {
    /** Narrows the directory by name. Surface 7's `narrowed` state. */
    q?: string;
  };
};
```

**Response** `200`

```ts
type PeopleResponse = {
  people: DirectoryPerson[];
  /** Always null. The directory is tens of rows. */
  nextCursor: null;
  /**
   * Everybody in the directory, before `q` narrows it, so surface 7 can say
   * "6 of 10 people" and nobody concludes somebody has been removed. Not a
   * per-viewer figure, and that is correct: a person's existence is not
   * visibility-scoped, only their photographs are.
   */
  peopleCount: number;
};
```

**Errors**

| Status | Code            | When                           |
| ------ | --------------- | ------------------------------ |
| 401    | `not_signed_in` | No session, or an expired one. |
| 429    | `rate_limited`  | 600 per minute per session.    |

**Transformations**

1. **`memberId` is absent from every entry**, which is why `DirectoryPerson`
   wraps the frozen `PersonRef` and adds nothing that could stand in for one.
   Members and non-members are drawn identically: holding an account is a
   permission fact and this is a family
   (`data-models.md` § `tags`, `item_tags`, `people`, `item_people`).
2. **The face resolves at read time**, and it is the visibility hazard on this
   surface: `preferred_face_item_id` **if that item is visible to this
   viewer**, otherwise the most recent visible item tagged with that person,
   otherwise `null` and the client draws the ghost frame it already has. A
   preferred face served without the check is a restricted photograph
   published as a directory thumbnail.
3. `itemCount`, `firstCapturedOn` and `lastCapturedOn` are per viewer. A
   person with visible items reads their own figures; a person with none reads
   `0` and two nulls, which is surface 7's `zero` state.
4. Ordered by `itemCount DESC, displayName ASC`, so the people with nothing
   sort to the end rather than being hidden.
5. `q` is applied **in the application** over the fetched rows, not in SQL.
   The directory is tens of rows, so the filter is free, it makes
   `peopleCount` free with it, and it gets "Sofía" and "Papá" right, which
   SQLite's ASCII-only `LIKE` case folding would not.

**Performance**

The third query that will hurt (`data-models.md` § The queries that will hurt
first): roughly 100,000 rows through `people LEFT JOIN item_people LEFT JOIN
items`.

> **The single most likely bug in this slice.** The visibility predicate must
> sit in the **`ON` clause of the `items` join, not in the `WHERE`**. In the
> `WHERE` it filters away the null-extended rows, the left join collapses to an
> inner join, and **everybody with no visible items disappears**, including the
> person with none at all who is the entire point of surface 7's `zero` state.
> The bug is invisible in any fixture where every person has at least one
> visible photograph, which is every fixture anybody writes by hand.
>
> Its quieter twin: the count must be **`COUNT(i.id)`, never `COUNT(*)`**.
> `COUNT(*)` counts the null-extended row as one and gives every photographed
> person a floor of `1`, so "Nothing yet" becomes "1 photo and video" and the
> `zero` state dies a second death.

```sql
SELECT p.id, p.display_name,
       COUNT(i.id)        AS item_count,
       MIN(i.captured_on) AS first_captured_on,
       MAX(i.captured_on) AS last_captured_on
FROM people p
LEFT JOIN item_people ip ON ip.person_id = p.id
LEFT JOIN items i
       ON i.id = ip.item_id
      AND (i.visibility_rule_id IN (:visibleRuleIds) OR i.uploaded_by = :viewerMemberId)
GROUP BY p.id
```

Tests to write:

- `people: a person with no item_people rows at all appears in the directory with itemCount 0`
- `people: a person whose every item is invisible to the viewer reads 0, not 1`
- `people: a person whose preferred face is invisible to the viewer falls back to their most recent visible item`
- `people: a person with no visible item at all returns face null rather than a signed URL`

Four batched queries, constant in the number of people:

| #   | Query                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The aggregate above                                                                                                                                          |
| 2   | Which `preferred_face_item_id` values are visible: `WHERE id IN (...)` plus the predicate                                                                    |
| 3   | The most recent visible item per person still needing a face, as one grouped argmax over `item_people` joined to visible items, **not one query per person** |
| 4   | `item_renditions WHERE item_id IN (:faceItemIds)`, one batch, then sign in process                                                                           |

---

## The seen latch

#### `POST /api/items/seen`

**Surface** 2 `timeline`, every state (the accent dots and the spine's "31
new")
**Auth** session required · **Role** viewer

**Request**

```ts
type ItemsSeenRequest = {
  body: {
    /** Items the viewer has actually had on screen. At most 500. */
    itemIds: string[];
    /**
     * Bursts drawn as a collapsed stack. Expanded to their visible frames on
     * the server, so a stack standing for forty-five frames latches all of
     * them without the client ever holding forty-five ids.
     */
    burstIds?: string[];
  };
};
```

**Response** `204`, no body. There is genuinely nothing to return
(`conventions.md` § Envelope), and see below for why there had better not be.

**Errors**

| Status | Code              | When                                            |
| ------ | ----------------- | ----------------------------------------------- |
| 400    | `invalid_request` | More than 500 ids, or an id that is not a uuid. |
| 401    | `not_signed_in`   | No session, or an expired one.                  |
| 429    | `rate_limited`    | 600 per minute per session.                     |

**This route takes item-derived ids and deliberately returns no 404.** An id
that does not exist, and an id the viewer's predicate excludes, are both
**silently ignored**. Per-id feedback of any kind, a 404, a partial-success
body, even a count of rows written, would turn a batch endpoint into a
visibility oracle: post one id, read the number back, learn whether a
photograph exists that you are not allowed to see. That is exactly what the
404 rule elsewhere in the contract exists to prevent
(`conventions.md` § Errors), and the only shape that cannot leak here is one
that reports nothing at all. The filtering happens inside the statement rather
than in a pre-check, so there is no branch anybody can add a log line to.

**Transformations**

One statement, `INSERT ... ON CONFLICT DO NOTHING`, with the visibility
predicate in the `SELECT` that feeds it:

```sql
INSERT INTO item_views (id, member_id, item_id, first_seen_at)
SELECT :uuid7, :viewerMemberId, i.id, :now
FROM items i
WHERE (i.id IN (:itemIds) OR i.burst_id IN (:burstIds))
  AND (i.visibility_rule_id IN (:visibleRuleIds) OR i.uploaded_by = :viewerMemberId)
ON CONFLICT (member_id, item_id) DO NOTHING;
```

`first_seen_at` is set once and never updated, and there is no `last_seen_at`
by design: maintaining one would reintroduce a write on every impression,
which is the entire cost the collapse avoids
(`data-models.md` § `item_views`). `first_opened_at`, `last_opened_at` and
`open_count` belong to the item viewer and are not touched here.

**Performance**

**Steady-state browsing must cost zero writes, including zero requests.** The
latch is one-way, so scrolling a 212-item day writes 212 rows the first time
and nothing ever again; the client goes further and **suppresses the request
entirely** when no print in the batch is showing an accent dot, which it knows
from `ItemSummary.isUnseen` without asking. A familiar archive therefore
generates no traffic on this route at all, which matters because SQLite has a
single writer and that writer is also taking uploads.

The one gap is the collapsed burst: the stack draws one cover for frames the
client has no `isUnseen` for, so it cannot tell whether sending is pointless.
`BurstSummary.hasUnseenFrames` closes it, and is requested below. Without it
the client must either send `burstIds` unconditionally, costing one no-op
`INSERT` and one write-lock acquisition per page view, or leave unfanned
frames permanently new, which is the drained-accent failure Decision 3 exists
to prevent.

---

## Shared types in this slice

```ts
type TimelineDay = {
  /**
   * `YYYY-MM-DD`, local to the Shoebox timezone. The grouping key and the
   * cursor value.
   */
  capturedOn: string;
  /**
   * Every visible item on the day, burst frames counted individually. Not
   * `items.length`: a collapsed burst is one entry and forty-five items.
   */
  itemCount: number;
  /** Visible items this viewer has no `item_views` row for. Drives "31 new". */
  unseenCount: number;
  /** One at most, resolved by the server. Decision 14. */
  milestoneBand: DayMilestoneBand | null;
  /** Every other occasion covering this day, as continuation strips. */
  milestoneStrips: DayMilestoneStrip[];
  /** One entry per print the pile draws. Empty on a milestone-only day. */
  items: ItemSummary[];
};

type DayMilestoneBand = {
  milestone: MilestoneRef;
  /** 1-based position of this day within the span. */
  dayPosition: number;
  /** Total days in the span, both ends counted. 1 for a one-day occasion. */
  dayCount: number;
  /** The whole occasion's per-viewer total, for the band's "212 items". */
  itemCount: number;
};

type DayMilestoneStrip = {
  milestone: MilestoneRef;
  dayPosition: number;
  dayCount: number;
  /**
   * No itemCount: the strip prints "day 3 of 5" and a name, and nothing else.
   */
};

type RailDay = {
  capturedOn: string;
  /** Per viewer. `0` on a milestone-only day, which is still jumpable. */
  itemCount: number;
};

type TagFacet = {
  tag: TagRef;
  isSelected: boolean;
  /**
   * What adding this chip to the selection would leave. Null iff isSelected.
   */
  narrowedCount: number | null;
  /** The chip's worth with no filters at all. Non-null iff isSelected. */
  ownCount: number | null;
};

type PersonFacet = {
  person: PersonRef;
  isSelected: boolean;
  narrowedCount: number | null;
  ownCount: number | null;
};

type TagCount = {
  tag: TagRef;
  /** Per viewer. A tag whose every item is restricted reads 0 and stays. */
  itemCount: number;
};

type DirectoryPerson = {
  /**
   * PersonRef carries no memberId, which is the whole reason it is the frozen
   * shape here.
   */
  person: PersonRef;
  itemCount: number;
  /** Null when itemCount is 0. */
  firstCapturedOn: string | null;
  lastCapturedOn: string | null;
  /**
   * One object, not a MediaRef: the card draws a decorative thumbnail with an
   * empty alt and never opens it, so the display URL, the video sources and the
   * generated alt text would all be minted unread. Null draws the ghost frame.
   */
  face: MediaSource | null;
};
```

Schema names to generate after the merge: `timelineResponseSchema`,
`timelineRailResponseSchema`, `filterFacetsResponseSchema`, `tagsResponseSchema`,
`peopleResponseSchema`, `itemsSeenRequestSchema`, plus `timelineDaySchema`,
`dayMilestoneBandSchema`, `dayMilestoneStripSchema`, `railDaySchema`,
`tagFacetSchema`, `personFacetSchema`, `tagCountSchema`,
`directoryPersonSchema`.

## Additions requested to the frozen DTOs

1. **`BurstSummary.hasUnseenFrames: boolean`.** Whether any visible frame of
   this burst has no `item_views` row for this viewer. Without it the
   collapsed stack is the one place the client cannot tell whether
   `POST /api/items/seen` would do anything, so it must either send on every
   page view (breaking "steady-state browsing costs zero writes") or never
   send (leaving forty-four frames permanently new, which is the drained
   accent Decision 3 exists to prevent). It also lets the stack carry a dot,
   which a day saying "31 new" arguably owes the object holding twelve of
   them. Cost: the anti-join the timeline already runs, aggregated per burst,
   no extra query.

2. **A doc-comment clarification on `BurstSummary.startsAt` / `endsAt`**, no
   shape change. The comment currently marks only `visibleFrameCount` as per
   viewer. The span must be too: it is `MIN`/`MAX` of `captured_at` over the
   **visible** frames, not `bursts.starts_at` / `ends_at`. Serving the stored
   columns leaks the restricted frames through the endpoints of "06:41 to
   06:44" in the same way a stored count would leak them through a
   denominator, and the stored columns are right there, correctly named, and
   will be used by whoever writes this fast.

Nothing else is missing. `MilestoneRef` lacks a per-viewer `itemCount`, and
`DayMilestoneBand` wraps it rather than widening it, which is the pattern the
conventions ask for.

## Rulings

1. **The milestone-span union survives a date filter and not a content
   filter: confirmed as ruled here.** A date range alone keeps milestone-only
   days, because surface 2's `milestone-empty` under a date window is a real
   state. A tag or person filter drops them, because a day with zero matching
   items is not a result and would read as a bug beside a strip saying 88.
   `data-models.md` states the union for the timeline without saying what a
   filter does to it, and this is now the answer.

2. **Fanning a burst: closed on merge, and the path differs from the guess.**
   `GET /api/bursts/:burstId/frames` is in the items slice, returning
   `ItemSummary[]` ordered by `burst_index`, filtered by the same predicate,
   404 on a burst with no visible frames. Cite that path, not
   `/api/bursts/:burstId/items`.

3. **A page left open re-requests itself; there is no refresh route.** When
   `MediaSource.expiresAt` passes, the client refetches the affected page **in
   place** and merges by id, which keeps scroll because nothing navigates. A
   dedicated re-signing route would need its own visibility evaluation and its
   own answer for an item that became invisible while the page sat there, and
   refetching gets both for free and correct.

   The signed-URL lifetime should be comfortably longer than an uninterrupted
   scroll so the ordinary case never hits this, and short enough that the
   bearer-link trade `architecture.md` § Where data lives accepts stays small.
   One hour satisfies both.

4. **"with her" in the day spine becomes the person's own name.** A surface
   fix, not an API one: nothing in the schema knows a person's gender and
   nothing should learn it for one preposition. The spine reads the name it is
   already filtered by. `reference/src/surfaces/FilterSearch.tsx` is updated.

5. **`peopleCount` is not per viewer, and that is now written down.**
   `conventions.md` § The three documented exceptions carries it, so the next
   reader who notices it looks like a violation of the rule that outranks the
   others finds the reason instead of filing a bug.
