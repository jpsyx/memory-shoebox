# Removal requests

Asking for a photograph to come down, and every way that ask can end: deleted,
declined, or withdrawn. Covers surface 10 (Request removal) and surface 15
(Removal requests) in all ten of their states. **Not here**: item deletion
itself, which is `DELETE /api/items/:itemId` and belongs to agent C (the
contract this slice imposes on it is stated below, and is authoritative); the
payloads and recipient sets of the three removal emails, which belong to agent
H; the activity log; and the `removal-reminder` job, which is a job and not a
route (`conventions.md` § The job runner).

## Routes

| Method | Path                                        | Auth    | Role                       | Purpose                                                   |
| ------ | ------------------------------------------- | ------- | -------------------------- | --------------------------------------------------------- |
| POST   | `/api/items/:itemId/removal-requests`       | session | any, **plus the tag gate** | Ask for this one to come down.                            |
| GET    | `/api/removal-requests`                     | session | uploader \| admin          | The queue: what I can act on, open or settled.            |
| GET    | `/api/items/:itemId/removal-requests`       | session | any                        | What I and others have asked here, and whether I may ask. |
| POST   | `/api/removal-requests/:requestId/decline`  | session | uploader-of-item-or-admin  | Keep it, and say why. The reason is compulsory.           |
| POST   | `/api/removal-requests/:requestId/withdraw` | session | self                       | Never mind, by the person who asked.                      |

There is deliberately no `POST /api/removal-requests/:requestId/accept`.
**Deleting is the resolution**, so the "Delete it" button on both surfaces
calls `DELETE /api/items/:itemId`, using the `itemId` carried on the request.
See "The resolution this slice does not own".

### The tag gate, which is the authorisation for asking

**Anyone can request removal of an item they are people-tagged in**
(`spec.md` § Deletion and takedown, and the Roles ladder, where every role
carries the row "Request removal of an item they are tagged in"). The
predicate, evaluated only on `POST /api/items/:itemId/removal-requests`:

```sql
EXISTS (
  SELECT 1 FROM item_people ip
  JOIN people p ON p.id = ip.person_id
  WHERE ip.item_id = :itemId AND p.member_id = :viewerMemberId
)
```

The join runs through `people.member_id`, because the link to an account sits
on `people` and not on `members` (`data-model.md` § `tags`, `item_tags`,
`people`, `item_people`).

**This is the one place in the entire API where `item_people` is consulted for
anything resembling a permission, and it is not a visibility grant.** It does
not extend the visibility predicate, which stays exactly
`visibility_rule_id IN (:visibleRuleIds) OR uploaded_by = :viewerMemberId`
(`conventions.md` § The visibility predicate, Decision 7). Two consequences
that must be written into the handler in this order:

1. **The visibility predicate is evaluated first, and alone.** A viewer who
   cannot see the item gets `404 item_not_found` even when they are tagged in
   it. A people tag is never a key, and being in a photograph restricted to
   admins must not tell you that the photograph exists (`spec.md` §
   Visibility; `data-model.md` § The evaluation).
2. **The tag gate only ever subtracts.** It can refuse a request on a visible
   item; it can never admit one on an invisible item, and it appears in no
   `SELECT` that lists items anywhere in the product. A test named for this
   belongs beside the one the data model already asks for.

An admin is not exempt. An admin who is not tagged and wants a photograph gone
deletes it; they do not file a request against themselves.

### Who can see a removal request

One rule, used by every route below that takes a `:requestId`. A
`removal_requests` row is visible to exactly three parties:

- the member who made it (`requested_by_member_id`);
- the member named in the snapshot `item_uploader_member_id`;
- any admin.

**Everybody else gets `404 removal_request_not_found`**, byte-identical to a
nonexistent id: same status, same code, same message. This is what makes the
ask form's promise true in the API rather than only on the screen ("It only
goes to Papá and the admins, never to everybody else"). A 403 there would
confirm that somebody has asked about that photograph, which is precisely the
disclosure the copy rules out.

Note the split, because it is easy to muddle:

| Route shape              | Gate                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `:itemId` in the path    | The visibility predicate on the item. Fails to `404 item_not_found`.  |
| `:requestId` in the path | The three-party rule above. Fails to `404 removal_request_not_found`. |

The three-party rule does **not** re-check item visibility. A requester who
could see an item when they asked, and whose access was narrowed afterwards by
an admin editing a rule, keeps their own row: it is theirs, they wrote the
reason on it, and stranding an open request they can no longer withdraw would
be worse than useless. Nothing is disclosed, because they already know the
item existed. What they do not get back is the picture: `media` resolves
through the viewer's visibility predicate and comes back `null`.

---

## Asking

#### `POST /api/items/:itemId/removal-requests`

**Surface** 10 `removal`, states `ask`, `already`, `declined` (the "Ask again"
button after a decline)
**Auth** session required · **Role** any signed-in member, subject to the tag
gate above

**Request**

```ts
/** Path. */
interface CreateRemovalRequestParams {
  itemId: string;
}

/** Body. */
interface CreateRemovalRequestRequest {
  /**
   * Optional by design (`data-model.md` § `removal_requests`). The form says
   * so, because making it compulsory would stop people asking at all.
   */
  reason?: string | null;
}
```

**Response** `201` `interface CreateRemovalRequestResponse` = `RemovalRequestDto`

**Errors**

| Status | Code                        | When                                                                                                             |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`           | `reason` over the length cap. `details.fieldErrors.reason`.                                                      |
| 401    | `not_signed_in`             | No session, or an expired one.                                                                                   |
| 403    | `removal_request_forbidden` | The item exists, the viewer may see it, and they are not people-tagged in it. See the note below.                |
| 404    | `item_not_found`            | No such item, **or the viewer's visibility predicate excludes it**. Byte-identical in both cases, tagged or not. |
| 409    | `removal_already_requested` | The viewer already has an open request on this item.                                                             |
| 429    | `rate_limited`              | Middleware, at the blanket authenticated limit.                                                                  |

The 403 is the one place this slice returns 403 outside a pure role check, and
it is safe because it discloses nothing: the viewer can already see the item
and can already see its people tags, so they can see that they are not among
them. It is raised in "Open questions" for the coordinator to confirm or
overrule. The 404 is not negotiable and must be produced before the tag gate
is evaluated at all.

**409 is the partial unique, not a read-then-write.**
`removal_requests__one_open_per_asker` is
`UNIQUE (item_id, requested_by_member_id) WHERE state = 'open'`. Attempt the
insert and map the constraint violation to `409 removal_already_requested`;
checking first and inserting second is a race with no benefit. The index is
partial deliberately: a declined request offers "Ask again", which a full
unique would forbid (`data-model.md` § `removal_requests`), so a member may
hold any number of settled requests on one item and exactly one open one.

**The 409 is a race guard, not the surface's state machine.** The "already
asked" state is rendered from `GET /api/items/:itemId/removal-requests` when
the surface opens, before the member presses anything. Nobody should ever meet
this error by pressing a button the client should not have offered.

**Transformations**

- The three snapshot columns are written in the same `INSERT`, read from the
  item row that was just visibility-checked: `item_uploader_member_id` from
  `items.uploaded_by`, `item_captured_at` from `items.captured_at`,
  `item_storage_key` from the item's `original` rendition. They exist so a
  settled request can outlive its item and still be correlated with a backup.
- `reason` is trimmed; an empty or whitespace-only string is stored as `NULL`,
  which is the same thing as not sending it. The settled card says "No reason
  given, which is allowed", and that state must be reachable from a form the
  member submitted blank.
- `state = 'open'`, `resolved_at = NULL`, `resolved_by_member_id = NULL`. The
  constraint `CHECK ((state = 'open') = (resolved_at IS NULL))` holds.
- One `removal_request` mail row per recipient is enqueued in the same
  transaction. See "Mail this slice enqueues".

**Performance** One `SELECT` over `items` carrying both the visibility
predicate and the tag `EXISTS`, then one `INSERT`. Two statements, no loop.
The partial unique is also the only rate limiting this route needs beyond the
middleware default: one member cannot hold two open requests on one
photograph, and a family is tens of people.

---

## The queues

#### `GET /api/removal-requests`

**Surface** 15 `removal-requests`, states `open`, `settled`, `none`, and the
`deleting` and `declining` modals, which are drawn over the open list from the
same response
**Auth** session required · **Role** uploader | admin

**Request**

```ts
/** Query. */
interface ListRemovalRequestsRequest {
  /** Default `open`. `settled` is state IN ('deleted','declined','withdrawn'). */
  state?: "open" | "settled";
  /** Default 25, capped at 100. */
  limit?: number;
  /** Opaque. Encodes the uuidv7 `id`, which sorts by creation. */
  cursor?: string;
}
```

**Response** `200`

```ts
interface ListRemovalRequestsResponse {
  removalRequests: RemovalRequestDto[];
  nextCursor: string | null;
  /** Both tab headings, and the two figures on the `none` state. */
  openCount: number;
  settledCount: number;
}
```

**Errors**

| Status | Code                      | When                                                         |
| ------ | ------------------------- | ------------------------------------------------------------ |
| 400    | `invalid_request`         | Unknown `state`, unparseable `cursor`, `limit` out of range. |
| 401    | `not_signed_in`           | No session, or an expired one.                               |
| 403    | `removal_queue_forbidden` | Role `viewer`. A viewer has no queue: they act on nothing.   |

The 403 here is a plain role restriction and is exactly what the status is
for. It discloses nothing about the archive's contents: the response would
have been an empty list regardless.

**Scope, which is the whole route**

| Role     | Rows                                                               |
| -------- | ------------------------------------------------------------------ |
| admin    | Every request. No scope clause, which is both correct and fastest. |
| uploader | `item_uploader_member_id = :viewerMemberId`.                       |
| viewer   | 403. Their own requests live on the item route below.              |

An uploader who has also asked for something of somebody else's to come down
does not see that request here. This queue answers "what can I act on", and
their own ask is theirs to withdraw, not to decide.

**Transformations**

- `openCount` and `settledCount` are computed per request over the same scope
  clause, never stored (`data-model.md` § One rule that outranks the others).
  They are safe to send because the scope is self-limiting: an uploader counts
  only requests against their own uploads, which they can always see
  (Decision 7), and an admin sees everything anyway. Neither figure can
  describe an item the reader may not open.
- `media` is resolved per row through the viewer's visibility predicate and is
  `null` for every request whose item is gone. See "Why `media` is nullable".
- The `deleting` and `declining` modals need no extra fetch: both are drawn
  from the row already in hand, and their buttons call
  `DELETE /api/items/:itemId` and `POST /api/removal-requests/:requestId/decline`.
- Ordered `id DESC`. Because ids are uuidv7 they sort by creation, so this is
  newest first and the cursor is the id alone, with no second column.

**Performance** **The scope is `item_uploader_member_id`, never a join to
`items`.** A join to `items` drops every row whose `item_id` is `NULL`, which
is every request that ended in a deletion, and an uploader would lose their
own resolved history: the settled tab would be permanently empty of exactly
the outcome it most needs to record. The snapshot column exists for this. The
uploader path uses
`removal_requests__open_by_uploader (item_uploader_member_id, state, created_at)`;
the admin path uses `removal_requests__by_state (state, created_at)`. Both
counts come from one grouped query over the same scope, not two round trips.
`MediaRef`s for the surviving items are minted in **one** batched query with
`item_id IN (...)`, never one per card, and members resolve to `MemberRef` from
a single pass over the nine-row `members` table rather than three lookups per
row.

#### `GET /api/items/:itemId/removal-requests`

**Surface** 10 `removal`, states `ask`, `already`, `uploader`, `admin`,
`declined`. **This one route decides which of the five the surface draws**,
before the member presses anything.
**Auth** session required · **Role** any signed-in member

**Request**

```ts
/** Path. */
interface ListItemRemovalRequestsParams {
  itemId: string;
}
```

No query. A single photograph accumulates a handful of requests in its life,
so the collection is never paginated in practice.

**Response** `200`

```ts
interface ListItemRemovalRequestsResponse {
  /** Scoped: see below. Ordered `id DESC`, newest first. */
  removalRequests: RemovalRequestDto[];
  /** Always null here. Kept so the collection envelope is uniform. */
  nextCursor: string | null;
  /** So the surface can draw the item small without a second request. */
  item: ItemSummary;
  /** The viewer is people-tagged here and holds no open request. */
  canRequestRemoval: boolean;
}
```

**Errors**

| Status | Code             | When                                                                                              |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`  | No session, or an expired one.                                                                    |
| 404    | `item_not_found` | No such item, **or the viewer's visibility predicate excludes it**. Byte-identical in both cases. |

There is no 403. An untagged viewer gets `200` with an empty list and
`canRequestRemoval: false`, because there is nothing here to forbid them: the
scope below has already decided they see no rows. The asymmetry with the POST
is deliberate and worth keeping straight. The POST refuses an action on an
item the viewer can see; the GET discloses nothing to refuse.

**Scope of `removalRequests`**, applying the three-party rule per row:

| Viewer                            | Sees                                        |
| --------------------------------- | ------------------------------------------- |
| The requester                     | Their own requests on this item, any state. |
| The item's uploader               | Every request on this item.                 |
| An admin                          | Every request on this item.                 |
| Anybody else who can see the item | An empty list.                              |

**Transformations**

The surface picks its state from this response alone. Write the mapping down
so it is not re-derived per client:

| Surface state | Condition                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `ask`         | `canRequestRemoval` is true and the viewer has no request of their own in the list.               |
| `already`     | The list holds a request of the viewer's with `state: "open"`. `canRequestRemoval` is then false. |
| `declined`    | The viewer's newest own request is `declined`. `canRequestRemoval` is true: "Ask again".          |
| `uploader`    | A request in the list has `canDecline: true` and the viewer is the item's uploader.               |
| `admin`       | The same, for `viewer.isAdmin`. The extra line about the uploader acting first is copy, not data. |

`canRequestRemoval` is the tag gate AND the absence of an open request by this
viewer. It is computed once, from the same `EXISTS` the POST uses, so the
button the client offers and the request the server accepts cannot disagree.

**Performance** One query for the item under the visibility predicate, one for
the requests under the scope, one batched rendition query for `item` and for
any surviving request items. Three statements for the whole surface.

---

## Settling

#### `POST /api/removal-requests/:requestId/decline`

**Surface** 15 `removal-requests`, state `declining`; surface 10 `removal`,
states `uploader` and `admin` ("Keep it, and tell Inés why")
**Auth** session required · **Role** uploader-of-item-or-admin, resolved as
`removal_requests.item_uploader_member_id = :viewerMemberId OR viewer.isAdmin`

**Request**

```ts
/** Path. */
interface DeclineRemovalRequestParams {
  requestId: string;
}

/** Body. */
interface DeclineRemovalRequestRequest {
  /**
   * Compulsory, unlike the asker's `reason`. The requester reads these exact
   * words (`data-model.md` § `outbound_emails`, Decision 12).
   */
  declineReason: string;
}
```

**Response** `200` `interface DeclineRemovalRequestResponse` = `RemovalRequestDto`,
in its post-mutation read shape, `state: "declined"`.

**Errors**

| Status | Code                        | When                                                                                                 |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`           | `declineReason` missing, empty after trimming, or over the cap. `details.fieldErrors.declineReason`. |
| 401    | `not_signed_in`             | No session, or an expired one.                                                                       |
| 403    | `removal_request_forbidden` | The viewer may see the request (they are the requester) but may not answer it.                       |
| 404    | `removal_request_not_found` | No such request, **or the three-party rule excludes the viewer**. Byte-identical in both cases.      |
| 409    | `removal_request_not_open`  | Already `deleted`, `declined` or `withdrawn`. Somebody got there first.                              |

**The compulsory reason is enforced twice, on purpose.** The check constraint
`CHECK (state <> 'declined' OR decline_reason IS NOT NULL)` is the backstop
that makes a silent decline impossible in the database. The handler returns
`400` with the field error before reaching it, so the member sees the form
error the modal was written for ("This is required. A request answered with
silence turns into a phone call") rather than a constraint failure. Whitespace
is trimmed before the emptiness test.

**Transformations**

- One statement, conditional on the current state:

  ```sql
  UPDATE removal_requests
     SET state = 'declined', decline_reason = :reason,
         resolved_at = :now, resolved_by_member_id = :viewerMemberId
   WHERE id = :requestId AND state = 'open';
  ```

  Proceed only if `changes() = 1`, otherwise `409`. This is the same
  claim-by-update idiom the mail queue uses (`data-model.md` §
  `outbound_emails`), and it is what makes two people pressing at the same
  moment safe. `resolved_at` and `state` move together, satisfying
  `CHECK ((state = 'open') = (resolved_at IS NULL))`.

- `resolved_by_member_id` is whoever acted, **not necessarily the uploader**:
  an admin can act first.
- **Declining settles exactly one request.** Two people can be tagged in one
  photograph and both can ask; answering one of them in words says nothing to
  the other, whose request stays open and keeps generating reminders. This is
  the opposite of deleting, which settles them all, and the difference follows
  from what each action does to the photograph.
- One `removal_resolved` mail per recipient, enqueued in the same transaction.
- The modal's third button, "Change who can see it instead", is a different
  route in a different slice (item visibility). It does **not** settle the
  request, and a member who takes it leaves the request open and still
  answerable. The copy is careful about this and the API must be too.

**Performance** One `SELECT` to apply the three-party rule and read the
snapshot, one conditional `UPDATE`, one insert per mail row. No join to
`items`, which may not exist.

#### `POST /api/removal-requests/:requestId/withdraw`

**Surface** 10 `removal`, state `already` ("Withdraw the request")
**Auth** session required · **Role** self, meaning
`removal_requests.requested_by_member_id = :viewerMemberId`

**Request**

```ts
/** Path. */
interface WithdrawRemovalRequestParams {
  requestId: string;
}
```

No body.

**Response** `200` `interface WithdrawRemovalRequestResponse` = `RemovalRequestDto`,
`state: "withdrawn"`.

**Errors**

| Status | Code                        | When                                                                                            |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`             | No session, or an expired one.                                                                  |
| 403    | `removal_request_forbidden` | The viewer may see the request (uploader or admin) but it is not theirs to withdraw.            |
| 404    | `removal_request_not_found` | No such request, **or the three-party rule excludes the viewer**. Byte-identical in both cases. |
| 409    | `removal_request_not_open`  | Already settled.                                                                                |

**An admin cannot withdraw somebody else's request**, and neither can the
uploader. Withdrawing means "never mind", and it is not a sentence anybody
else may put in the asker's mouth. The uploader's and the admin's two ways out
are deleting and declining, and the surface offers exactly those two.

**Transformations**

- The same conditional update, with `state = 'withdrawn'`,
  `resolved_at = :now`, `resolved_by_member_id = :viewerMemberId` (the
  requester, who here is also the resolver). `decline_reason` stays `NULL`.
- **No mail.** Surface 16 designs eight messages and none of them is a
  withdrawal, so this slice enqueues nothing. The weekly reminder stops of its
  own accord, because the job only reads open requests. Raised in "Open
  questions".
- Withdrawing frees the partial unique, so the member may ask again later. The
  withdrawn row stays in the settled tab.

**Performance** One `SELECT`, one conditional `UPDATE`.

---

## The resolution this slice does not own

**`DELETE /api/items/:itemId` is agent C's route.** It is also how a removal
request most commonly ends, so the transition belongs to this slice and is
specified here. Agent C's document will be edited to match this on merge.

In the same transaction that deletes the item, and **before the
`DELETE FROM items`**:

```sql
UPDATE removal_requests
   SET state = 'deleted',
       resolved_at = :now,
       resolved_by_member_id = :deleterMemberId
 WHERE item_id = :itemId AND state = 'open';
```

The ordering is load-bearing. `removal_requests.item_id` is
**`ON DELETE SET NULL`** (`data-model.md` § Deleting an item: the cascade
matrix), so once the item row is gone there is no `item_id` left to find these
rows by, and an update written after the delete silently matches nothing.

The contract, in full:

1. **Every open request on that item transitions, not just the one being
   answered.** `data-model.md` § `removal_requests` states this in as many
   words. Two cousins tagged in one photograph both asked; one delete answers
   both, and leaving the second open would send a reminder about a photograph
   that no longer exists.
2. `resolved_by_member_id` is the member who deleted, **which is not
   necessarily the uploader**: an admin can act first.
3. Requests already settled are untouched. Their `state`, `resolved_at` and
   `resolved_by_member_id` stand, and the `SET NULL` nulls their `item_id`
   alongside the rest. That is the point of `SET NULL`: `CASCADE` would
   destroy the record in exactly the case where it matters most, and the
   settled tab would be permanently empty of deletions.
4. One `removal_resolved` mail per (request, recipient), enqueued in the same
   transaction, keyed `removal-resolved:<request_id>:<member_id>`. Once per
   settled request, not once per item.
5. Deleting an item with no open requests enqueues nothing from this slice.
6. **An open request never blocks the delete**, and a request is never a
   precondition for one. Nothing blocks: deleting is how you grant a request,
   and an uploader may delete their own work at any time.

This slice does not specify that route's request shape, response, or
authorisation, which is `items.uploaded_by = :me OR role = 'admin'` and is
agent C's to document.

## Mail this slice enqueues

Trigger points only. **Payloads, recipient sets and copy belong to agent H**
(`data-model.md` § Recipients; Decision 12).

| Kind               | Enqueued at                                                                       | Idempotency key                                          |
| ------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `removal_request`  | The committed `INSERT` in `POST /api/items/:itemId/removal-requests`.             | `removal:<request_id>:<member_id>`                       |
| `removal_resolved` | The committed transition to `declined` here, or to `deleted` in agent C's delete. | `removal-resolved:<request_id>:<member_id>`              |
| `removal_reminder` | The hourly `removal-reminder` job. Not a route.                                   | `removal-reminder:<request_id>:<member_id>:<week_index>` |

Every enqueue is an `INSERT` into `outbound_emails` **inside the same
transaction as the state change**, so a rolled-back decline sends nothing and a
retried handler cannot double-send: `UNIQUE (idempotency_key)` is the only
thing standing between a retry and a duplicate. Note that the key is per
recipient, which is why the trigger point is a state change and the fan-out is
agent H's.

A withdrawal enqueues nothing.

## The weekly reminder is a job, not a route

`removal-reminder` runs hourly in the job runner (`conventions.md` § The job
runner). It does a blind `INSERT ... ON CONFLICT DO NOTHING` over open
requests with
`week_index = floor((now - removal_requests.created_at) / 7 days)`, which makes
**two reminders in one week arithmetically impossible**: no scheduler state, no
"last reminded at" column to drift, and an hourly cron that can be restarted or
run twice with no effect. Its clock is the `shoebox.timezone` setting
(Decision 10). This slice designs nothing about it and exposes no route that
triggers, snoozes or cancels it.

Two things follow that an implementer might otherwise add:

- **A request never expires and never escalates.** There is no sweeper, no age
  threshold and no automatic state transition. Letting one quietly lapse is
  the exact silence the feature exists to replace (surface 15, state `open`).
- **The job needs no signal from these routes.** Decline, withdraw and delete
  all move the row out of `state = 'open'`, and the reminder stops because the
  job's own predicate stops matching.

## Shared types in this slice

```ts
type RemovalRequestState = "open" | "deleted" | "declined" | "withdrawn";

/** `removalRequestDtoSchema` / `RemovalRequestDto`. */
interface RemovalRequestDto {
  requestId: string;
  state: RemovalRequestState;
  /**
   * Null once the item has been deleted: `removal_requests.item_id` is
   * SET NULL, so a settled request outlives its item. This is also the id the
   * "Delete it" button passes to `DELETE /api/items/:itemId`.
   */
  itemId: string | null;
  requestedBy: MemberRef;
  /** Null is "no reason given, which is allowed. Asking is enough." */
  reason: string | null;
  /** Non-null exactly when `state` is `declined`. */
  declineReason: string | null;
  createdAt: string;
  /** Non-null exactly when `state` is not `open`. */
  resolvedAt: string | null;
  /** Whoever acted. Not necessarily the uploader: an admin can act first. */
  resolvedBy: MemberRef | null;
  /** Snapshot `item_uploader_member_id`, resolved to a member at read time. */
  uploadedBy: MemberRef;
  /** Snapshot `item_captured_at`. The browser formats it. */
  itemCapturedAt: string | null;
  /** Null is normal, not an error. See below. */
  media: MediaRef | null;
  canWithdraw: boolean;
  canDecline: boolean;
  /** The viewer may call `DELETE /api/items/:itemId` with `itemId`. */
  canDeleteItem: boolean;
}
```

**Why `media` is nullable, and why null is not an error.** `item_id` is
SET NULL on delete, so a settled request routinely has no item behind it. The
object is genuinely gone, deleted from Backblaze by the
`object-deletion-drain` job, and there is nothing to sign a URL for. The
surface draws a ghost frame in its place and has done since the mockup
(`itemThumbGone`, "Gone"). A client must never treat `media: null` as a failed
render or retry it. `media` is null in exactly two cases:

1. `itemId` is null: the item was deleted.
2. `itemId` is set but the viewer's visibility predicate no longer includes
   it, which can only happen to a requester whose access was narrowed after
   they asked. Their row survives; the picture does not come back.

The three snapshot columns are what the settled card renders from, and
`item_storage_key` is **not** among the fields above: it is a raw storage key,
which no payload may ever carry (`conventions.md` § Forbidden in any payload).
It exists so a deletion can be correlated with a backup, which is an operator's
job and not a client's.

**Why this is not `ItemSummary`.** `ItemSummary.media` is `MediaRef`,
non-null, and it must stay that way: every other surface in the product draws
a live item and would have to start null-checking. `ItemSummary` also carries
`visibility`, `isUnseen` and `burst`, none of which a removal card shows and
all of which cost work per row. `ItemSummary` is used unchanged where the item
is alive and visible by construction, which is the `item` field on
`GET /api/items/:itemId/removal-requests`.

`canWithdraw`, `canDecline` and `canDeleteItem` are computed per viewer and are
the client's only source of truth for which buttons to draw:

| Field           | True when                                                                            |
| --------------- | ------------------------------------------------------------------------------------ |
| `canWithdraw`   | `state` is `open` and the viewer is `requestedBy`.                                   |
| `canDecline`    | `state` is `open` and the viewer is `uploadedBy` or an admin.                        |
| `canDeleteItem` | `state` is `open`, `itemId` is not null, and the viewer is `uploadedBy` or an admin. |

## Additions requested to the frozen DTOs

None. The deleted-item case is carried by `RemovalRequestDto`'s own snapshot
fields rather than by widening `ItemSummary`, for the reason given above:
`ItemSummary.media` must stay non-null.

## Open questions for the coordinator

1. **The 403 on `POST /api/items/:itemId/removal-requests`** for a viewer who
   can see the item but is not people-tagged in it. This is the only 403 in
   the slice that is not a role check, and `conventions.md` says 403 is role
   only. It discloses nothing, because the viewer can already see the item and
   its people tags. If you would rather keep the rule absolute, the
   alternative is `400 invalid_request` with `details.fieldErrors`; a 404
   would be wrong, because the item demonstrably exists for this viewer.
2. **The role token `self`**, used on withdraw, is not in the conventions list
   (`viewer | uploader | admin | self-or-admin | uploader-of-item-or-admin`).
   `self-or-admin` is wrong here: an admin must not withdraw somebody else's
   request. Please add `self`, or tell me which existing token to spell it as.
3. **Length caps for `reason` and `declineReason`.** The schema constrains
   neither (`data-model.md` § `removal_requests`), and `comments.body` only
   has `length(trim(body)) > 0`. I have written "the cap" rather than inventing
   a number. One figure shared with the comment body, applied in the same
   place, would be better than three slices each picking one.
4. **No mail on withdraw.** Surface 16 designs eight messages and none is a
   withdrawal, so this slice sends none and the uploader simply finds the
   request gone from their queue. If "never mind" deserves a ninth message it
   needs designed copy and a ninth idempotency recipe, both outside this slice.
5. **A viewer has no list of their own requests.** `GET /api/removal-requests`
   is 403 for role `viewer`, and surface 10 is always reached from the
   photograph, so the item-scoped GET covers every state the mockup draws. If
   a "things I have asked about" list is ever wanted, it is a `?mine=true`
   scope on the queue rather than a sixth route.
6. **Cross-slice**: whichever slice owns `GET /api/items/:itemId` should carry
   a `canRequestRemoval` boolean, computed by the tag gate defined in this
   document, so surface 3 can decide whether to draw the entry point without a
   second request. The predicate is written once here; it should not be
   re-derived there.
