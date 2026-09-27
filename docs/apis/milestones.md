# Milestones

Surface 14 and nothing else: creating an occasion from nothing or from a
selection, editing its name, blurb and span, attaching and detaching items,
reconciling items captured outside the span, deleting it, and the resolved band
shape the timeline consumes. Not here: the timeline itself and where the band
hangs in a day (agent B); the single-item capture-date correction on the item
viewer (agent C), which shares this slice's move machinery; the upload flow's
in-line milestone creation (agent D), which calls `POST /api/milestones` and
nothing else; and item search by tag, person or free text, which belongs to the
filter slice. Two sentences govern everything below and are repeated where they
bite: **a milestone's item set is the join table, never a date range**, and **a
milestone's day set is the date range, never the join table**. A milestone has
no visibility of its own (Decision 5), so no DTO here carries a visibility
field and no query here filters a milestone row by viewer; only the counts
inside it are per viewer.

## Routes

`401 not_signed_in` and `429 rate_limited` are applied by the middleware to
every route below and are omitted from the individual error tables. `uploader`
in the Role column means uploader or admin: an admin holds every uploader right
(`spec.md` § Who can do what), and authorisation never keys on `created_by`,
which is SET NULL by design (`data-model.md` § `milestones`).

| Method and path                               | Auth    | Role     | States                    | Purpose                                                                 |
| --------------------------------------------- | ------- | -------- | ------------------------- | ----------------------------------------------------------------------- |
| `GET /api/milestones`                         | session | viewer   | `list`, `empty`           | The list, with per-viewer item counts.                                  |
| `POST /api/milestones`                        | session | uploader | `create`, `create-span`   | From nothing, or from a selection of items.                             |
| `GET /api/milestones/:milestoneId`            | session | viewer   | `edit`, `empty`, `delete` | One occasion, with the counts the edit form and the delete dialog need. |
| `PATCH /api/milestones/:milestoneId`          | session | uploader | `edit`, `fix`             | Name, blurb, dates. Widening the occasion is this route.                |
| `DELETE /api/milestones/:milestoneId`         | session | uploader | `delete`                  | Removes the label. Removes no photograph.                               |
| `PATCH /api/milestones/:milestoneId/items`    | session | uploader | `created`, `attach`       | Attach and detach, both directions named explicitly.                    |
| `GET /api/milestones/:milestoneId/candidates` | session | uploader | `created`, `attach`       | What to offer the picker: the span's days, or the whole archive.        |
| `GET /api/milestones/:milestoneId/mismatches` | session | uploader | `fix`                     | Attached items captured outside the span, unacknowledged.               |
| `POST /api/milestones/:milestoneId/reconcile` | session | uploader | `fix`                     | Move the items onto the occasion, or acknowledge them.                  |

All nine states of surface 14 are covered: `list`, `create`, `create-span`,
`created`, `fix`, `edit`, `attach`, `empty`, `delete`.

## The occasion

#### `GET /api/milestones`

**Surface** 14 `milestones`, states `list`, `empty`
**Auth** session required · **Role** viewer
**Request**

```ts
/** Query. No body, no path params. */
type ListMilestonesRequest = {
  /** Default 50, capped at 200. Tens of rows exist, so one page is the norm. */
  limit?: number;
  /** Opaque. Encodes `(startsOn, milestoneId)`: see Transformations. */
  cursor?: string;
  /** Inclusive `YYYY-MM-DD`. Every milestone whose span overlaps the range. */
  from?: string;
  to?: string;
};
```

**Response** `200`

```ts
type ListMilestonesResponse = {
  milestones: MilestoneSummary[];
  nextCursor: string | null;
};
```

**Errors**

| status | code              | when                                                                                      |
| ------ | ----------------- | ----------------------------------------------------------------------------------------- |
| 400    | `invalid_request` | `limit` out of range, a malformed cursor, a date not `YYYY-MM-DD`, or `to` before `from`. |

**Transformations**

- **No visibility clause touches `milestones`.** Every member sees every
  occasion, including ones whose every attached photograph is restricted from
  them. The rejected alternative made a previously empty occasion vanish from
  everybody else's timeline the moment one restricted photograph was attached
  (Decision 5). A consequence worth stating once: `itemCount: 0` on a milestone
  nobody has attached anything to and `itemCount: 0` on a milestone whose 46
  photographs are all restricted from this viewer are byte-identical on the
  wire, which is what the counting rule requires
  (`data-model.md` § One rule that outranks the others).
- `itemCount` is a per-viewer aggregate computed at read time and may never
  become a column (`data-model.md` § Notes for whoever writes the API contract).
- `dayCount` is `endsOn - startsOn + 1`, always at least 1, because
  `CHECK (ends_on >= starts_on)` holds. It is served rather than left to the
  client only so that this slice and agent B's band print the same "of M".
- Ordered `starts_on DESC, id DESC`: the date is the primary fact the list is
  built around, so it is the sort key rather than creation order. The cursor
  therefore departs from the id default stated in the conventions and encodes
  the pair `(startsOn, milestoneId)`, which is the only pair that makes the
  order total. Ids are uuidv7, so the id half breaks a same-date tie by
  creation (`data-model.md` § Conventions).
- `canEdit` and `canDelete` are `viewer.role !== "viewer"` and are therefore
  the same on every row. They are served anyway, matching `CommentDto`, and
  they are deliberately not a function of `created_by`: a milestone outlives
  whoever typed it and `created_by` is nullable.

**Performance** One indexed scan for the rows, using `(starts_on, ends_on)`
when `from`/`to` are given and a scan of tens of rows otherwise. Then **one**
batched aggregate for every per-viewer count, never one query per milestone:
`SELECT im.milestone_id, COUNT(*) FROM item_milestones im JOIN items i ON i.id = im.item_id WHERE im.milestone_id IN (...) AND <visibility predicate> GROUP BY im.milestone_id`,
with absent keys read as zero. This is the same N+1 trap as `Group.usedByRules`
(`data-model.md` § Notes for whoever writes the API contract). `mismatchCount`
is deliberately **not** on this route: it needs a second grouped query and the
list surface does not show it.

#### `POST /api/milestones`

**Surface** 14 `milestones`, states `create`, `create-span`
**Auth** session required · **Role** uploader
**Request**

```ts
/** Body. No path params, no query. */
type CreateMilestoneRequest = {
  /** Trimmed, 1 to 120 characters. Never checked for uniqueness. */
  name: string;
  /** `YYYY-MM-DD`, inclusive. */
  startsOn: string;
  /**
   * `YYYY-MM-DD`, inclusive, and equal to `startsOn` for a one-day occasion.
   * Required.
   */
  endsOn: string;
  /** Trimmed, up to 280 characters. An empty string is stored as null. */
  blurb: string | null;
  /** Optional: create from a selection. Up to 500 ids. */
  itemIds?: string[];
};
```

**Response** `201` `MilestoneDetail`

**Errors**

| status | code                  | when                                                                                                                                                                                |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`     | An empty name after trimming, a date that is not `YYYY-MM-DD`, `endsOn` before `startsOn` (`details.fieldErrors.endsOn`), a duplicate id in `itemIds`, or more than 500 ids.        |
| 403    | `milestone_forbidden` | The viewer's role is `viewer`.                                                                                                                                                      |
| 404    | `item_not_found`      | Any id in `itemIds` does not exist **or the viewer may not see it**. Byte-identical in both cases, and the whole request is rejected so that nothing distinguishes which id it was. |

**Transformations**

- **`endsOn` is required and may not be null.** The create form holds
  `endsOn: string | null` while its "it ran over more than one day" switch is
  off (`prototypes/src/system/MilestoneDates.tsx`), and collapsing that to
  `startsOn` is the client's job. Accepting a null here would put the
  collapsing rule in two places, and `ends_on` not-null-and-equal-for-one-day
  is the span model itself (`data-model.md` § `milestones`).
- **The server never derives the span from `itemIds`.** The form pre-fills the
  dates from the selection's capture days and then lets the user move them off,
  which `MilestoneDateFields` calls out in ordinary type rather than as an
  error. Deriving would overwrite a deliberate choice.
- Items outside the span are attached anyway, with
  `span_mismatch_acknowledged_at` null, which is what makes the response's
  `mismatchCount` non-zero and lets the surface offer the fix flow immediately.
  The form already promises this: "You will be asked afterwards whether to move
  the dates or move the photographs."
- **The name is visible to everybody, and that is a contract line rather than
  copy.** There is no `visibility_rule_id` on `milestones` and no route in this
  document filters a milestone row by viewer.
- **No uniqueness check on `name`, ever.** Two "Mateo's birthday" milestones a
  year apart are both correct (`data-model.md` § `milestones`).
- `created_by` is the viewer. It is recorded, displayed, and never consulted
  for authorisation.
- Not written to `activity_events`. The Destruction family records
  `milestone_deleted`; there is no `milestone_created` kind
  (`data-model.md` § `activity_events`).
- Agent D's upload flow calls this route and nothing else. The row is written
  the moment the name is typed rather than at ingest, because the upload
  surface promises "It appears in the timeline on those dates straight away",
  and an abandoned batch therefore leaves an empty milestone behind. That is a
  designed state, not an error, and is the deliberate asymmetry with new tags
  and people (`data-model.md` § `upload_batch_edits`).

**Performance** One insert, plus one `INSERT ... SELECT` into `item_milestones`
for the whole selection when `itemIds` is present, never a loop. One
transaction. The visibility check on `itemIds` is a single
`SELECT id FROM items WHERE id IN (...) AND <visibility predicate>` whose
row count must equal the request's, which costs one query rather than one per
id.

#### `GET /api/milestones/:milestoneId`

**Surface** 14 `milestones`, states `edit`, `empty`, `delete`
**Auth** session required · **Role** viewer
**Request** `type GetMilestoneRequest = { /** Path. */ milestoneId: string }`
**Response** `200` `MilestoneDetail`

**Errors**

| status | code                  | when                                                                         |
| ------ | --------------------- | ---------------------------------------------------------------------------- |
| 404    | `milestone_not_found` | No such row. There is no visibility case here, because a milestone has none. |

**Transformations**

- Feeds three states from one shape: the edit form's three fields, the empty
  state's band preview, and the delete dialog's count.
- **The delete dialog's number is `itemCount`, which is per viewer.** The
  dialog reads "The 212 photographs attached to it stay exactly where they
  are". An admin sees 212 and a restricted viewer sees 204, and that is
  correct; the alternative is a side channel saying how much exists beyond what
  you can open.
- **No item list, and no day list.** A milestone has no view of its own
  (`spec.md` § The archive), so there is nothing to page here. The day set is
  the date range, never the join table, so the client derives the days from
  `startsOn` and `endsOn` exactly as `prototypes/src/data/milestones.ts`
  already does; serving a day array would invite somebody to build it from the
  attachments instead.
- `mismatchCount` counts attached items that this viewer can see, whose
  `captured_on` falls outside `[startsOn, endsOn]`, and whose
  `span_mismatch_acknowledged_at` is null.

**Performance** Three queries, fixed: the row, the batched per-viewer
`itemCount`, and the batched per-viewer `mismatchCount` (the same join plus
`AND (i.captured_on < m.starts_on OR i.captured_on > m.ends_on) AND im.span_mismatch_acknowledged_at IS NULL`).
No N+1.

#### `PATCH /api/milestones/:milestoneId`

**Surface** 14 `milestones`, states `edit`, `fix`
**Auth** session required · **Role** uploader
**Request**

```ts
/** Path `milestoneId`, plus a body in which every field is optional. */
type UpdateMilestoneRequest = {
  name?: string;
  startsOn?: string;
  endsOn?: string;
  blurb?: string | null;
};
```

**Response** `200` `MilestoneDetail`

**Errors**

| status | code                  | when                                                                                                                                                    |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`     | An empty body, an empty name after trimming, a malformed date, or a **merged** pair where `endsOn` is before `startsOn` (`details.fieldErrors.endsOn`). |
| 403    | `milestone_forbidden` | The viewer's role is `viewer`.                                                                                                                          |
| 404    | `milestone_not_found` | No such row.                                                                                                                                            |

**Transformations**

- Either date may be sent alone. The server merges it with the stored value and
  validates the **merged** pair against `CHECK (ends_on >= starts_on)`, so a
  request that would narrow the span past its other end is a 400 rather than a
  constraint error.
- **This is the whole of "widen the occasion to cover them".** The fix flow's
  three buttons land on two different routes: "Move the N" and "Leave them as
  they are" are `POST /reconcile`, and "Widen the occasion" is this route,
  carrying the span `GET /mismatches` computed. It is one `UPDATE milestones`
  with **no fan-out**: zero rows in `item_milestones`, zero in `items`, zero in
  `item_capture_date_changes`. Editing an occasion never touches the
  photographs pointing at it.
- **Deliberately not audited.** The two dates are user-authored facts that the
  edit form already lets anybody with the role change freely
  (`data-model.md` § `item_capture_date_changes`). There is no
  `milestone_updated` kind and one must not be added to make this symmetrical
  with the move.
- **A change to either date clears `span_mismatch_acknowledged_at` on every
  attachment of this milestone.** An acknowledgement is a judgement about one
  span, and the span it was made about no longer exists. A name-only or
  blurb-only PATCH clears nothing.
- **The response's `mismatchCount` is the new one**, recomputed after the
  update in the same transaction, because narrowing or moving the span creates
  mismatches and the surface has to be able to offer the flow immediately
  rather than on the next visit. Widening usually drives it to zero.
- A date change also changes which day this occasion takes its band on. The
  assignment is a pure function of the milestone set (see the band section), so
  nothing is stored and nothing needs invalidating beyond any cache agent B
  keys on `milestones`.

**Performance** One `UPDATE`, one conditional `UPDATE item_milestones ... SET span_mismatch_acknowledged_at = NULL WHERE milestone_id = ?`
(only when a date moved), then the two batched count queries. One transaction.

#### `DELETE /api/milestones/:milestoneId`

**Surface** 14 `milestones`, state `delete`
**Auth** session required · **Role** uploader
**Request** `type DeleteMilestoneRequest = { /** Path. */ milestoneId: string }`
**Response** `200`

```ts
type DeleteMilestoneResponse = {
  milestoneId: string;
  /**
   * The name as it was, so the confirmation can say it without a second read.
   */
  name: string;
  /**
   * How many attachments went, **per viewer**. See Transformations: this is
   * not the number of rows the statement deleted.
   */
  detachedItemCount: number;
};
```

**Errors**

| status | code                  | when                           |
| ------ | --------------------- | ------------------------------ |
| 403    | `milestone_forbidden` | The viewer's role is `viewer`. |
| 404    | `milestone_not_found` | No such row.                   |

**Transformations**

- **The CASCADE runs one way only, and that direction is the dialog's
  promise.** Deleting the row cascades to `item_milestones` and stops there:
  the occasion goes from the timeline, the 212 photographs stay exactly where
  they are, on the days they were taken, and nothing is deleted except the
  label. No `items` row, no `item_renditions` row, no stored object, and
  nothing is enqueued into `pending_object_deletions`. A cascade in the other
  direction would be the most damaging bug the product could ship
  (`data-model.md` § `item_milestones`).
- Nothing blocks the delete, including a milestone with 318 attachments.
- **`detachedItemCount` is per viewer**, like every other count in the product.
  It is the number of attachments the viewer could see, not the number of rows
  the cascade removed. Reporting the true total would say how many restricted
  photographs were attached, which is exactly the side channel the counting
  rule closes. It has to be computed **before** the delete, inside the same
  transaction, because afterwards there are no rows left to count.
- **One `activity_events` row**, kind `milestone_deleted` (the Destruction
  family), written in the same transaction: `subject_kind = 'milestone'`,
  `subject_id` the now-dangling id, `subject_label` the name as it was,
  `actor_label` the actor's name and address as they were. `subject_id` has no
  foreign key, which is the point: an audit log outlives its subjects
  (`data-model.md` § `activity_events`). `detail_json` carries `startsOn`,
  `endsOn` and the **true** attachment row count, which is admissible there and
  not in the response because surface 17 is admin only (Decision 11).
- No `pending_object_deletions` work of any kind. If a diff ever adds some
  here, it is the bug.

**Performance** One count, one delete (the cascade does `item_milestones`),
one audit insert. One transaction.

## Its items

#### `PATCH /api/milestones/:milestoneId/items`

> **Verb settled at merge.** This was written as `PUT` and is a `PATCH`,
> because it applies a delta rather than replacing a collection. The viewer's
> visible portion of the join table is not the join table, so a replace would
> silently detach photographs they cannot see. See `conventions.md` § Paths;
> an item's tags and people stay `PUT` for the opposite reason.

**Surface** 14 `milestones`, states `created`, `attach`
**Auth** session required · **Role** uploader
**Request**

```ts
/** Path `milestoneId`, plus a body naming both directions explicitly. */
type SetMilestoneItemsRequest = {
  /** Item ids to attach. May be empty. Up to 500. */
  attach: string[];
  /** Item ids to detach. May be empty. Up to 500. */
  detach: string[];
};
```

**Response** `200`

```ts
type SetMilestoneItemsResponse = MilestoneDetail & {
  /** Rows actually created. An id already attached is not counted. */
  attachedCount: number;
  /** Rows actually removed. An id not attached is not counted. */
  detachedCount: number;
};
```

**Errors**

| status | code                  | when                                                                                                                                                                                                         |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`     | An id in both lists, a duplicate within a list, both lists empty, or more than 500 ids in a list.                                                                                                            |
| 403    | `milestone_forbidden` | The viewer's role is `viewer`.                                                                                                                                                                               |
| 404    | `milestone_not_found` | No such milestone.                                                                                                                                                                                           |
| 404    | `item_not_found`      | Any id in either list does not exist **or the viewer may not see it**. Byte-identical in both cases, and the whole request is rejected so nothing distinguishes which id it was (`conventions.md` § Errors). |

**Transformations**

- **This PUT is not a whole-collection replace, and must never become one.**
  The body names what to attach and what to detach; it does not name the
  resulting set. A replace would take the viewer's visible portion of the
  collection for the collection, and silently detach every item the viewer
  cannot see. **A milestone's item set is the join table, never a date range**,
  and the viewer's view of that join table is not the join table.
- Idempotent in both directions: attaching is
  `INSERT ... ON CONFLICT (item_id, milestone_id) DO NOTHING`, never a 409, and
  detaching an id that is not attached is a no-op. The picker toggles prints
  and will resend a state it already sent.
- **Attaching moves nothing.** No `items` row is written, no capture date
  changes, no burst is touched: the photographs stay on the days they were
  taken and the milestone simply points at them. The surface says so in as many
  words and this route is the reason it is true.
- **An item may be attached to a milestone whose span does not contain it, and
  that is allowed**, because a party on Saturday gets photographed on Sunday.
  Attaching one is not a 400 and not a warning; it raises `mismatchCount` in
  the response and the fix flow is offered afterwards.
- New rows carry `attached_by` = the viewer, `attached_at` = now, and
  `span_mismatch_acknowledged_at` null. Detaching deletes the row, so
  re-attaching an item whose mismatch was once acknowledged starts a fresh row
  and offers the fix again. That is correct: the acknowledgement was attached
  to a relationship that was then removed.
- Detach never has a lingering effect on the item: `items.captured_on`,
  `burst_id` and every other column are untouched.
- Not audited. Attachment is not a deletion and not a change to who may see
  what (`data-model.md` § What is _not_ logged).

**Performance** One visibility check for both lists combined
(`SELECT id FROM items WHERE id IN (...) AND <visibility predicate>`, row count
must equal the request's), one batched insert, one batched delete, then the two
batched count queries. One transaction, five queries, independent of how many
ids were sent.

#### `GET /api/milestones/:milestoneId/candidates`

**Surface** 14 `milestones`, states `created`, `attach`
**Auth** session required · **Role** uploader
**Request**

```ts
/** Path `milestoneId`, plus query. */
type ListMilestoneCandidatesRequest = {
  /**
   * `span` (default): everything captured inside `[startsOn, endsOn]`, which
   * is what the "finding its photographs" step offers.
   * `all`: the whole visible archive, for the attach picker.
   */
  scope?: "span" | "all";
  /**
   * Inclusive `YYYY-MM-DD`, `scope: "all"` only. Narrows to a day or a range.
   */
  from?: string;
  to?: string;
  /** Default 60, capped at 200. */
  limit?: number;
  /** Opaque. Encodes `(capturedOn, itemId)`. */
  cursor?: string;
};
```

**Response** `200`

```ts
type ListMilestoneCandidatesResponse = {
  candidates: MilestoneCandidate[];
  nextCursor: string | null;
};
```

**Errors**

| status | code                  | when                                                                                                            |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`     | `limit` out of range, a malformed cursor or date, `to` before `from`, or `from`/`to` sent with `scope: "span"`. |
| 403    | `milestone_forbidden` | The viewer's role is `viewer`.                                                                                  |
| 404    | `milestone_not_found` | No such milestone.                                                                                              |

**Transformations**

- `scope: "span"` is the `created` state exactly: "These are everything in the
  archive captured between 17 and 21 September 2026, which is where its
  photographs are most likely to be." The predicate is `captured_on` inside the
  span, and it is a **suggestion about where to look**, not the milestone's
  contents. Anything outside those days can be attached from the pile, which is
  `scope: "all"`.
- `isAttached` lets the picker render an already-attached print as selected, so
  the same surface adds and removes.
- `isOutsideSpan` is only ever true under `scope: "all"`. It is advisory: the
  print is attachable and attaching it is not an error.
- Ordered `captured_on DESC, id DESC`, matching the timeline's habit and the
  covering index. The cursor encodes `(capturedOn, itemId)`, following the
  conventions' timeline rule rather than the id rule, because the sort key is
  the capture day (`conventions.md` § Pagination).
- Every element is the frozen `ItemSummary`, so the picker draws a print
  without a second request, including `burst`, which is what stops the picker
  showing forty-five near-identical frames as forty-five choices.
- An item the viewer cannot see never appears, and no count anywhere in the
  response hints that it was filtered.

**Performance** Four queries per page and no more: the item page using
`(captured_on DESC, visibility_rule_id, id)`; one batched
`item_renditions WHERE item_id IN (...)` for every `MediaRef`, never one join
per print (`data-model.md` § `item_renditions`); one batched burst resolution;
one batched `SELECT item_id FROM item_milestones WHERE milestone_id = ? AND item_id IN (...)`
for `isAttached`. Signed URLs are minted per row from the keys, in memory.

## Reconciliation

#### `GET /api/milestones/:milestoneId/mismatches`

**Surface** 14 `milestones`, state `fix`
**Auth** session required · **Role** uploader
**Request**

```ts
/** Path `milestoneId`, plus query. */
type ListMilestoneMismatchesRequest = {
  /** Default 50, capped at 200. */
  limit?: number;
  /** Opaque. Encodes `(capturedOn, itemId)`. */
  cursor?: string;
};
```

**Response** `200`

```ts
type ListMilestoneMismatchesResponse = {
  mismatches: MilestoneMismatch[];
  nextCursor: string | null;
  /** The span being compared against, so the client need not hold one. */
  milestone: MilestoneRef;
  /**
   * What "widen the occasion to cover them" would produce, computed over
   * **every** unacknowledged visible mismatch rather than this page.
   */
  wideningSpan: { startsOn: string; endsOn: string };
};
```

**Errors**

| status | code                  | when                                        |
| ------ | --------------------- | ------------------------------------------- |
| 400    | `invalid_request`     | `limit` out of range or a malformed cursor. |
| 403    | `milestone_forbidden` | The viewer's role is `viewer`.              |
| 404    | `milestone_not_found` | No such milestone.                          |

**Transformations**

- A mismatch is an attachment the viewer can see, whose `captured_on` is
  outside `[startsOn, endsOn]`, and whose `span_mismatch_acknowledged_at` is
  null. **The acknowledgement is what stops the nag**: without it every visit
  re-offers the same fix for the same four photographs and a considered
  decision becomes a nuisance (`data-model.md` § `item_milestones`).
- `wideningSpan` is `MIN(captured_on)` and `MAX(captured_on)` over all
  unacknowledged visible mismatches, each bounded by the current span, which is
  exactly what `earliestOf` and `latestOf` compute in
  `prototypes/src/system/MilestoneFix.tsx`. Serving it means the banner's
  promise ("The occasion becomes 9 September to 14 September 2026") and the
  PATCH that follows cannot disagree. It is computed over all of them, not the
  page, because a widening built from a partial page would be wrong.
- `wideningSpan` is per viewer, like everything else. Widening may therefore
  leave a restricted item outside the span. That is correct, it is not an
  error, and it is not reported, because reporting it would count what the
  viewer cannot see.
- An empty `mismatches` array with `wideningSpan` equal to the current span is
  the ordinary case and is not an error state.

**Performance** One indexed page over `item_milestones` by `milestone_id`
joined to `items` for the date and the visibility predicate, one aggregate for
`wideningSpan`, then the same batched rendition and burst queries as the
candidates route. `item_milestones` is indexed in both directions
(`data-model.md` § `item_milestones`).

#### `POST /api/milestones/:milestoneId/reconcile`

**Surface** 14 `milestones`, state `fix`
**Auth** session required · **Role** uploader
**Request**

```ts
/** Path `milestoneId`, plus one of two bodies. */
type ReconcileMilestoneRequest =
  | {
      mode: "move";
      /** Up to 500. One target date per item, never one for the batch. */
      moves: { itemId: string; targetOn: string }[];
    }
  | {
      mode: "acknowledge";
      /** Up to 500. "Leave them as they are". */
      itemIds: string[];
    };
```

**Response** `200`

```ts
type ReconcileMilestoneResponse = MilestoneDetail & {
  movedCount: number;
  acknowledgedCount: number;
  /**
   * Other occasions this move pushed items outside of, with their new
   * per-viewer mismatch counts, so the surface can offer the next fix instead
   * of leaving it to be discovered.
   */
  raisedElsewhere: { milestone: MilestoneRef; mismatchCount: number }[];
};
```

**Errors**

| status | code                           | when                                                                                                                                                                                                                                                |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`              | An unknown `mode`, an empty list, more than 500 entries, a duplicate `itemId`, a malformed `targetOn`, or a `targetOn` outside `[startsOn, endsOn]` (`details.fieldErrors["moves.3.targetOn"]`, dotted paths so a per-item failure is addressable). |
| 403    | `milestone_forbidden`          | The viewer's role is `viewer`.                                                                                                                                                                                                                      |
| 404    | `milestone_not_found`          | No such milestone.                                                                                                                                                                                                                                  |
| 404    | `item_not_found`               | Any `itemId` does not exist **or the viewer may not see it**. Byte-identical in both cases.                                                                                                                                                         |
| 409    | `milestone_attachment_missing` | The item exists and is visible but is not attached to this milestone, so there is nothing to reconcile. Distinguishable from the 404 without leaking, because the viewer can already see the item.                                                  |

**Transformations, `mode: "move"`**

- **A per-item target date is required, and a one-day occasion is not an
  exception.** There is no batch-level date field anywhere in this body. A
  multi-day occasion must ask which of its days each photograph belongs to,
  because guessing would quietly invent a fact
  (`data-model.md` § `item_capture_date_changes`); a one-day occasion is a span
  whose ends are equal, so the client fills every `targetOn` with `startsOn`
  and the two cases are one code path rather than two. `targetOn` must lie
  inside the span, which is the guard that stops a reconcile inventing a date
  the occasion never covered.
- **Preserve the clock time; change only the date.** A 06:41 photograph becomes
  06:41 on the new day and no fact is invented. Precisely, since `captured_at`
  is UTC and `captured_on` is local: when `captured_at_offset_minutes` is not
  null, reuse that same offset, so the stored instant moves by a whole number
  of days and the offset column is left alone; when it is null, take the local
  wall-clock time the item's `captured_on` was derived from, keep it, and
  resolve it on `targetOn` in `shoebox.timezone`, leaving the offset null so
  the guess stays distinguishable (Decision 10). The daylight-saving case is
  the reason this is written out rather than left as "add N days".
- **One `item_capture_date_changes` row per moved item**, with
  `milestone_id` = this milestone, `reason = 'milestone_reconcile'`,
  `changed_by` = the viewer (RESTRICT), and the three `previous_*` columns
  carrying what the item said before, including `previous_capture_source`.
  `items.original_captured_at` is never written, so "revert to what the file
  said" stays one step away however many times a date is moved (Decision 10).
- **Ejection from the burst.** Every target date differs from the item's
  current `captured_on` by construction, so a moved item always leaves its day:
  set `burst_id = NULL` and `burst_index = NULL`, because a burst is a same-day
  run by definition. If that leaves the burst with **zero rows**, delete the
  burst row in the same transaction; no foreign key direction does it
  (`data-model.md` § `bursts`). The emptiness test counts rows, not visible
  rows, and it is the one count in this document that is not per viewer,
  because it is a storage fact rather than a payload; dropping a burst because
  the actor cannot see its remaining frames would destroy a grouping for
  everybody. Surviving siblings are not renumbered: `burst_index` orders the
  strip and a gap is harmless.
- **The move can raise the fix somewhere else.** For every **other** milestone
  the item is attached to, if the new date falls outside that milestone's span,
  set its `span_mismatch_acknowledged_at` to null, so the existing
  reconciliation is offered again there rather than a new flow being invented
  (`data-model.md` § `item_capture_date_changes`). `raisedElsewhere` reports
  those occasions with per-viewer counts.
- On this milestone the moved items are now inside the span, so they leave
  `mismatchCount` by arithmetic rather than by a flag.
- **Not written to `activity_events`.** `item_capture_date_changes` already
  knows, and the log records only what the state tables cannot answer later
  (`data-model.md` § What is _not_ logged).
- **This is the same machinery as agent C's single-item capture-date
  correction** on the item viewer (`POST /api/items/:itemId/capture-date`,
  Decision 10), which differs only in cardinality and in writing
  `reason = 'manual'` with a null `milestone_id`. The clock-preserving
  arithmetic, the audit row, the burst ejection and the acknowledgement
  clearing **must be one service function** called by both routes, not two
  implementations that agree today. A divergence would give two different
  instants for what a family reads as the same action.

**Transformations, `mode: "acknowledge"`**

- **"Leave them as they are" is a real choice and it persists.** Set
  `span_mismatch_acknowledged_at = now` on the named attachments,
  `WHERE span_mismatch_acknowledged_at IS NULL`, so re-acknowledging does not
  rewrite the date on which the decision was made.
- Nothing else is written: no item, no burst, no audit row. The photographs
  stay on the days they were taken and still belong to the occasion; it only
  means the timeline shows them somewhere other than the milestone.
- A subsequent PATCH to either date clears these acknowledgements, because they
  were judgements about a span that no longer exists.

**Performance** One transaction for the whole batch, never one request per
item. Reads: one visibility-and-attachment check over all ids, one fetch of the
affected items and their bursts. Writes: one batched `UPDATE items`, one
batched `INSERT INTO item_capture_date_changes`, one batched
`UPDATE items SET burst_id = NULL`, one `DELETE FROM bursts` for the emptied
ones, one `UPDATE item_milestones` for the acknowledgement clearing. SQLite has
a single writer, so a per-item loop of transactions is the failure mode to
avoid here.

## The band resolution rule, consumed by the timeline

Agent B serves this inside `GET /api/timeline` and owns where it hangs in a
day. The rule and the resolved shape are specified here so that agent B's
implementation and this slice's cannot disagree. Both call **one** exported
function; neither reimplements it.

```ts
/** What the timeline draws for one day. Mirrors `rankMilestonesForDay`. */
type DayMilestonesDto = {
  /** The day's headline, or null when no occasion opens here. */
  band: MilestoneBandDto | null;
  /** Every other occasion covering this day, as quiet continuation strips. */
  continues: MilestoneBandDto[];
};

type MilestoneBandDto = {
  milestone: MilestoneRef;
  /**
   * The occasion's whole per-viewer total, not this day's. Identical to
   * `MilestoneSummary.itemCount` and served from the same batched query.
   */
  itemCount: number;
  /** `endsOn - startsOn + 1`. Always at least 1. The "of M". */
  dayCount: number;
  /** 1-based position of this day within the span. The "day N". */
  dayPosition: number;
};
```

A one-day occasion has `dayCount === 1` and the client omits "day N of M"; the
server still sends both numbers, because a formatted string may not appear in a
payload (`conventions.md` § Field naming).

**The rule.**

1. Take every milestone. There is no visibility filter and there never will be
   (Decision 5).
2. Let `D` be the union of every date in every span, sorted **descending**,
   which is the feed's own order. Every one of those days exists in the day
   stream whether or not it holds an item, because the day set is the date
   range and a day inside a span with no items still shows the occasion
   (`data-model.md` § `items`).
3. Walk `D` newest first with an `introduced` set, initially empty. For each
   day `d`:
   - `covering` is every milestone whose span contains `d`.
   - `openable` is `covering` minus `introduced`.
   - `band` is the member of `openable` with the smallest `dayCount`; ties
     break by the earliest `startsOn`; remaining ties break by the smaller
     `milestoneId`, which is the older row, since ids are uuidv7. The third
     level exists so the order is total and the wall cannot reshuffle between
     visits; the prototype's two levels are otherwise unchanged.
   - If a band was awarded, add it to `introduced`.
   - `continues` is `covering` minus the band, ordered by `startsOn` ascending
     then `milestoneId`.
4. A day in no span has `band: null` and `continues: []`.

**What counts as introduced is what took a band, never what merely appeared.**
An occasion that has only ever been a continuation strip has not been
introduced yet, so it still gets its full band on the next day it wins one.
`introduced` is appended to in step 3 only, and never when a milestone lands in
`continues`.

**The assignment is a pure function of the milestone set.** It does not depend
on the viewer, on which items are visible, on which day the reader is looking
at, or on which page a day falls in. Two consequences the two implementations
must both rely on: the band assignment is **identical for every member**, and
only the counts inside the DTO differ per viewer; and pagination needs no
carried state, because the day a milestone opens on is determined by the spans
alone. Nothing about "already introduced" may be threaded through a cursor.

**The shared function.** `apps/server/src/services/milestones.ts` exports it,
and it is a transcription of `rankMilestonesForDay` in
`prototypes/src/data/milestones.ts` with the id tie-break added.

```ts
type MilestoneSpanRow = {
  milestoneId: string;
  startsOn: string;
  endsOn: string;
};

type DayBandAssignment = {
  bandMilestoneId: string | null;
  continuesMilestoneIds: string[];
};

/** Keyed by `YYYY-MM-DD`. A day absent from the map has no occasion at all. */
function resolveMilestoneBands(
  milestones: readonly MilestoneSpanRow[],
): Map<string, DayBandAssignment>;
```

Milestones are tens of rows and spans are days long, so this is a few hundred
map entries and may simply be recomputed per request; agent B may memoise it on
the milestone set, never on the viewer.

**The worked example, which both implementations should be tested against.**
The fixtures hold `mil-home` ("Home from the hospital", 17 September, one day)
and `mil-first-week` ("Mateo's first week at home", 17 to 21 September). Walking
newest first:

| Day    | band                         | continues                    |
| ------ | ---------------------------- | ---------------------------- |
| 21 Sep | `mil-first-week`, day 5 of 5 | none                         |
| 20 Sep | none                         | `mil-first-week`, day 4 of 5 |
| 19 Sep | none                         | `mil-first-week`, day 3 of 5 |
| 18 Sep | none                         | `mil-first-week`, day 2 of 5 |
| 17 Sep | `mil-home`, day 1 of 1       | `mil-first-week`, day 1 of 5 |

Which is Decision 14's own sentence: 17 September opens with "Home from the
hospital" and carries "Mateo's first week at home, day 1 of 5" under it, while
the longer occasion still opened as a full band on the first of its days where
nothing narrower competed.

The second case, which is the one the "already introduced" rule exists for: put
a one-day occasion on 21 September instead. It takes the band on the 21st and
`mil-first-week` is a continuation strip there; on the 20th `mil-first-week` is
still not introduced, so it takes a full band reading day 4 of 5, and the 19th,
18th and 17th are its continuations. An occasion that has only been a strip is
not yet introduced.

## Shared types in this slice

The band DTOs (`DayMilestonesDto`, `MilestoneBandDto`) are defined in the band
section above and are shared with agent B.

```ts
/**
 * One row of the list. The occasion itself is the frozen `MilestoneRef`,
 * composed rather than widened, so the same five fields travel everywhere.
 * There is no visibility field and there is no place for one: Decision 5.
 */
type MilestoneSummary = {
  milestone: MilestoneRef;
  /** Per viewer, always. Never a column. */
  itemCount: number;
  /** `endsOn - startsOn + 1`, always at least 1. */
  dayCount: number;
  /** `viewer.role !== "viewer"`. Never a function of `created_by`. */
  canEdit: boolean;
  canDelete: boolean;
};

/** What the edit form, the empty state and the delete dialog all read. */
type MilestoneDetail = MilestoneSummary & {
  /** Per viewer: attached, visible, outside the span, unacknowledged. */
  mismatchCount: number;
  /**
   * Null once the member who typed it has been removed. SET NULL, by design.
   */
  createdBy: MemberRef | null;
  createdAt: string;
  updatedAt: string;
};

/** One print in the attach picker. */
type MilestoneCandidate = {
  item: ItemSummary;
  /** Already on this milestone, so the picker renders it selected. */
  isAttached: boolean;
  /** Captured outside the span. Advisory; attaching it is allowed. */
  isOutsideSpan: boolean;
};

/** One attached item whose capture day sits outside the occasion. */
type MilestoneMismatch = {
  item: ItemSummary;
  /**
   * When the attachment was made. The item's own capture day, which is the
   * half of the disagreement the flow is about, is `item.capturedOn`.
   */
  attachedAt: string;
};
```

Schema names generated after the merge: `milestoneSummarySchema`,
`milestoneDetailSchema`, `milestoneCandidateSchema`, `milestoneMismatchSchema`,
`dayMilestonesSchema`, `milestoneBandSchema`, and one
`<routeName>RequestSchema` / `<routeName>ResponseSchema` pair per route
(`listMilestonesResponseSchema` / `ListMilestonesResponse`, and so on).

New error codes for the registry:

| Code                           | Status |
| ------------------------------ | ------ |
| `milestone_not_found`          | 404    |
| `milestone_forbidden`          | 403    |
| `milestone_attachment_missing` | 409    |

`item_not_found` (404) is used here and will be registered by whichever slice
owns items; it must keep one message across slices, since this slice relies on
it being byte-identical for an item that does not exist and one the viewer may
not see.

## Additions requested to the frozen DTOs

None.

One was considered and deliberately not requested: `itemCount` on
`MilestoneRef`. Every surface that shows a milestone with a count is in this
slice or is agent B's band, and both compose `MilestoneRef` alongside a count
rather than inside it. Putting a per-viewer aggregate into a frozen DTO that
other slices use as a plain label is the shape most likely to end up cached,
stored, or served unfiltered, which is the single most likely place a hidden
photograph leaks (`data-model.md` § One rule that outranks the others).

## Open questions for the coordinator

1. **`items.capture_source` after a reconcile move.** The data model
   contradicts itself: the `items` CHECK permits
   `('exif','video_metadata','filename','file_mtime','uploader_set','upload_time')`
   with no `manual`, while Decision 10 says a hand correction was anticipated as
   `capture_source = 'manual'`. This slice assumes `'uploader_set'`, the value
   the constraint actually allows, and records the old value in
   `previous_capture_source` either way. Agent C's single-item route hits the
   identical question, so it needs one answer: either the CHECK gains `manual`
   or Decision 10's prose is corrected.
2. **`201` or `200` on create.** `POST /api/milestones` returns `201` with the
   post-mutation read shape. The conventions' template shows `200` and does not
   rule on creates. Several slices create resources, so the coordinator should
   pick one and apply it across all of them.
3. **The attach picker's narrowing.** The `attach` state's field reads "A day, a
   tag, a person", and this slice serves only the date half, via
   `scope` / `from` / `to` on `GET /candidates`. Tag, person and free-text
   narrowing is the filter slice's query language and should not be reinvented
   here. Preferred resolution: the filter slice's item search grows an
   `attachedToMilestoneId` flag so the picker drives from it and posts the ids
   to `PUT /:milestoneId/items`, and `GET /candidates` stays the
   span-suggestion route the `created` state needs.
4. **`PUT` on a delta.** `PUT /:milestoneId/items` carries `attach` and
   `detach` rather than the resulting set, because a replace would let a viewer
   silently detach items they cannot see. The route set was fixed before this
   was noticed; if the coordinator prefers the verb to match the semantics, it
   should become `PATCH` in every slice that has the same viewer-partial-
   collection problem, not just this one.
