# Step 5a: one item

Everything that hangs off a single photograph or video: the permalink itself,
its burst siblings, comments including the ones pinned to a moment in a video,
both reaction sets, tags and people, alt text, the visibility control, the
hand correction to a capture date, and deletion with its object cleanup.
Eighteen routes, and the second of the two steps that carry permissions.

This is the step design for
[`plan/step-5a.md`](../../prds/2026-09-27-memory-shoebox/plan/step-5a.md). The
product spec it reads is `docs/PRODUCT.md` and the design spec; the route
contract it implements is
[`tech-specs/apis/items.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/items.md),
binding, with
[`conventions.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md)
above it. Nothing here restates those documents. What it records is the
decisions they leave open, the four places they answer the same question twice
and disagree, and the shape the code takes.

## What this delivers

| Route                                              | What it is                                                  |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `GET /api/items/:itemId`                           | The permalink in one response, and the open is counted here |
| `PATCH /api/items/:itemId`                         | The alt text override, and nothing else                     |
| `DELETE /api/items/:itemId`                        | The row, the cascades, and the objects enqueued             |
| `GET /api/items/:itemId/original`                  | **New.** The download, signed and redirected                |
| `GET /api/bursts/:burstId/frames`                  | A burst fanned into its visible frames                      |
| `POST /api/items/:itemId/comments`                 | Say something, optionally pinned to a video moment          |
| `PATCH /api/comments/:commentId`                   | The author edits their own. Leaves an `edited` mark         |
| `DELETE /api/comments/:commentId`                  | The author's, or anybody's for an admin                     |
| `PUT` / `DELETE /api/items/:itemId/reaction`       | One idempotent value per member                             |
| `PUT` / `DELETE /api/comments/:commentId/reaction` | The same against `comment_reactions`                        |
| `PUT /api/items/:itemId/tags`                      | Replace the tag set                                         |
| `PUT /api/items/:itemId/people`                    | Replace the people set                                      |
| `PATCH /api/items/:itemId/visibility`              | Repoint one item at a rule                                  |
| `POST /api/items/visibility`                       | Repoint a selection, all or nothing                         |
| `POST /api/visibility-rules/resolve`               | Mode plus subjects to a rule id. Finds or creates           |
| `POST /api/items/:itemId/capture-date`             | The hand correction. Keeps the clock time                   |

Plus every items-slice schema in `packages/shared`, one addition to the frozen
DTOs, and the `comment` email in `packages/emails`, both variants.

Nothing in `apps/web`. Surfaces 3 and 4 are step 6b, and build against this.

## What already exists, and what it settles

- **The visibility predicate** is step 3a's `visibilityExpression` and
  `applyVisibilityFilter`. It is the one sanctioned reader of
  `Viewer.visibleRuleIds`. Nothing here rewrites the clause.
- **The request context** is `Viewer` on `request.viewer`, with `requireViewer`
  for the 401. Every route in this step is `session`.
- **Rate limiting** is middleware, named per route in Fastify route config.
  `conversationWritePerMember` already exists and is exactly the contract's
  60 comment and reaction writes per minute; the six comment and reaction
  write routes name it and nothing else in this step does.
- **Errors**: a thrown `ZodError` becomes `400 invalid_request` with
  `details.fieldErrors` through `registerErrorHandler`. Routes parse and throw;
  they do not assemble error bodies. This step appends ten codes to `ApiError`.
- **Alt text** is 4a's `makeAltTextFromItem`, which already implements
  transformation 2 exactly, including the `en-GB` date in `shoebox.timezone`.
- **The seen latch** is 4a's `latchItemsSeen`, whose statement takes `burstIds`
  and expands them to visible frames inside the `INSERT`. Decision 1 below
  reuses it rather than writing a second one.
- **Media** is `makeMediaRefFromSources` and `readMediaSources`, with
  `B2Client.presignGet` for the URL. `readMemberRefs` resolves every author and
  reactor from one members read.
- **The mail queue** is `enqueueEmail`, gated by `EMAIL_TEMPLATES`: a kind with
  no copy is a type error rather than a row nothing can render.
- **`runObjectDeletionDrain`** already drains `pending_object_deletions` every
  five minutes. This step only enqueues.

## Module layout

A new `apps/server/src/items/` beside `archive/`. The read path composes pages
from batched queries; this composes one item and writes to it, and the two do
not share a shape.

| Module                                  | What it holds                                                    |
| --------------------------------------- | ---------------------------------------------------------------- |
| `getVisibleItemOr404.ts`                | Resolve under the predicate or throw `item_not_found`            |
| `itemPermissions.ts`                    | The two guards, and `makeItemCapabilitiesFromItem`               |
| `readItemDetail.ts`                     | The eleven-read composer, shared by the `GET` and every mutation |
| `readCommentThread.ts`                  | Comments with their reactions in one `comment_id IN (...)`       |
| `readReactionSummary.ts`                | One thing's rows, ordered, resolved against the members read     |
| `setItemTags.ts`, `setItemPeople.ts`    | Find-or-create and the diff                                      |
| `getVisibilityRuleFromSubjects.ts`      | Canonicalise, digest, find or create                             |
| `setItemVisibility.ts`                  | The single and the batch, sharing one per-item check             |
| `setItemCaptureDate.ts`                 | The transaction, the ejection, the re-arm                        |
| `deleteItem.ts`                         | The transaction, in the order § The delete gives                 |
| `closeOpenRemovalRequests.ts`           | Step 7a's seam                                                   |
| `enqueueCommentEmails.ts`               | Recipients as one set operation, and the cancel on delete        |
| `time/makeInstantFromLocalWallClock.ts` | New, and the only new thing outside `items/`                     |

Routes are grouped by the id in the path, which is how the contract groups
them: `routes/items.ts` grows, and `routes/comments.ts`, `routes/bursts.ts`
and `routes/visibilityRules.ts` join it.

`getVisibilityRuleFromSubjects` and `closeOpenRemovalRequests` are named
against the shape the contract uses for both ("resolve"), because `AGENTS.md`
forbids `resolve...` on any function: the word names neither side.

## Decisions

### 1. The strip latches `first_seen_at`, and the document says both things

`items.md` transformation 9 says the sibling thumbnails "are impressions, not
opens, and this route does not latch `first_seen_at` for them", and points at
Ruling 6. Ruling 6 says the opposite in as many words: "the sibling strip
latches `first_seen_at` and not `first_opened_at`. That is exactly what two
columns are for."

**Ruling 6 wins.** It is the answer to the question the transformation raised,
it carries the reasoning, and the alternative it rejects is named: a dot left
lit on a burst somebody has plainly fanned trains people to ignore the dot.

So `GET /api/items/:itemId` does two writes, not one:

| Write                                     | Rows                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| The upsert in transformation 9            | The opened item alone: `first_opened_at`, `last_opened_at`, `open_count` |
| `latchItemsSeen({ burstIds: [burstId] })` | Every visible sibling: `first_seen_at` only                              |

The second is 4a's statement unchanged, which is the point of reusing it: the
visibility filter sits inside the `INSERT ... SELECT` rather than in a
pre-check, so there is no branch that can report on what it skipped.
`GET /api/bursts/:burstId/frames` latches the same way, for the same reason:
the frames it returns have been in front of the viewer.

Both writes run after the reads are assembled, in their own short write
transaction, so a page of reads never holds SQLite's single writer. `isUnseen`
is read before either.

### 2. Nothing in this step bumps `visibilityGeneration`

`plan/step-5a.md` lists "the `visibilityGeneration` bump when a rule's
subjects change" as an interface this step produces. No route in this step
changes a rule's subjects, and both routes that could say so explicitly:
`PATCH /api/items/:itemId/visibility` "does not bump the generation:
repointing an item changes no rule's subjects and no member's role", and
`POST /api/visibility-rules/resolve` "never updates an existing rule and never
deletes one", so "no viewer's cached `visibleRuleIds` becomes stale".

`conventions.md` § The auth middleware is binding and lists the three things
that bump it: group membership, a rule's subjects, a member's role. This step
does none of them. **No call to `bumpVisibilityGeneration`**, recorded here
so a later reader does not add one to be safe: a spurious bump throws away
every viewer's cache on every visibility save, which is a performance bug that
looks like caution.

### 3. Rules are immutable from the edit path, and that is the whole design

Changing an item's visibility is two round trips and never one. `resolve`
finds or creates the rule for a `(mode, canonical subject set)`; the write
routes issue `UPDATE items SET visibility_rule_id = ?` and nothing else.

No statement in this step is an `UPDATE visibility_rules` or touches
`visibility_rule_subjects` on an existing rule. A rule covers 264 files in the
fixtures, so editing one in place to change one photograph changes the other 263.

Canonicalisation is the part that has to be exact, because the digest is the
identity: drop duplicates, sort by kind with `group` before `member`, then by
id, hash. `everyone` short-circuits to the seeded rule's constant id with no
lookup. `except` with no subjects normalises to that same rule rather than
becoming a second way of saying the same thing. `only` with no subjects is a
`400`. The `(mode, subject_digest)` index is deliberately not unique and the
lookup takes the lowest uuidv7, so two concurrent resolves producing
equivalent rules is tolerated rather than merged mid-transaction.

### 4. The permission split is two guards, named after consequence

`conventions.md` § Who may change an item splits by what the action does, not
by which table it writes, and `items.md` Ruling 1 records this slice getting it
wrong the first time. It is made structural rather than remembered:

| Guard                       | Predicate                          | Routes                                                                         |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `assertMayEditItemContent`  | role `uploader` or `admin`         | alt text, tags, people, and the role gate on the visibility routes             |
| `assertMayChangeItemAccess` | `items.uploaded_by = me`, or admin | delete, capture date, and the **per item** check inside both visibility routes |

Both visibility routes call both: the role check once for the request, then
ownership per item. On a selection spanning two uploaders that is the
difference between changing only the caller's own and refusing the call.

`ItemCapabilities` is computed by the same two predicates, in one function the
guards also call. A capability and the guard behind it cannot drift when they
are the same expression, and they start to the moment somebody writes the
check twice.

### 5. 404 before 403, in one line every route shares

`getVisibleItemOr404` is the first statement of every handler that takes an
item-derived id, including the comment routes, which reach the item through
`comments.item_id`. Only once a row has come back may a guard run.

The comment routes return `comment_not_found` rather than `item_not_found`:
the code names the resource that was addressed, and a comment on an item the
viewer may not see is byte-identical to a comment id that never existed.

There is exactly one shape for that body, built by `ApiError`, so the
byte-identity test compares two real responses rather than asserting on a
constant.

### 6. `canRequestRemoval` is three conditions, and the sources give two each

`items.md` says the viewer's linked person is in `item_people` and they are not
the uploader. `removals.md`, which owns the gate and which `plan/step-5a.md`
says to cite rather than re-derive, says the tag gate **and** the absence of an
open request by this viewer.

All three hold. The tag gate joins through `people.member_id`, because the
link to an account sits on `people`. The open-request check is one extra
indexed read of `removal_requests`, and it is what stops this step's button and
step 7a's `POST` disagreeing about the same viewer. The uploader exclusion
costs nothing and is already true in spirit: somebody asking for their own
photograph to come down has `canDelete`.

**This is the one place in the product `item_people` is consulted for anything
resembling a permission, and it only ever subtracts.** It does not appear in
the visibility predicate, and the predicate runs first and alone: a viewer
tagged in a photograph they cannot see gets the `404`, not a capability.

### 7. `capture_source` is `'uploader_set'` and `reason` is `'manual'`

Ruling 2, restated only because the word "manual" appears in Decision 10 doing
two jobs and reading it the other way needs a migration. `items.capture_source`
records **how** the date was arrived at and has no `'manual'` member;
`item_capture_date_changes.reason` records **why** it was changed and does.

### 8. The capture-date arithmetic, and a new time helper

There is no zone-aware wall-clock helper in the repository and no date library
in the workspace. Node 24 here has no `Temporal`. So
`makeInstantFromLocalWallClock` is new, and it is `Intl`-based: format the
candidate instant in the target zone, measure the offset it actually landed
at, correct, and measure once more, which converges because a zone offset is
constant either side of a transition.

The rules it implements come from transformation 2, and each one is a test:

- With `capturedTime` omitted, the existing wall clock is read from
  `captured_at` plus `captured_at_offset_minutes`, or resolved in
  `shoebox.timezone` when that offset is null. A 06:41 photograph becomes 06:41
  on the new day and **no fact is invented**.
- `captured_at_offset_minutes` is carried across unchanged. Moving a
  photograph to another day does not move the camera to another country.
- `captured_on` is written from the new local date, never from
  `date(captured_at)` in UTC, which would put a 23:30 photograph on the wrong
  day and therefore under the wrong milestone.
- An ambiguous wall clock takes the earlier (standard) offset; a nonexistent
  one is shifted forward by the size of the gap.
- `items.original_captured_at` is never written, so "revert to what the file
  said" stays one step away however many times the date is moved.

A no-op returns `200`, writes nothing and records nothing. A no-op is not a
correction.

### 9. The delete transaction, in an order the cascade forces

One `IMMEDIATE` transaction, and two of the steps have to precede the delete
for reasons no foreign key expresses:

1. Resolve under the predicate (`404`), then `assertMayChangeItemAccess`
   (`403`).
2. Read the `burst_id` and every `item_renditions.storage_key`, **while they
   still exist**.
3. `INSERT INTO pending_object_deletions ... ON CONFLICT DO NOTHING`, one row
   per rendition, in this transaction. No transaction spans SQLite and
   Backblaze, so the rows commit first and the drain job retries. Without this
   a B2 failure leaves a family paying to store a photograph they were told was
   destroyed.
4. `closeOpenRemovalRequests`: `resolved_at` and `resolved_by_member_id` on
   **every** open request, not only the one being answered. It must run before
   step 6, because `removal_requests.item_id` is `SET NULL` and the rows become
   unfindable by item the instant the item goes.
5. The `activity_events` row, kind `item_deleted`, with a `subject_label`
   composed now while the row is still readable. `subject_id` is a dangling id
   by design: an audit log outlives its subjects, and this row is the only
   record anywhere that the item existed.
6. `DELETE FROM items`, and the engine performs the matrix.
7. Drop the burst if no frames remain. Application code; no foreign key
   direction does it. One remaining frame does **not** drop it: a stack of one
   renders as a plain print, which is a read-time rule.

`visibility_rules` is untouched. Rules are shared and `visibility-rule-sweep`
drops the unreferenced ones daily.

**Nothing blocks.** There is no `409` in the table: an open removal request
does not block, because deleting is how you grant it, and a burst with
forty-four siblings does not block, because deleting one frame of forty-five is
ordinary.

### 10. Step 7a's seam is a return value, not a hook

`closeOpenRemovalRequests` returns the rows it closed. Step 7a owns the removal
state machine and the `removal_resolved` copy, and the mail registry is typed
so a kind with no template cannot be enqueued at all, so this step writes no
`removal_resolved` email and builds no part of that template.

What it does instead is leave one named place for 7a to enqueue from, inside
the same transaction, without reshaping `deleteItem`. The alternative, a
callback threaded through the delete path now, is indirection built for a
caller that does not exist yet.

This is recorded in `docs/server.md` as well, because a seam nobody finds is
the same as no seam.

### 11. The comment email, both variants, in the comment's own transaction

The copy is settled: `notifications.md` § 4 gives the payload, the recipients
and the suppression, and the two prototype states (`emails` / `comment` and
`comment-reply`) give the words. This step writes the template, its payload
schema, and its two registry entries.

Recipients are one set operation and never a loop: the item's uploader plus
every member who has already commented, minus the author, **de-duplicated by
member id before the switch test**, so an uploader who has also commented gets
one message and not two. Each recipient is filtered by the standard visibility
predicate, so somebody who has lost access is not told there is new
conversation on it. A people tag is never consulted here either.

Suppression is by the recipient's strongest relationship, uploader first: the
uploader's copy is governed by `notify_on_comment`, a prior commenter's by
`notify_on_reply`.

`relation` chooses the subject and the reason line, and the reply variant must
never say "one of your photos" to somebody who did not upload it. That is a
named test, because it is the one thing in this email that is wrong in a way a
reader will notice and the sender will not.

Editing a comment touches `outbound_emails` not at all: the message was true
when it was enqueued, and cancelling would make the delivered-or-not boundary a
race. Deleting one cancels rows still `queued` and leaves `sending` and `sent`
alone.

### 12. The download is a route, and `MediaRef` stays as it is

`items.md` § Additions requested 1 left this open and said no slice obviously
owns it. Surface 3 carries the button and surface 6b builds against this step,
so it lands here as `GET /api/items/:itemId/original`: resolve under the
predicate, sign the `original` rendition's key, and `302` with the original
filename in `Content-Disposition`.

The alternative widens the frozen `MediaRef` with `original`, which would put a
full-resolution signed URL on every print in every timeline page for a button
that appears on one surface, and would change a shape five slices cite. The
route also gets a sensible filename into the download, which a payload field
cannot.

`404 item_not_found` when the predicate excludes the item, as everywhere.
`404` too when the item has no `original` rendition, which is an ingest defect
rather than a permission fact, and the server logs it.

### 13. `VisibilitySummary.visibilityRuleId`, the one frozen-DTO change

The contract's addition 2, taken as asked. The edit control pre-fills from the
current rule and has to detect a no-op save, and a selection has to know
whether its items already share a rule before it offers to change them.
`subjects` gets the form filled but not the identity, and the client has no way
to compute the digest.

It is an opaque uuid that reveals strictly less than the `subjects` list
already beside it, and it only ever appears on an item the viewer can see.

### 14. One composer, eleven reads, and four N+1 risks with names

`readItemDetail` is the response of `GET /api/items/:itemId` and of every
mutation in this step except the two that return `204` and the batch, which
returns `ItemSummary`. A mutation that composed its own response is how the
two drift.

The four N+1 risks are the ones `items.md` § Performance names, and each is a
test that counts queries with `makeQueryCountingDatabaseFromDatabase`:

| Risk               | What it must be                                                |
| ------------------ | -------------------------------------------------------------- |
| Comment reactions  | One `WHERE comment_id IN (:commentIds)`, never one per comment |
| The strip's people | One `WHERE item_id IN (...)`, because every frame has alt text |
| Renditions         | One batched fetch for the item and the strip                   |
| `MemberRef`        | One members read per request, resolved in process              |

The strip is capped at 60 visible siblings, and `burst.visibleFrameCount` says
whether there are more.

### 15. Position is dense over the visible frames, on both sides

`burstPosition` and `BurstFrameRef.position` are 1-based over the visible
siblings, never `items.burst_index`. This is the one leak in this step that
looks like a display detail: pass the stored index through and frames 6, 8, 9
tell the viewer there is a frame 7 they may not open.

`burst.visibleFrameCount`, `startsAt`, `endsAt` and `coverItemId` are all
computed from the visibility-filtered siblings. The cover is
`bursts.cover_item_id` when that frame is visible, otherwise the earliest
visible one.

A burst with zero visible frames is a `404` on the frames route and not an
empty list: it "vanishes and contributes nothing to the day".

### 16. Tags and people are diffed, never replaced

Both routes `PUT` the whole set, which is what the chip rows express. The
write is a diff: delete the rows no longer present, insert the new ones with
`tagged_by` and `tagged_at`. Deleting and reinserting the set would rewrite the
provenance of tags nobody touched.

An existing tag keeps its stored `name`. Typing "hospital" on an item whose
archive already spells it "Hospital" attaches the existing row and does not
rename it under the other two hundred items carrying it. Matching is on
`name_normalized`, which is 4a's `makeNormalisedNameFromName`.

A `{ displayName }` person entry creates a `people` row with `created_by` and
**never** sets `member_id`: linking a person to an account is a different act
elsewhere, and a person record may never get one.

The response recomposes `media.altText`, because the people are half of what
composes it. That is why these routes return the whole `ItemDetail` rather
than the slice they changed.

### 17. The batch is all or nothing, and says nothing about which ids failed

`POST /api/items/visibility` resolves every id under the predicate first; one
miss fails the whole request with the standard `404` and **no `details`**. A
list of the ids that survived is a count of what the viewer cannot see, and
"4 of 6 updated" is a per-id oracle.

One `UPDATE`, then one `activity_events` row **per item**, never one for the
batch: the log is read by subject id, and a batch row answers no question
anybody asks of it. Items already pointing at the rule are in the response and
written nowhere.

## What is deliberately not here

- Removal requests themselves, and the `removal_resolved` email (step 7a).
  This step exposes `canRequestRemoval` and closes the rows on delete.
- Milestone attachment and the reconciliation offer (step 7a), though
  `AttachedMilestone` is defined here and the re-arm on a date change happens
  here.
- Uploading, which is what creates an item, writes `duration_ms` and the
  renditions, and mints an item's first visibility rule (step 6a).
- Surfaces 3 and 4 (step 6b).
- `GET /api/items/:itemId/viewers` (step 8a). `canSeeViewers` is
  `Viewer.isAdmin` and nothing more.

## Verification

`pnpm check` green, and these named tests, which are the ones the step file
asks for plus the two the decisions above added:

1. **A permissions matrix over every mutating route**: viewer, an uploader who
   did not upload it, the uploader who did, and an admin. Split by consequence,
   which is the thing most easily got wrong here.
2. **404 byte-identity**: every route taking an item-derived id returns, for an
   invisible item, a response byte-identical to the one for an id that never
   existed. Same status, same code, same message, no `details`.
3. **A 403 never precedes a 404**: the role check on a route the viewer cannot
   reach still answers 404.
4. **Object deletes are enqueued in the same transaction** as the row delete,
   one per rendition, and **a rolled-back delete enqueues nothing**.
5. **The last frame of a burst drops the burst row**, and the second-to-last
   does not.
6. **Moving an item off its burst's day ejects it**, nulls `burst_index`, and
   drops the burst if that emptied it.
7. **A deleted comment's `queued` email is cancelled and a `sending` one is
   not.**
8. **Both comment emails against their prototype states**, including a test
   named for the reply variant never saying "one of your photos" to somebody
   who did not upload it.
9. **`item_people` is not a key**: a photograph restricted to admins, with a
   people tag for a viewer, is invisible to that viewer, absent from their
   counts, and its permalink is a 404 rather than a capability.
10. **The query-count tests** for the four N+1 risks in decision 14.
11. **The capture-date arithmetic** across an ambiguous wall clock, a
    nonexistent one, a null stored offset, and a no-op.
