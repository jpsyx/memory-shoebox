# One item

The permalink and everything done from it: the photo and the video viewer, the
burst strip, comments, both reaction sets, the tag and people sets, the alt text
override, visibility (on one item and on a selection), the hand correction to a
capture date, and deletion. Not here: the timeline, its filters and its facets
(slice B); upload and ingest, which is where `duration_ms`, the renditions and
an item's first visibility rule are written (slice D); the removal-request state
machine, whose open-to-deleted transition this slice triggers and does not
define (slice E); milestone CRUD and the bulk span reconciliation this slice
re-arms (slice G); and who has opened an item, which is
`GET /api/items/:itemId/viewers` (slice H).

## Routes

| Method   | Path                                | Auth    | Role                      | Purpose                                             |
| -------- | ----------------------------------- | ------- | ------------------------- | --------------------------------------------------- |
| `GET`    | `/api/items/:itemId`                | session | any member                | The permalink, in one response. Counts the open.    |
| `PATCH`  | `/api/items/:itemId`                | session | uploader or admin         | The alt text override, and nothing else.            |
| `DELETE` | `/api/items/:itemId`                | session | uploader-of-item-or-admin | Destroy the record and enqueue the objects.         |
| `GET`    | `/api/bursts/:burstId/frames`       | session | any member                | Fan a burst into its visible frames.                |
| `POST`   | `/api/items/:itemId/comments`       | session | any member                | Say something, optionally pinned to a video moment. |
| `PATCH`  | `/api/comments/:commentId`          | session | author                    | Edit the body. Leaves an `edited` mark.             |
| `DELETE` | `/api/comments/:commentId`          | session | author-or-admin           | Take it down, with its reactions.                   |
| `PUT`    | `/api/items/:itemId/reaction`       | session | any member                | Set or change mine on the item.                     |
| `DELETE` | `/api/items/:itemId/reaction`       | session | any member                | Take mine off the item.                             |
| `PUT`    | `/api/comments/:commentId/reaction` | session | any member                | Set or change mine on a comment.                    |
| `DELETE` | `/api/comments/:commentId/reaction` | session | any member                | Take mine off a comment.                            |
| `PUT`    | `/api/items/:itemId/tags`           | session | uploader or admin         | Replace the item's tag set.                         |
| `PUT`    | `/api/items/:itemId/people`         | session | uploader or admin         | Replace the item's people set.                      |
| `PATCH`  | `/api/items/:itemId/visibility`     | session | uploader or admin         | Repoint one item at a rule.                         |
| `POST`   | `/api/items/visibility`             | session | uploader or admin         | Repoint a selection at a rule, atomically.          |
| `POST`   | `/api/visibility-rules/resolve`     | session | uploader or admin         | Mode plus subjects to a rule id. Finds or creates.  |
| `POST`   | `/api/items/:itemId/capture-date`   | session | uploader-of-item-or-admin | The hand correction. Keeps the clock time.          |

Two role families appear above and they are not the same predicate. **Uploader
or admin** is the `members.role` ladder, applied to any item the viewer can see:
the spec grants "set item visibility" and "add tags, people tags and milestones"
to the uploader role with no ownership qualifier (`spec.md` § Roles,
§ Visibility). **Uploader-of-item-or-admin** is `items.uploaded_by = :me OR role
= 'admin'`, and it gates only the two actions the sources qualify by ownership:
deletion (`data-model.md` § Deleting an item: the cascade matrix) and the
capture date (Decision 10, `data-model.md` § `item_capture_date_changes`). See
"Open questions" 1.

### The item

Three rules hold across every route in this document and are restated in the
tables below rather than assumed.

**Resolve visibility before role, always.** Look the row up under the viewer's
predicate first. A miss is `404`, byte-identical to a nonexistent uuid. Only
once the row has come back may the role be checked, and only then may a `403`
be returned. Reversing the two turns a `403` into an existence oracle, which is
exactly what the counting rule exists to prevent (`data-model.md`
§ The evaluation).

**Only `GET /api/items/:itemId` writes `item_views`.** Every mutation in this
slice returns the post-mutation `ItemDetail`, and none of them increments the
open count. Saving a description is not opening a photograph.

**`MediaRef.altText` is never null and is composed server-side.** The rule is
given once under `GET /api/items/:itemId` and applies wherever a `MediaRef` or
a `BurstFrameRef` is minted.

#### `GET /api/items/:itemId`

**Surface** 3 `photo`, states `viewer`, `uploader`, `visibility`, `delete`,
`reactions`, `fix-date`, `describe`, `who-opened`, `quiet` · 4 `video`, states
`paused`, `playing`, `pinning`, `quiet`
**Auth** session required · **Role** any member

**Request**

```ts
interface GetItemRequest {
  path: { itemId: string };
}
```

**Response** `200`

```ts
type GetItemResponse = ItemDetail;
```

One response carries the comments, both reaction sets, the tags, the people, the
attached milestones, the burst siblings and the visibility summary. There is no
second request on this surface, and no route in this slice fetches one of those
lists on its own.

**Errors**

| Status | Code             | When                                                                                                                                                             |
| ------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`  | No session, or an expired one.                                                                                                                                   |
| 404    | `item_not_found` | No such item, **or the viewer's visibility predicate excludes it**. The two are byte-identical: same status, same code, same message, no `details`. Never `403`. |
| 429    | `rate_limited`   | 600 per minute per session.                                                                                                                                      |

A permalink the viewer may not open returns `404`. A `403` here would confirm
that something exists at that id, and a day that reads as 204 to one member and
212 to another is worth nothing if the id of each missing photograph can be
tested one at a time.

**Transformations**

1. **Visibility.** `WHERE i.id = :itemId AND (i.visibility_rule_id IN
(:visibleRuleIds) OR i.uploaded_by = :viewerMemberId)`, the clause dropped
   entirely for an admin (`conventions.md` § The visibility predicate). A miss
   is the `404` above.
2. **Alt text**, composed for this item and for every sibling in the strip:
   - `items.alt_text` non-null and non-blank wins outright. It is an override,
     written only when somebody typed a real description (Decision 9).
   - Otherwise compose from the people tags and the capture date: the display
     names in `item_people` order (`tagged_at ASC, display_name ASC`), joined
     with commas and a final "and", then the capture date. "Mateo, Papá and
     Mamá, 14 September 2026".
   - With no people tags, the date alone: "14 September 2026".
   - **What it does when the viewer cannot see some of the tagged people: the
     case does not arise, and it must not be made to arise.** A people tag
     inherits its item's rule exactly (`spec.md` § Visibility), so on an item
     the viewer may open there is no partially visible people set and the
     composition uses all of them. What keeps that true is the `404` in step 1,
     not a filter: a `MediaRef` is only ever minted for an item the viewer may
     see. **Do not add a visibility predicate to the people join behind the
     composition.** `item_people` must never appear in a visibility expression
     (Decision 7, `data-model.md` § The evaluation), and filtering here would be
     that mistake wearing a different hat: it would also quietly rewrite the alt
     text of a photograph as people move between groups.
   - The date inside the string is rendered in the `shoebox.timezone` setting.
     See "Open questions" 3.
3. **`altTextOverride`** is returned beside `media.altText` so the `describe`
   state can pre-fill its textarea from the override and never from the
   generated string. Pre-filling from the generated string would turn a default
   into a typed override on the next save, and Decision 9's whole point is that
   264 files get something honest without anybody typing.
4. **`durationMs`** (on `MediaRef`) is non-null for every `kind: "video"`. The
   transport positions each pinned-comment mark as `at_seconds / duration`, so
   without it every mark lands wrong on first paint and then jumps once metadata
   loads (`data-model.md` § `items`). A video whose `items.duration_ms` is null
   is an ingest bug (slice D); this route returns `500` rather than shipping a
   payload whose marks are guaranteed wrong.
5. **Burst.** `burst.visibleFrameCount`, `startsAt`, `endsAt` and `coverItemId`
   are all computed from the visibility-filtered sibling rows; there is no
   stored `frame_count`, deliberately (`data-model.md` § `bursts`). The cover
   resolves to `cover_item_id` when that frame is visible, otherwise to the
   earliest visible frame.
6. **`burstPosition` and `BurstFrameRef.position` are 1-based over the visible
   siblings only, never `items.burst_index`.** "Frame 7 of 45" has to be
   viewer-filtered on both sides. Passing the stored index through would leave a
   gap wherever a restricted frame sits, and a gap is a count of what you cannot
   see.
7. **`isUnseen`** is read from `item_views` **before** step 9 writes, so it
   reports the state the viewer arrived in. Every later load of the same
   permalink reports `false`.
8. **`capabilities`** is computed per viewer from `Viewer.role`,
   `items.uploaded_by` and whether the viewer's linked person is in
   `item_people`. `canSeeViewers` is `Viewer.isAdmin`.
9. **The open is counted, as a side effect of this GET.** There is no separate
   route, because this route _is_ opening at full size: the pile's thumbnails
   come from the timeline (slice B), and nothing else calls this path.

   ```sql
   INSERT INTO item_views (id, member_id, item_id, first_seen_at, first_opened_at, last_opened_at, open_count)
   VALUES (:id, :me, :itemId, :now, :now, :now, 1)
   ON CONFLICT (member_id, item_id) DO UPDATE SET
     first_opened_at = COALESCE(item_views.first_opened_at, :now),
     last_opened_at  = :now,
     open_count      = item_views.open_count + 1;
   ```

   **It is not throttled**, and that is deliberate, unlike the session slide and
   `members.last_seen_at`, which are (`conventions.md` § The auth middleware).
   The table is bounded by content rather than by behaviour, one row per
   `(member, item)` forever, so the write never grows the database; and
   `open_count` is the figure slice H's surface prints as "items opened", which
   would stop meaning anything if a timer decided which opens counted. A `404`
   writes nothing. The upsert runs after the reads are assembled and outside the
   read work, in its own short write transaction, so a page of reads never holds
   SQLite's single writer.

   The sibling thumbnails in the strip are impressions, not opens, and this
   route does not latch `first_seen_at` for them. See "Open questions" 6.

10. **Comments are returned in full, unpaginated**, oldest first, with
    `editedAt` driving the "edited" marker and `canEdit` / `canDelete` computed
    per viewer (`canEdit` is authorship; `canDelete` is authorship or admin).
    A family photograph carries tens of comments, not thousands. If that ever
    stops being true the fix is a `GET /api/items/:itemId/comments` collection,
    not a cursor field bolted onto `ItemDetail`.
11. **Reaction kinds are ordered server-side** by `(count DESC, canonical
position ASC)`, the canonical positions being `REACTION_ORDER`. Within a
    kind, `members` is ordered by `created_at ASC`. The viewer's own `MemberRef`
    appears in that list like anybody else's; relabelling it "You" is the
    client's business.
12. The `quiet` state is `comments: []` and `reactions: { kinds: [], myKind:
null }`. There is no separate empty shape and no `commentCount`.

**Performance**

Eleven reads and one write. None of them is in a loop.

| #   | Query                                                                                                                   | Index                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | The item, its uploader and its burst row, under the predicate                                                           | `items` PK                                         |
| 2   | Visible siblings: `WHERE burst_id = :burstId AND <predicate> ORDER BY burst_index, id`. Skipped when `burst_id IS NULL` | `items (burst_id, burst_index)`                    |
| 3   | Renditions for this item and the strip, one batched `WHERE item_id IN (...)`                                            | `item_renditions UNIQUE (item_id, purpose)`        |
| 4   | The visibility rule with its subjects and their names, for `label`                                                      | `visibility_rule_subjects (rule_id, ...)`          |
| 5   | Tags                                                                                                                    | `item_tags (item_id, tag_id)`                      |
| 6   | People for this item **and for every sibling in the strip**, one batched `WHERE item_id IN (...)`                       | `item_people (item_id, person_id)`                 |
| 7   | Attached milestones                                                                                                     | `item_milestones (item_id, milestone_id)`          |
| 8   | Comments                                                                                                                | `comments (item_id, created_at)`                   |
| 9   | Item reactions, rows not aggregates                                                                                     | `item_reactions UNIQUE (item_id, member_id)`       |
| 10  | **Comment reactions, one query, `WHERE comment_id IN (:commentIds)`**                                                   | `comment_reactions UNIQUE (comment_id, member_id)` |
| 11  | The viewer's own `item_views` row, for `isUnseen`                                                                       | `item_views UNIQUE (member_id, item_id)`           |

Four N+1 risks, named because each of them reads as reasonable code:

- **Query 10 is the one the data model calls out by name.** One query per
  comment is "the easiest mistake in the item viewer" (`data-model.md` § Notes
  for whoever writes the API contract). Sixteen comments must be one probe on
  `comment_id IN (...)`, not sixteen probes.
- **Query 6.** Every `BurstFrameRef` carries an `altText`, and every alt text
  composes from that frame's people. Composing them one frame at a time is sixty
  queries hiding inside a `.map`.
- **Query 3.** One batched rendition fetch for the item and the strip, keyed by
  the item ids, never one join per frame (`data-model.md` § `item_renditions`).
- **`MemberRef` resolution.** Load the members table once per request (tens of
  rows, and it will not grow) and resolve every author and every reactor from
  it, rather than joining `members` inside queries 8, 9 and 10.

The strip is capped at 60 visible siblings. `burst.visibleFrameCount` says
whether there are more, and `GET /api/bursts/:burstId/frames` serves them.

#### `PATCH /api/items/:itemId`

**Surface** 3 `photo`, state `describe`
**Auth** session required · **Role** uploader or admin

**Request**

```ts
interface UpdateItemRequest {
  path: { itemId: string };
  body: {
    /** The override. Blank or null clears it and returns to the composed string. */
    altText: string | null;
  };
}
```

**Response** `200`

```ts
type UpdateItemResponse = ItemDetail;
```

**Errors**

| Status | Code                  | When                                                                                                          |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`     | `altText` longer than 2000 characters. `details.fieldErrors.altText`.                                         |
| 401    | `not_signed_in`       |                                                                                                               |
| 403    | `item_edit_forbidden` | Role `viewer`. The item exists and they can see it; their role forbids the edit.                              |
| 404    | `item_not_found`      | No such item, **or the viewer may not see it**. Byte-identical to a nonexistent uuid. Checked before the 403. |

**Transformations**

- **The body has exactly one field, and widening it is how the rest of this
  document gets bypassed.** The capture date, visibility, tags and people each
  have a route with transformation steps a generic `PATCH` would skip.
- `altText` is trimmed. An empty result is stored as `NULL`, which clears the
  override rather than storing a blank description: `items.alt_text` is "written
  only when somebody types a real description" (`data-model.md` § `items`).
- The response recomposes `media.altText`, so clearing the override immediately
  returns the generated string and the surface's own copy stays true.
- No `activity_events` row. Alt text is not access and not destruction
  (`data-model.md` § What is not logged).
- No `item_views` increment.

**Performance** One point-update, then the `GET` read set without its write.

#### `DELETE /api/items/:itemId`

**Surface** 3 `photo`, state `delete`
**Auth** session required · **Role** uploader-of-item-or-admin

**Request**

```ts
interface DeleteItemRequest {
  path: { itemId: string };
}
```

**Response** `204`, no body. There is nothing to return: the resource is gone,
and there is no soft-deleted shadow of it to describe. `items` has no
`deleted_at` and must not grow one; the spec forbids a hidden flag in three
separate places.

**Errors**

| Status | Code                    | When                                                                                                              |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`         |                                                                                                                   |
| 403    | `item_delete_forbidden` | The viewer can see it and did not upload it, and is not an admin.                                                 |
| 404    | `item_not_found`        | No such item, **or the viewer may not see it**. Byte-identical to a nonexistent uuid, and checked before the 403. |

**Nothing blocks.** Not an open removal request, because deleting is how you
grant one; not a burst with forty-four siblings, because deleting one frame of
forty-five is ordinary (`data-model.md` § Deleting an item: the cascade matrix).
There is no `409` in this table.

**Transformations**, in this order, in one transaction:

1. Resolve the item under the predicate. A miss is the `404`.
2. `items.uploaded_by = :me OR Viewer.isAdmin`, else the `403`.
3. **Read what the cascade is about to destroy**, while it still exists: the
   item's `burst_id`, and every `item_renditions.storage_key` for it.
4. **Enqueue the objects.** `INSERT INTO pending_object_deletions (storage_key)
... ON CONFLICT (storage_key) DO NOTHING`, one row per rendition, **in this
   same transaction**. No foreign key performs this, and no transaction spans
   SQLite and Backblaze: the rows must commit first so the item genuinely
   vanishes, and without this table a B2 failure leaves a family paying to store
   a photograph they were told was destroyed (`data-model.md`
   § `pending_object_deletions`). The `object-deletion-drain` job takes it from
   there, every five minutes, retrying (`conventions.md` § The job runner).
5. **Resolve every open removal request on this item**, in this same
   transaction, setting `resolved_at` and `resolved_by_member_id = :me`. It acts
   on **all** of them, not on the one being answered, and the deleter may be an
   admin rather than the uploader. **Slice E owns the transition semantics and
   its contract is authoritative for the target state, the notifications and the
   `decline_reason` interaction**; this step states only the requirement, not the
   state machine. **This must run before step 7**, because
   `removal_requests.item_id` is `SET NULL` on delete and the rows become
   unfindable by item the instant the item goes.
6. **Write the `activity_events` row**, kind `item_deleted`, with
   `actor_member_id`, `actor_label`, `device_id`, `subject_kind = 'item'`,
   `subject_id = :itemId` and a `subject_label` composed now, while the row is
   still readable. `subject_id` is deliberately a dangling id with no foreign
   key: an audit log outlives its subjects by definition. This row is the only
   record anywhere that the item existed; nothing else logs a deletion
   (`data-model.md` § What is not logged).
7. `DELETE FROM items WHERE id = :itemId`. With `PRAGMA foreign_keys = ON` the
   engine then performs the whole matrix: `comments` CASCADE (and
   `comment_reactions` transitively through them), `item_reactions`,
   `item_tags`, `item_people`, `item_milestones`, `item_views`,
   `item_renditions` and `item_capture_date_changes` all CASCADE;
   `upload_files.item_id` and `removal_requests.item_id` `SET NULL`;
   `bursts.cover_item_id` `SET NULL`. `tags`, `people`, `milestones` and
   `members` rows all survive, which is what keeps somebody findable after their
   only photograph comes down.
8. **Drop the burst when its last frame goes.** Application code; no foreign key
   direction does this (`data-model.md` § `bursts`). If the item had a
   `burst_id` and `SELECT 1 FROM items WHERE burst_id = :burstId LIMIT 1`
   returns nothing, `DELETE FROM bursts WHERE id = :burstId`. The row survives
   the cascade on its own, because the only FK pointing at the item is
   `cover_item_id` and that merely nulls. One remaining frame does **not** drop
   the burst: it renders as a plain print rather than a stack of one, which is a
   read-time rule, not a schema one.
9. `visibility_rules` is untouched. Rules are shared, and a separate sweeper
   drops unreferenced ones; see "Open questions" 2.

**Authorisation**, restated because the schema cannot express it:
`items.uploaded_by = :me OR members.role = 'admin'`.

**Performance** One indexed read of the renditions, one bounded insert per
rendition (five or six for a video), one delete, one existence probe on
`items (burst_id, burst_index)`. The cascade is engine work on indexed child
tables. The object deletes are not on this path.

### Bursts

#### `GET /api/bursts/:burstId/frames`

**Surface** 3 `photo`, states `viewer`, `uploader` (the sibling strip, and the
stack fanned open from the pile)
**Auth** session required · **Role** any member

**Request**

```ts
interface GetBurstFramesRequest {
  path: { burstId: string };
  query: { limit?: number; cursor?: string };
}
```

`limit` defaults to 200 and is capped at 200. The cursor is opaque and encodes
`(burst_index, id)`, which is the sort key; it is one of the two places in the
contract that does not encode the bare uuidv7 `id`, because `burst_index` is the
order the strip is read in and is not guaranteed to agree with arrival order. At
realistic burst sizes one page is always enough and `nextCursor` is `null`.

**Response** `200`

```ts
interface GetBurstFramesResponse {
  frames: BurstFrameRef[];
  nextCursor: string | null;
}
```

No `BurstSummary` rides along, deliberately: every caller already holds one,
from the print it fanned open (`ItemSummary.burst`) or from `ItemDetail.burst`.

**Errors**

| Status | Code              | When                                                                                                                                                                                                                            |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`   |                                                                                                                                                                                                                                 |
| 404    | `burst_not_found` | No such burst, **or the viewer can see none of its frames**. Byte-identical in both cases. A burst with zero visible frames "vanishes and contributes nothing to the day", so it is a `404` and not an empty list. Never `403`. |
| 429    | `rate_limited`    |                                                                                                                                                                                                                                 |

**Transformations**

- The visibility predicate applies to the frames, not to the burst: `WHERE
i.burst_id = :burstId AND (i.visibility_rule_id IN (:visibleRuleIds) OR
i.uploaded_by = :viewerMemberId)`, dropped for an admin.
- **`position` is recomputed densely, 1 to n, over the returned visible set.**
  `items.burst_index` is not in the payload. This is where a restricted frame
  would leak: pass the stored index through and frames 6, 8, 9 tell you that
  there is a frame 7 you may not open.
- Ordered by `(burst_index ASC, id ASC)`. `burst_index` is 1-based and nullable;
  a null sorts last, ahead of nothing.
- `altText` per frame follows the composition rule under
  `GET /api/items/:itemId`.

**Performance** One indexed range scan on `items (burst_id, burst_index)`, one
batched rendition query `WHERE item_id IN (...) AND purpose = 'thumb'`, one
batched people query `WHERE item_id IN (...)` for the alt text. Three queries
for a page of any size. One rendition query per frame is the same N+1 the pile
already refuses.

### Comments

Every route here addresses a comment by its own id and reaches the item through
`comments.item_id`. The visibility predicate is applied to that item, and a
comment on an item the viewer may not see is `comment_not_found`, never `403`
and never `item_not_found`: the code names the resource that was addressed.
Comments have no visibility column and inherit their item's rule exactly
(`data-model.md` § `comments`).

#### `POST /api/items/:itemId/comments`

**Surface** 3 `photo`, states `viewer`, `quiet` · 4 `video`, states `paused`,
`pinning`, `quiet`
**Auth** session required · **Role** any member

**Request**

```ts
interface CreateCommentRequest {
  path: { itemId: string };
  body: {
    body: string;
    /** Seconds into a video. REAL, not an integer. Null or absent for an ordinary comment. */
    atSeconds?: number | null;
  };
}
```

**Response** `201`

```ts
type CreateCommentResponse = CommentDto;
```

**Errors**

| Status | Code              | When                                                                                                                                              |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request` | Empty or whitespace-only `body`; `body` over 4000 characters; `atSeconds` negative; `atSeconds` on a `kind: "photo"` item. `details.fieldErrors`. |
| 401    | `not_signed_in`   |                                                                                                                                                   |
| 404    | `item_not_found`  | No such item, **or the viewer may not see it**. Byte-identical to a nonexistent uuid. Commenting on an invisible item is a `404`, not a `403`.    |
| 429    | `rate_limited`    | 60 comment and reaction writes per minute per member.                                                                                             |

**Transformations**

- `body` is trimmed and must satisfy `length(trim(body)) > 0`, which is a
  database `CHECK` as well as a validation.
- **`at_seconds` is `REAL`, not an integer.** The scrubber produces
  `fraction * duration`, a float, and rounding it to a whole second would move
  everybody's mark (`data-model.md` § `comments`). The fixtures use whole
  seconds only because they were typed by hand.
- `atSeconds` is **clamped** to `[0, duration_ms / 1000]` rather than rejected at
  the top end: `fraction * duration` with `fraction === 1` produces exactly the
  duration, and a float a hair over it is arithmetic, not a bad request. Below
  zero is impossible from the scrubber and is a `400`.
- `atSeconds` on a photo is a `400`. The photo viewer has no transport.
- The thread is flat. There is no `parent_comment_id`, and "a reply on something
  you commented on" means another top-level comment on the same item.
- `editedAt` is `null` on creation, `canEdit` and `canDelete` are both `true`
  for the author, and `reactions` is the empty summary.
- **Notification.** The comment is enqueued into `outbound_emails` for the
  item's uploader and for everybody who has already commented on the item, minus
  the author, filtered by the per-kind boolean columns on `members`
  (Decision 16). It is enqueued, never sent inline. The recipient query, the
  copy and the `outbound_emails` shape belong to the emails slice, not here.
- No `activity_events` row: `comments.created_at` already knows
  (`data-model.md` § What is not logged).

**Performance** One insert, plus the item lookup under the predicate. The
notification enqueue is one insert per recipient over a members table of tens of
rows.

#### `PATCH /api/comments/:commentId`

**Surface** 3 `photo`, state `viewer` · 4 `video`, state `paused`
**Auth** session required · **Role** author

**Request**

```ts
interface UpdateCommentRequest {
  path: { commentId: string };
  body: { body: string };
}
```

**Response** `200`

```ts
type UpdateCommentResponse = CommentDto;
```

**Errors**

| Status | Code                     | When                                                                                                                                                                                 |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`        | Empty after trimming, or over 4000 characters.                                                                                                                                       |
| 401    | `not_signed_in`          |                                                                                                                                                                                      |
| 403    | `comment_edit_forbidden` | The viewer can see the comment and did not write it. **An admin gets this too**: Decision 8 grants admins "delete anything", not edit anything. Nobody edits another person's words. |
| 404    | `comment_not_found`      | No such comment, **or the viewer may not see its item**. Byte-identical to a nonexistent uuid, and checked before the 403.                                                           |

**Transformations**

- `edited_at = :now`. **`editedAt` is not optional and drives the "edited"
  marker**: a comment that changes under a reader with no sign of it is worse
  than one that cannot change at all (Decision 8).
- **`atSeconds` is not in the request body and cannot be moved.** A pin is fixed
  at creation; moving it would slide a mark under everybody else reading the
  same transport bar.
- One limit the contract cannot fix and the surface already says out loud: the
  notification email quoted the comment as it was sent, and an edit cannot catch
  a message already delivered.
- No `activity_events` row.

**Performance** One point-update on the primary key, after one indexed lookup
that joins `items` for the predicate.

#### `DELETE /api/comments/:commentId`

**Surface** 3 `photo`, state `viewer` · 4 `video`, state `paused`
**Auth** session required · **Role** author-or-admin

**Request**

```ts
interface DeleteCommentRequest {
  path: { commentId: string };
}
```

**Response** `204`, no body.

**Errors**

| Status | Code                       | When                                                                                                                       |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`            |                                                                                                                            |
| 403    | `comment_delete_forbidden` | The viewer can see it, did not write it, and is not an admin.                                                              |
| 404    | `comment_not_found`        | No such comment, **or the viewer may not see its item**. Byte-identical to a nonexistent uuid, and checked before the 403. |

**Transformations**

- An author deletes their own: "a comment left in grief at four in the morning
  is the author's to withdraw". An admin deletes anybody's, from the roles table.
- `comment_reactions` go with it by CASCADE, which is the delete dialog's own
  copy and the cascade a polymorphic reactions table would not have given.
- **When the deleter is not the author, write an `activity_events` row**, kind
  `comment_deleted`, with `subject_kind = 'comment'`, `subject_id` (dangling by
  design), a `subject_label` carrying the body as it stood, and `actor_label`
  (Decision 8). An author deleting their own writes no row: that is not a
  moderation act and the audit log records only what the state tables cannot
  answer later.
- If this was the last comment pinned at a moment, the transport simply has one
  fewer mark. Nothing is recomputed.

**Performance** One delete on the primary key plus the engine's cascade over
`comment_reactions UNIQUE (comment_id, member_id)`.

### Reactions

One reaction per member per thing, enforced by `UNIQUE (item_id, member_id)` and
`UNIQUE (comment_id, member_id)`. The unique constraint is the whole of the rule
(`data-model.md` § Reactions: two tables, not one). Setting is one statement;
pressing the one you already left is a `DELETE`. Both are point lookups.

All four routes are rate limited at 60 comment and reaction writes per minute
per member, and all four return a `404` (`item_not_found` or
`comment_not_found`) when the underlying item is invisible, never a `403`.

#### `PUT /api/items/:itemId/reaction`

**Surface** 3 `photo`, state `reactions` · 4 `video`, state `paused`
**Auth** session required · **Role** any member

**Request**

```ts
interface SetItemReactionRequest {
  path: { itemId: string };
  body: { kind: ReactionKind };
}
```

**Response** `200`

```ts
type SetItemReactionResponse = ReactionSummary;
```

The whole summary comes back rather than the single row, because that is the
post-mutation read shape of the thing the surface draws: the row of kinds and
the popover's names.

**Errors**

| Status | Code              | When                                                                                               |
| ------ | ----------------- | -------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request` | `kind` outside the six.                                                                            |
| 401    | `not_signed_in`   |                                                                                                    |
| 404    | `item_not_found`  | No such item, **or the viewer may not see it**. Byte-identical to a nonexistent uuid. Never `403`. |
| 429    | `rate_limited`    | 60 per minute per member.                                                                          |

**Transformations**

- ```sql
  INSERT INTO item_reactions (id, item_id, member_id, kind, created_at)
  VALUES (:id, :itemId, :me, :kind, :now)
  ON CONFLICT (item_id, member_id) DO UPDATE SET kind = excluded.kind;
  ```
  `created_at` is **not** touched on a change, so the moment somebody first said
  something stands, and the ordering inside a kind stays stable when somebody
  changes their mind.
- Idempotent: setting the kind you already have is one statement and changes
  nothing.
- **Return rows, not aggregates.** The popover needs the names anyway, and at
  family scale the list is smaller than the aggregate that would summarise it.
- **Order the kinds by `(count DESC, canonical position ASC)`**, the canonical
  positions being `REACTION_ORDER`. The client sorts by count with no tiebreak,
  so four loves and four cares would swap places between page loads. Within a
  kind, `members` is ordered by `created_at ASC`.
- `myKind` is the viewer's own kind, or `null`.

**Performance** One upsert on the unique index, then one read of
`item_reactions` by `item_id` (the unique index covers the prefix) resolved
against the members table already in memory.

#### `DELETE /api/items/:itemId/reaction`

**Surface** 3 `photo`, state `reactions` · 4 `video`, state `paused`
**Auth** session required · **Role** any member

**Request**

```ts
interface ClearItemReactionRequest {
  path: { itemId: string };
}
```

**Response** `204`, no body. Unreacting is the case `conventions.md` § Envelope
names for `204`: the client removes its own row from the summary it is holding,
and there is nothing else to say.

**Errors**

| Status | Code             | When                                                                                               |
| ------ | ---------------- | -------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`  |                                                                                                    |
| 404    | `item_not_found` | No such item, **or the viewer may not see it**. Byte-identical to a nonexistent uuid. Never `403`. |
| 429    | `rate_limited`   |                                                                                                    |

**Transformations** `DELETE FROM item_reactions WHERE item_id = :itemId AND
member_id = :me`. Deleting a reaction that is not there is a `204`, not a `404`:
the route is idempotent, and the outcome the caller asked for holds either way.
The `404` is about the item, never about the reaction.

**Performance** One delete on the unique index.

#### `PUT /api/comments/:commentId/reaction`

**Surface** 3 `photo`, state `viewer` · 4 `video`, state `paused`
**Auth** session required · **Role** any member

**Request**

```ts
interface SetCommentReactionRequest {
  path: { commentId: string };
  body: { kind: ReactionKind };
}
```

**Response** `200`

```ts
type SetCommentReactionResponse = ReactionSummary;
```

**Errors**

| Status | Code                | When                                                                                                                                                                                   |
| ------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`   | `kind` outside the six.                                                                                                                                                                |
| 401    | `not_signed_in`     |                                                                                                                                                                                        |
| 404    | `comment_not_found` | No such comment, **or the viewer may not see its item**. Byte-identical to a nonexistent uuid. Never `403`: reacting on an invisible item leaks the item just as surely as opening it. |
| 429    | `rate_limited`      |                                                                                                                                                                                        |

**Transformations** Identical to the item route against `comment_reactions` and
`UNIQUE (comment_id, member_id)`, including the ordering and the untouched
`created_at`. The comment's item is resolved under the predicate first; there is
no separate reaction visibility.

**Performance** One upsert, one read by `comment_id`. This single-comment read is
the only place a per-comment reaction query is correct; in the item viewer the
same data is one batched `comment_id IN (...)`.

#### `DELETE /api/comments/:commentId/reaction`

**Surface** 3 `photo`, state `viewer` · 4 `video`, state `paused`
**Auth** session required · **Role** any member

**Request**

```ts
interface ClearCommentReactionRequest {
  path: { commentId: string };
}
```

**Response** `204`, no body.

**Errors**

| Status | Code                | When                                                                                                        |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`     |                                                                                                             |
| 404    | `comment_not_found` | No such comment, **or the viewer may not see its item**. Byte-identical to a nonexistent uuid. Never `403`. |
| 429    | `rate_limited`      |                                                                                                             |

**Transformations** `DELETE FROM comment_reactions WHERE comment_id =
:commentId AND member_id = :me`. Idempotent, as above.

**Performance** One delete on the unique index.

### What is in it

Both routes replace the whole set, which is what the chip rows on the surface
actually express: you add or remove chips and press nothing. A `PUT` of the
final set is idempotent, needs no per-chip route, and cannot half-apply.

#### `PUT /api/items/:itemId/tags`

**Surface** 3 `photo`, states `uploader`, `describe`
**Auth** session required · **Role** uploader or admin

**Request**

```ts
interface SetItemTagsRequest {
  path: { itemId: string };
  /** Names as typed, spaces intact. Not ids: the field is free text and the chip row can invent one. */
  body: { tags: string[] };
}
```

**Response** `200`

```ts
type SetItemTagsResponse = ItemDetail;
```

**Errors**

| Status | Code                  | When                                                                                                              |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`     | A blank name; a name over 100 characters; more than 50 tags on one item.                                          |
| 401    | `not_signed_in`       |                                                                                                                   |
| 403    | `item_edit_forbidden` | Role `viewer`.                                                                                                    |
| 404    | `item_not_found`      | No such item, **or the viewer may not see it**. Byte-identical to a nonexistent uuid, and checked before the 403. |

**Transformations**

1. Normalise each name for matching: trimmed, lowercased, whitespace-collapsed,
   NFC. That is `tags.name_normalized`, and it is what stops "Hospital" becoming
   a second tag beside "hospital".
2. Deduplicate the request against the normalised form, preserving the order the
   names arrived in.
3. Find or create each `tags` row on `name_normalized`, setting `created_by` on
   a create. **An existing tag keeps its stored `name`.** Typing "hospital" on
   an item whose archive already spells it "Hospital" attaches the existing row
   and does not rename it under the other two hundred items carrying it.
4. Diff `item_tags` for this item: delete the rows no longer present, insert the
   new ones with `tagged_by` and `tagged_at`. Do not delete and reinsert the
   whole set, which would rewrite the provenance of tags nobody touched.
5. `tags` rows are never deleted here. A tag that ends up on no items is a
   directory entry with a count of zero, which is a state slice B renders.
6. No `item_views` increment; no `activity_events` row.

**Performance** One batched `SELECT ... WHERE name_normalized IN (...)` on the
unique index, one insert per genuinely new tag, one diffed delete and one
batched insert on `item_tags (item_id, tag_id)`, then the `GET` read set without
its write. Never one lookup per chip.

#### `PUT /api/items/:itemId/people`

**Surface** 3 `photo`, states `uploader`, `describe`
**Auth** session required · **Role** uploader or admin

**Request**

```ts
interface SetItemPeopleRequest {
  path: { itemId: string };
  /** Existing people by id; somebody the archive has never heard of by name. */
  body: { people: PersonInput[] };
}
```

**Response** `200`

```ts
type SetItemPeopleResponse = ItemDetail;
```

**Errors**

| Status | Code                  | When                                                                                                              |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`     | A `personId` that names no person; a blank `displayName`; more than 30 people on one item.                        |
| 401    | `not_signed_in`       |                                                                                                                   |
| 403    | `item_edit_forbidden` | Role `viewer`.                                                                                                    |
| 404    | `item_not_found`      | No such item, **or the viewer may not see it**. Byte-identical to a nonexistent uuid, and checked before the 403. |

**Transformations**

1. A `{ displayName }` entry creates a `people` row with `created_by` set. It
   **never** sets `member_id`: the link between a person and an account is made
   elsewhere, and a person record may never get one.
2. Diff `item_people` as for tags, with `tagged_by` and `tagged_at`. Removing
   somebody deletes the join row only; `item_people.person_id` is `RESTRICT`
   against deleting the _person_, which is a different act and is not this
   route.
3. **`PersonRef` never carries `memberId`**, on this route or anywhere: members
   and non-members are shown alike, because holding an account is a permission
   fact and this is a family (`conventions.md` § Forbidden in any payload).
4. **The response's `media.altText` recomposes**, because the people are half of
   what composes it. Tagging Mamá changes the alt text from "Mateo and Papá,
   14 September 2026" to "Mateo, Papá and Mamá, 14 September 2026" in the same
   response, with no override written. This is the reason these routes return
   the whole `ItemDetail` rather than the slice they changed.
5. **A people tag is not a key.** Adding somebody grants them nothing: they do
   not gain access to a photograph they could not already see, and `item_people`
   must not appear in any visibility expression (Decision 7). What it does grant
   is the right to ask for the item to come down (`capabilities.canRequestRemoval`),
   which is slice E's route.
6. Response order is `tagged_at ASC, display_name ASC`, and the alt text
   composition uses the same order.

**Performance** As for tags, plus the alt text recomposition, which needs no
extra query: the people are already loaded by the diff.

### Visibility

**Rules are immutable from the product's edit path.** A rule covers 264 files in
the fixtures, so editing one in place to change one photograph would change the
other 263 (`data-model.md` § What that costs). Changing an item's visibility
therefore **repoints** it: `POST /api/visibility-rules/resolve` finds or creates
the rule for a `(mode, subject set)`, and the two write routes below do one
`UPDATE items SET visibility_rule_id = ?`. Nothing in this slice issues an
`UPDATE visibility_rules` or touches `visibility_rule_subjects` on an existing
rule, ever.

Two round trips for one save is the point rather than an accident: choosing a
rule is idempotent and shared, pointing an item at one is neither.

#### `PATCH /api/items/:itemId/visibility`

**Surface** 3 `photo`, state `visibility`
**Auth** session required · **Role** uploader or admin

**Request**

```ts
interface SetItemVisibilityRequest {
  path: { itemId: string };
  /** From POST /api/visibility-rules/resolve. Mode and subjects are not accepted here. */
  body: { visibilityRuleId: string };
}
```

**Response** `200`

```ts
type SetItemVisibilityResponse = ItemDetail;
```

**Errors**

| Status | Code                        | When                                                                                                                                                                 |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`           | `visibilityRuleId` names no rule. `details.fieldErrors.visibilityRuleId`. Not a `404`: rules are not visibility-scoped and the item is the resource being addressed. |
| 401    | `not_signed_in`             |                                                                                                                                                                      |
| 403    | `item_visibility_forbidden` | **Role `viewer`.** This is the canonical `403` in this slice: the viewer can see the photograph, it plainly exists, and their role forbids setting who else sees it. |
| 404    | `item_not_found`            | No such item, **or the viewer may not see it**. Byte-identical to a nonexistent uuid, and checked before the 403, so a `403` never confirms that an id exists.       |

**Transformations**

1. Resolve the item under the predicate (`404`), then the role (`403`), in that
   order.
2. `UPDATE items SET visibility_rule_id = :ruleId WHERE id = :itemId`. One
   column. The old rule is left exactly as it was, still covering every other
   item pointing at it.
3. A no-op (the item already points at that rule) returns `200` with no write
   and no log row.
4. Write an `activity_events` row, kind `item_visibility_changed`, carrying the
   previous and the new rule id and their composed labels in `detail_json`.
   Visibility is one of the three things the state tables cannot answer later,
   because only the current value survives (`data-model.md`
   § What is not logged).
5. The change is retroactive by construction: groups expand at read time, so
   nothing is snapshotted and nothing needs recomputing. `visibility.label` in
   the response is composed from the new rule's subjects, never stored, because
   a stored label goes stale the moment a group is renamed.
6. An item can be made invisible to the person setting it. The uploader still
   sees it through clause 2 of the evaluation, and an admin sees everything
   always; both are correct and neither needs a guard.

**Performance** One point-update, one insert, then the `GET` read set without
its write. `visibleRuleIds` is cached per `(memberId, visibilityGeneration)` and
this route does not bump the generation: repointing an item changes no rule's
subjects and no member's role, so nobody's cache is invalidated.

#### `POST /api/items/visibility`

**Surface** 3 `photo`, state `visibility` (the same control, driven from a
timeline selection; the selection itself is slice B)
**Auth** session required · **Role** uploader or admin

**Request**

```ts
interface SetItemsVisibilityRequest {
  body: { itemIds: string[]; visibilityRuleId: string };
}
```

`itemIds` holds between 1 and 1000 ids. A whole day is 212 in the fixtures and a
whole upload 264, so the cap is generous and still bounds one transaction.

**Response** `200`

```ts
interface SetItemsVisibilityResponse {
  items: ItemSummary[];
  nextCursor: null;
}
```

`nextCursor` is structurally present and always `null`: the response set is
bounded by the request, so there is nothing to page.

**Errors**

| Status | Code                        | When                                                                                                                                                                                                                                          |
| ------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`           | Empty `itemIds`, more than 1000, a duplicate id, or a `visibilityRuleId` naming no rule.                                                                                                                                                      |
| 401    | `not_signed_in`             |                                                                                                                                                                                                                                               |
| 403    | `item_visibility_forbidden` | Role `viewer`. Checked once for the request, not per item.                                                                                                                                                                                    |
| 404    | `item_not_found`            | **Any** id in `itemIds` that does not exist **or that the viewer may not see**. Byte-identical to the single-item `404`, with no `details` naming which ids failed: a list of the ids that survived is a count of what the viewer cannot see. |

**Transformations**

1. **All or nothing, in one transaction.** Resolve every id under the predicate
   first; one miss fails the whole request with the `404` above. Only then check
   the role, once. Partial application was rejected: "4 of 6 updated" is a
   per-id oracle, and a selection the client built from a timeline it can
   already see should never contain an id it cannot.
2. One `UPDATE items SET visibility_rule_id = :ruleId WHERE id IN (...)`.
3. One `activity_events` row **per item**, kind `item_visibility_changed`, not
   one row for the batch. The audit log is read by subject id, and a batch row
   answers no question anybody asks of it.
4. Items already pointing at the rule are included in the response and written
   neither to `items` nor to the log.
5. The response carries `ItemSummary`, not `ItemDetail`: the caller is a
   selection on the timeline and wants its prints refreshed, not 264 comment
   threads.

**Performance** One batched `SELECT ... WHERE id IN (...)` under the predicate,
one batched `UPDATE`, one batched insert into `activity_events`, then one
batched read for the summaries with one batched rendition query. Six queries for
264 items. The single SQLite writer is held for one bounded transaction, which
is why the cap exists.

#### `POST /api/visibility-rules/resolve`

**Surface** 3 `photo`, state `visibility`
**Auth** session required · **Role** uploader or admin

**Request**

```ts
interface ResolveVisibilityRuleRequest {
  body: {
    mode: "everyone" | "only" | "except";
    subjects: { kind: "member" | "group"; id: string }[];
  };
}
```

**Response** `200`

```ts
interface ResolveVisibilityRuleResponse {
  visibilityRuleId: string;
  /** The same shape the item carries, so the confirmation line reads off one source. */
  visibility: VisibilitySummary;
}
```

`200` rather than `201`, because the commonest outcome by far is that the rule
already existed and the caller cannot tell, and should not have to.

**Errors**

| Status | Code                        | When                                                                                                                          |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`           | A subject id naming no member or no group; a removed member; `mode: "only"` with no subjects. `details.fieldErrors.subjects`. |
| 401    | `not_signed_in`             |                                                                                                                               |
| 403    | `visibility_rule_forbidden` | Role `viewer`. Nothing here is item-scoped, so there is no `404` in this table.                                               |

**Transformations**

1. Canonicalise the subjects: drop duplicates, then sort by `kind` (`group`
   before `member`) and then by `id`. The sort is what makes the digest stable
   across two clients that listed the same people in a different order.
2. `subject_digest` is a hash of the canonical list, `''` for `everyone`.
3. `mode: "everyone"` short-circuits to the seeded rule's constant id with no
   lookup at all. That row is created at migration time precisely so the default
   costs nothing.
4. `mode: "except"` with no subjects is an exception to nobody, and is
   normalised to the seeded `everyone` rule rather than stored as a second way
   of saying the same thing.
5. `mode: "only"` with no subjects is a `400`. On this surface it is always an
   unfinished form (the control renders it as "Nobody yet"). The genuine
   empty-allow-list case, where a rule's last subject is removed and it fails
   closed to admins, arises from a group deletion and belongs to the Groups
   surface, which is required to tell the admin about it.
6. Otherwise `SELECT id FROM visibility_rules WHERE mode = :mode AND
subject_digest = :digest ORDER BY id LIMIT 1`. The index on
   `(mode, subject_digest)` is **not unique**, deliberately: deleting a member
   can make two previously distinct rules collide, and tolerating an equivalent
   duplicate is cheaper than merging them mid-transaction. Two rows with one
   digest have the same subject list by construction, so taking the lowest
   uuidv7 (the oldest) is both correct and deterministic.
7. On a miss, insert the `visibility_rules` row and its
   `visibility_rule_subjects` in one transaction. Two concurrent resolves of the
   same set can create two equivalent rules; that is tolerated for the same
   reason the index is not unique.
8. **This route never updates an existing rule and never deletes one.** Rules
   accumulate, and a sweeper elsewhere drops the ones no item references; see
   "Open questions" 2.
9. `visibility.label` is composed from the subjects at read time ("Just us two"),
   never stored.

**Performance** One indexed probe on `(mode, subject_digest)`, and on a miss one
insert plus one insert per subject. The member and group validation reads tables
of tens of rows. The `visibilityGeneration` is **not** bumped: creating a rule
changes nobody's group membership, nobody's role and no existing rule's
subjects, so no viewer's cached `visibleRuleIds` becomes stale.

### The capture date

#### `POST /api/items/:itemId/capture-date`

**Surface** 3 `photo`, state `fix-date`
**Auth** session required · **Role** uploader-of-item-or-admin

A `POST` to a noun sub-resource, because REST cannot express "correct this"
(`conventions.md` § Paths), and it is the one edit in the product that destroys
a fact the file carried.

**Request**

```ts
interface SetCaptureDateRequest {
  path: { itemId: string };
  body: {
    /** The day it was taken, local, YYYY-MM-DD. */
    capturedOn: string;
    /** "HH:MM" or "HH:MM:SS", local. Omit or send null to keep the clock time. */
    capturedTime?: string | null;
  };
}
```

**Response** `200`

```ts
type SetCaptureDateResponse = ItemDetail;
```

The response carries the new `burst` (often `null`, because the item has just
been ejected from one) and the new `milestones` with their
`spanContainsCapturedOn` and `mismatchAcknowledgedAt`, which is what lets the
surface say "you will be asked what to do about that next" truthfully.

**Errors**

| Status | Code                          | When                                                                                                                                                                                             |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`             | `capturedOn` not `YYYY-MM-DD`; `capturedTime` unparseable; a date after today in the Shoebox timezone.                                                                                           |
| 401    | `not_signed_in`               |                                                                                                                                                                                                  |
| 403    | `item_capture_date_forbidden` | The viewer can see it and did not upload it, and is not an admin. Note this is **item ownership**, not the uploader role: Decision 10 gives the hand correction to "its uploader and any admin". |
| 404    | `item_not_found`              | No such item, **or the viewer may not see it**. Byte-identical to a nonexistent uuid, and checked before the 403.                                                                                |

**Transformations**, in this order, in one transaction:

1. Resolve the item under the predicate (`404`), then ownership or admin
   (`403`).
2. **Preserve the clock time and change only the date.** With `capturedTime`
   omitted, read the item's existing local wall clock from `captured_at` plus
   `captured_at_offset_minutes`, or, when that offset is null, resolve
   `captured_at` in the `shoebox.timezone` setting. Recombine that same wall
   clock with `capturedOn` and convert back to UTC. A 06:41 photograph becomes
   06:41 on the new day and **no fact is invented**. With `capturedTime` given,
   it replaces the wall clock and nothing else changes about the derivation.
   `captured_at_offset_minutes` is carried across unchanged: moving a
   photograph to another day does not move the camera to another country. Where
   recombining lands on a daylight-saving discontinuity, an ambiguous wall clock
   takes the earlier (standard) offset and a nonexistent one is shifted forward
   by the size of the gap.
3. Write `captured_on` from the new local date, not from `date(captured_at)` in
   UTC, which would put a 23:30 local photograph on the wrong day and therefore
   under the wrong milestone.
4. Set `capture_source`. See "Open questions" 1: Decision 10 names `'manual'`,
   the `items` `CHECK` does not permit it, and `'uploader_set'` is written here
   until the coordinator settles it.
5. **`items.original_captured_at` is never written** (Decision 10). "Revert to
   what the file said" stays one step away however many times the date is moved,
   and that is the whole reason the column is frozen at ingest.
6. If the new `captured_at` equals the old, stop: return `200`, write nothing,
   and record no audit row. A no-op is not a correction.
7. **Insert an `item_capture_date_changes` row**: `item_id`, `milestone_id`
   `NULL` (this path is the hand correction, not a reconciliation),
   `previous_captured_at`, `previous_capture_date`, `previous_capture_source`,
   `new_captured_at`, `new_capture_date`, `changed_by = :me`, `changed_at`, and
   `reason = 'manual'`.
8. **Eject the item from its burst if it has left the burst's day.** If
   `burst_id IS NOT NULL` and the new `captured_on` differs from
   `bursts.captured_on`, set `items.burst_id = NULL` and `burst_index = NULL`. A
   burst is a same-day run by definition, so a frame on another day is not part
   of it. The other forty-four stay exactly where they are. If the ejected frame
   was the burst's `cover_item_id`, the foreign key nulls it and the cover
   re-resolves at read time to the earliest visible frame.
9. **Drop the burst if that emptied it.** If no items remain with that
   `burst_id`, `DELETE FROM bursts WHERE id = :burstId`. No foreign key
   direction does this. One remaining frame does not drop the burst; it renders
   as a plain print.
10. **Re-arm the milestone reconciliation.** For every `item_milestones` row
    whose milestone span no longer contains the new `captured_on`, set
    `span_mismatch_acknowledged_at = NULL`, so the **existing** flow is offered
    again rather than a new one being invented. Clearing it is what stops a
    considered "Leave them as they are" from silently outliving the fact it was
    a decision about. Rows whose span still contains the item are left alone.
11. **Attach and detach nothing.** An item may be attached to a milestone whose
    span does not contain it, and that is allowed. The reconciliation offer, and
    the question of which day of a multi-day occasion an item belongs to, are
    slice G's.
12. **No `activity_events` row.** `item_capture_date_changes` is the audit trail
    for this edit, and the log records only what the state tables cannot answer
    later.
13. Widening the occasion instead of moving the photograph is one
    `UPDATE milestones`, is not audited, and is slice G's route, not this one.

**Performance** One point-update, one insert, at most one existence probe on
`items (burst_id, burst_index)` and one delete on `bursts`, one small update
over the item's `item_milestones` rows (tens at most), then the `GET` read set
without its write. Nothing here scales with the archive.

## Shared types in this slice

```ts
/**
 * The permalink payload. Extends the frozen ItemSummary rather than restating
 * it, so the print in the pile and the print on its own page cannot drift.
 */
interface ItemDetail extends ItemSummary {
  captureSource:
    | "exif"
    | "video_metadata"
    | "filename"
    | "file_mtime"
    | "uploader_set"
    | "upload_time";
  /** The UTC offset the file carried. Null means it carried none. */
  capturedAtOffsetMinutes: number | null;
  /** Frozen at ingest. What "revert to what the file said" reverts to (Decision 10). */
  originalCapturedAt: string;
  /**
   * Null unless somebody typed a real description. Pre-fill the description
   * field from this, never from media.altText, or a generated default becomes
   * a typed override on the next save (Decision 9).
   */
  altTextOverride: string | null;
  /** 1-based over the VISIBLE siblings, against burst.visibleFrameCount. Null outside a burst. */
  burstPosition: number | null;
  /** Up to 60 visible siblings. The rest come from GET /api/bursts/:burstId/frames. */
  burstFrames: BurstFrameRef[];
  tags: TagRef[];
  people: PersonRef[];
  milestones: AttachedMilestone[];
  /** Oldest first. Complete: this slice does not paginate a photograph's thread. */
  comments: CommentDto[];
  reactions: ReactionSummary;
  capabilities: ItemCapabilities;
}

/** One frame in the sibling strip. */
interface BurstFrameRef {
  itemId: string;
  /**
   * 1-based, dense over the visible frames only. Never items.burst_index:
   * a gap in the stored index is a count of what the viewer cannot see.
   */
  position: number;
  thumb: MediaSource;
  /** Composed exactly as MediaRef.altText is. */
  altText: string;
}

/**
 * A milestone this item is attached to. An item may be attached to one whose
 * span does not contain it, which is allowed and is what the reconciliation
 * flow is for (slice G).
 */
interface AttachedMilestone extends MilestoneRef {
  spanContainsCapturedOn: boolean;
  /** Null re-arms the reconciliation offer; a timestamp means "leave them as they are". */
  mismatchAcknowledgedAt: string | null;
}

/**
 * What this viewer may do here. Commenting and reacting are absent because
 * holding this payload is the permission: everybody who can open an item can
 * comment on it and react to it (spec.md § Visibility).
 */
interface ItemCapabilities {
  /** Role uploader or admin, on any visible item. */
  canSetVisibility: boolean;
  canEditTags: boolean;
  canEditPeople: boolean;
  canDescribe: boolean;
  /** items.uploaded_by = me, or admin. Ownership, not the uploader role (Decision 10). */
  canFixCaptureDate: boolean;
  /** items.uploaded_by = me, or admin (the cascade matrix). */
  canDelete: boolean;
  /** The viewer's linked person is in item_people and they are not the uploader. Slice E owns the route. */
  canRequestRemoval: boolean;
  /** Viewer.isAdmin. Slice H owns GET /api/items/:itemId/viewers. */
  canSeeViewers: boolean;
}

/** Existing people by id, somebody the archive has never heard of by name. */
type PersonInput = { personId: string } | { displayName: string };

/**
 * The canonical order, and therefore the tiebreak when two kinds have the same
 * count. The client sorts by count with no tiebreak, so four loves and four
 * cares would swap places between page loads without it.
 */
const REACTION_ORDER: readonly ReactionKind[] = [
  "like",
  "love",
  "care",
  "haha",
  "wow",
  "sad",
];

/** Appended to the registry in conventions.md § Error code registry. */
type ItemsErrorCode =
  | "item_not_found" // 404, and never 403
  | "item_edit_forbidden" // 403, role only
  | "item_visibility_forbidden" // 403, role only
  | "item_capture_date_forbidden" // 403, ownership or admin
  | "item_delete_forbidden" // 403, ownership or admin
  | "burst_not_found" // 404
  | "comment_not_found" // 404, including when the item is invisible
  | "comment_edit_forbidden" // 403, author only
  | "comment_delete_forbidden" // 403, author or admin
  | "visibility_rule_forbidden"; // 403, role only
```

## Additions requested to the frozen DTOs

1. **`MediaRef.original: MediaSource | null`.** Both viewers carry "Download the
   original", and `MediaRef` has no member for `item_renditions.purpose =
'original'`. Nothing in this slice's routes can serve that button without it.
   The alternative, if the coordinator would rather not widen `MediaRef`, is a
   `GET /api/items/:itemId/original` that resolves the key and redirects to a
   freshly signed URL, which also gets a sensible filename into the
   `Content-Disposition` without a payload field. Either works; neither exists
   yet, and no slice in the split obviously owns it. `MediaRef` is used
   unwidened throughout this document in the meantime.

2. **`VisibilitySummary.visibilityRuleId: string`.** The edit control has to
   pre-fill from the current rule and detect a no-op save, and a selection has to
   know whether its items already share one rule before it offers to change
   them. `subjects` gets the form pre-filled but not the identity, so today the
   client would have to re-resolve a digest it has no way to compute. The id is
   an opaque uuid that reveals strictly less than the `subjects` list already
   beside it, and it only ever appears on an item the viewer can see.

## Open questions for the coordinator

1. **"Any uploader" or "the item's uploader"?** `spec.md` § Visibility says
   visibility may be changed "by any uploader or admin" and the roles table
   lists "set item visibility" and "add tags, people tags and milestones" with
   no ownership qualifier, while deletion is qualified ("delete their **own**
   uploads", and `data-model.md` states the predicate) and so is the capture
   date (Decision 10: "its uploader and any admin"). This document takes the
   sources literally: the uploader **role** for visibility, tags, people and alt
   text on any visible item; item **ownership** for the capture date and for
   deletion. If that split is not intended, four `Role` lines and
   `ItemCapabilities` change together.

2. **`capture_source = 'manual'` is not a permitted value.** Decision 10 and
   `data-model.md` § `item_capture_date_changes` both name it, but the `items`
   `CHECK` is `IN ('exif','video_metadata','filename','file_mtime',
'uploader_set','upload_time')`. This slice writes `'uploader_set'`, the
   nearest permitted value. Either add `'manual'` to the `CHECK` (which reads
   better on the surface, since "uploader set" is also what the upload flow's
   rung-5 date picker means) or amend the decision. It is a migration either
   way, so it wants settling before slice D writes the column.

3. **Who runs the visibility-rule sweeper?** `data-model.md` § What that costs
   says "rules need sweeping when no item references them", and
   `POST /api/visibility-rules/resolve` creates rules that nothing may ever point
   at. The four jobs in `conventions.md` § The job runner do not include it. This
   slice cites a sweeper that does not currently exist anywhere in the contract.

4. **The alt text string contains a rendered date**, which is the one formatted
   date any payload in this contract carries. It is unavoidable: `MediaRef.altText`
   is frozen as a composed string, and a screen reader needs prose, not an ISO
   timestamp. This slice renders the date in `shoebox.timezone` with English
   month names. Confirm that, and confirm the locale, since the string is
   composed server-side and cannot follow the reader's.

5. **Comment body length.** Not in the data model. This slice caps it at 4000
   characters, alt text at 2000, a tag name at 100, and an item at 50 tags and 30
   people. All five are proposals.

6. **Does the sibling strip latch `first_seen_at`?** `GET /api/items/:itemId`
   counts the open for the item it returns and writes nothing for the sixty
   thumbnails beside it, which are impressions. Whoever owns the seen latch
   (slice B) should say whether a fanned burst marks its frames seen, because
   the alternative leaves the accent dot lit on frames the viewer has plainly
   looked at.

7. **`AttachedMilestone` may collide with slice G.** It is `MilestoneRef` plus
   the two fields the item viewer needs to know whether a reconciliation is
   pending (`spanContainsCapturedOn`, `mismatchAcknowledgedAt`). If slice G
   defines a near-identical shape, merge them rather than keeping both.
