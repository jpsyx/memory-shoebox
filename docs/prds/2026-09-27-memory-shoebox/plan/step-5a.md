# Step 5a: One item

> Historical source references. `reference/` and `@memory-shoebox/reference` below are historical shorthand for the retired surface package at commit `3e09157b`, not current paths or runnable instructions. Read that commit for the original source spelling. Product decisions remain binding; current implementation and acceptance are documented in `docs/web.md` and step 9 verification.

**Status:** done
**Parallel with:** 5b
**Depends on:** steps 1, 2, 3a and 4a

## What this step delivers

Everything that hangs off a single photograph or video: the item itself with
its capabilities, its burst siblings, comments including the ones pinned to a
moment in a video, reactions on items and on comments, tags and people, alt
text, the visibility control, the capture-date correction, and deletion with
its object cleanup. Eighteen routes as built, and the second of the two steps
that carry permissions. The extra one is
`GET /api/items/:itemId/original`: the contract left "Download the original"
open between widening the frozen `MediaRef` and a route of its own, and the
route won (`items.md` § Additions requested 1).

**Done when:** a member can open an item, react, comment, and edit or delete
their own comment; an uploader can tag it, set who sees it and correct its
date; the item's own uploader can delete it and the bytes leave Backblaze; and
a viewer addressing an item they may not see gets a 404 byte-identical to one
for an id that never existed.

## How to execute this step

You are implementing **only this step**. Other steps are listed at the foot of
this file; they are not yours and several are deliberately not designed yet.

**Two different documents are called a spec here, so they are named apart
throughout.** The **product spec** is `docs/PRODUCT.md` and
`docs/prds/2026-09-27-memory-shoebox/design-spec.md`: they already exist, they
cover the whole product, and you only read them. Your **step design** is what
you write for this step alone, under `docs/superpowers/specs/`.

Run the full superpowers cycle, scoped to this step:

1. **`superpowers:brainstorming`.** Read the documents under "Read these first"
   before asking anything. `items.md` ends with a `## Rulings` section that
   answers seven questions this step would otherwise raise, including one where
   the slice contradicted the binding conventions file and lost. Ask the user
   only what the documents genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-one-item-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                               | What you need from it                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/items.md`         | **The whole file**, including its `## Rulings`. Seventeen routes and `ItemCapabilities`                                                                                                         |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md`   | § **Who may change an item**, which is the heart of this step, plus § Errors, § The visibility predicate, § String lengths                                                                      |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`        | § `items`, § `item_renditions`, § `comments`, the two reaction tables, § `tags`/`item_tags`/`people`/`item_people`, § Deleting an item, § `item_capture_date_changes`, Decisions 7, 8, 9 and 10 |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                   | Surfaces 3 and 4 and their states, and the "Looking at a day" flow including where it fails                                                                                                     |
| `reference/` surfaces `photo` and `video`                              | Every state. `quiet`, `pinning` and `visibility` are the three that constrain this most                                                                                                         |
| `docs/PRODUCT.md`                                                      | § How it works: visibility, comments, deletion. § Product principle 5: the archive outlives the software                                                                                        |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md` | § 4 `comment`, both variants: to the uploader, and to a prior commenter. This step owns that copy and enqueues it                                                                               |
| `reference/` surface `emails`, states `comment` and `comment-reply`    | The two messages this step sends                                                                                                                                                                |

## Scope

**In:**

- `GET /api/items/:itemId` with `ItemCapabilities`, including
  `canRequestRemoval`, computed by the tag gate the removals slice defines and
  cited here rather than re-derived
- `GET /api/bursts/:burstId/frames`, ordered by `burst_index`, filtered by the
  same predicate, 404 on a burst with no visible frames
- Comments: create, edit, delete, and the video-timestamped variant. The author
  may edit and delete their own; an admin may delete anybody's
- Reactions on items and on comments, both `PUT` because each is one
  idempotent value per member
- Tags, people and alt text: **any** uploader or admin, on anything they can
  see, because the additive half is better for being collective
- Item visibility and the capture date: **the item's own uploader** or an
  admin, because those change who can see something or what day it lives on.
  On a selection the check is per item and the response says how many it skipped
- `POST /api/visibility-rules/resolve`, which finds or creates a rule, and the
  `visibilityGeneration` bump when a rule's subjects change
- Deletion: the row, the cascades, `pending_object_deletions` enqueued in the
  same transaction, and the three things no foreign key does. Dropping a burst
  when its last frame goes is application code
- The `comment` email, both variants, enqueued in the same transaction as the
  comment insert, and cancelled if the comment is deleted while still `queued`
- The seen latch on a fanned burst: `first_seen_at` for every visible sibling in
  one batched statement, and `first_opened_at` for the opened item only

**Out, and owned by a later step:**

- Removal requests themselves (step 7a). This step exposes `canRequestRemoval`
  and nothing more
- Milestone attachment (step 7a), though `AttachedMilestone` is defined here
- Uploading, which is what creates an item (step 6a)
- Surfaces 3 and 4 (step 6b)

## Interfaces this step produces

- `@memory-shoebox/shared`: every items-slice schema, including
  `ItemCapabilities`, `AttachedMilestone` and `CommentDto`'s full shape
- The delete transaction, which step 7a's removal queue calls
- The `visibilityGeneration` bump on a rule change

## Interfaces this step consumes

From step 3a: the request context, the visibility predicate, the generation
bump helper. From step 4a: the per-viewer count expression. From step 2: the
mail queue and the B2 delete path.

## Do not ask the user about

| Topic                                            | Owned by     |
| ------------------------------------------------ | ------------ |
| Uploading, presigning, derivatives               | step 6a      |
| Removal requests and the queue that answers them | step 7a      |
| Creating or editing milestones                   | step 7a      |
| Members, roles, groups, settings                 | step 8a      |
| Any surface                                      | steps 5b, 6b |

## Verification

- `pnpm check` green
- A permissions test matrix over every mutating route: viewer, uploader who did
  not upload it, uploader who did, admin. The split is by consequence, not by
  role, and it is the thing most easily got wrong here
- A test that any route taking an item-derived id returns a 404 for an
  invisible item that is byte-identical to the 404 for a nonexistent id: same
  status, same code, same message
- A test that deleting an item enqueues an object delete per rendition **in the
  same transaction**, and that a rolled-back delete enqueues nothing
- A test that deleting the last frame of a burst drops the burst row
- A test that moving an item off its burst's day ejects it from the burst
- A test that a deleted comment's `queued` email is cancelled and a `sending`
  one is not
- Both comment emails compared against their prototype states. The reply
  variant must not say "one of your photos" to somebody who did not upload it
