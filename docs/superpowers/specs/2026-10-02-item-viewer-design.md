# Step 6b: one photo, one video

**Step design** for step 6b of
[`docs/prds/2026-09-27-memory-shoebox/plan/step-6b.md`](../../prds/2026-09-27-memory-shoebox/plan/step-6b.md).

This is not the product spec. The product spec is
[`docs/PRODUCT.md`](../../PRODUCT.md) and
[`design-spec.md`](../../prds/2026-09-27-memory-shoebox/design-spec.md), the
API contract is
[`tech-specs/apis/items.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/items.md)
bound by
[`conventions.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md),
and the visual record is [`DESIGN.md`](../../../DESIGN.md). Those are read,
never restated. This document records only what is specific to putting surfaces
3 and 4 in front of the routes step 5a delivered, and cites the rest.

## What this delivers

The item viewer in both its forms, on the one route `/items/$itemId`. A
photograph full frame with its burst siblings beside it, its comments, its
reactions, its tags and people, and the controls the server says this viewer
may use. A video on its measured transport, with comments pinned to a moment
and a keyboard path to pinning one.

It also finishes two things step 5b left unwired, because this step cannot be
verified without them: **the pile links into the viewer**, and **the fanned
burst parses what step 5a's frames route actually returns**.

## What already exists, and what it settles

| File                                           | What it already settles                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/routes/items/`, `comments.ts` | All eighteen item routes, merged in 5a, plus `GET /api/items/:itemId/original` for the download                                           |
| `apps/server/src/routes/bursts.ts`             | `GET /api/bursts/:burstId/frames`, which answers `BurstFrameRef[]` and latches `first_seen_at` for the burst itself                       |
| `packages/shared/src/items.ts`                 | `itemDetailSchema`, `itemCapabilitiesSchema`, `burstFrameRefSchema`, `burstFramesResponseSchema`, `itemsSeenRequestSchema`                |
| `packages/shared/src/comments.ts`              | The comment and reaction request bodies, trimmed before they are measured                                                                 |
| `packages/shared/src/itemEdits.ts`             | Every other write's body: alt text, tags, people, visibility, the rule resolve, the capture date                                          |
| `apps/web/src/system/Talk/`                    | `Talk`, `CommentRow` and `Composer`, ported in 3b with their edit, delete and sending states drawn but not sent                           |
| `apps/web/src/system/Reactions/`               | The six reactions with their words, the picker, the summary popover, and the local adjustment that answers a tap before the server does   |
| `apps/web/src/system/VideoFrame/`              | The chip-black transport, the tick rule, the marks and the pending mark                                                                   |
| `apps/web/src/system/VisibilityControl/`       | The three modes, the admin sentence, and the people field in `members-and-groups` mode                                                    |
| `apps/web/src/system/PeopleField/`             | The one way people are chosen, including the `anyone` mode that invents a person                                                          |
| `apps/web/src/system/system.module.css`        | `.viewer`, `.frame`, `.viewerMeta`, `.frameReactions`, `.siblings`, `.sibling`, `.talk`, `.composer`, `.stamp`, `.transport`, `.scrubber` |
| `apps/web/src/routes/_app/items.$itemId*.tsx`  | The route and its `hasOwnBar` flag, and the removal route step 8b fills, which this step only links to                                    |
| `apps/web/src/session/requireSignedIn/`        | `viewer` and `settings` in route context, including `settings.timezone`                                                                   |

## Decisions

### 1. The permalink is fetched by the component, never by a loader

`GET /api/items/:itemId` counts an open every time it runs (`items.md`
transformation 9), and surface 17 prints that count as "items opened". The
router is created with `defaultPreload: "intent"`, which runs a route's loader
when a pointer rests on a link to it. A loader would therefore count an open
for every print somebody's mouse crossed.

So the item route has **no loader**, and the surface reads the item with
`useQuery`. A test pins it: preloading an item link sends no request.

### 2. One query, and every write lands in it rather than invalidating it

One `ItemDetail` per permalink, under `["items", itemId]`. It refetches on
mount, because arriving at a photograph again is opening it again, and never on
focus or on a timer, because neither is.

Every write answers with its post-mutation state, and that answer goes straight
into the cache entry with `setQueryData`:

| Write                                            | Answer            | Into the cache                         |
| ------------------------------------------------ | ----------------- | -------------------------------------- |
| Alt text, tags, people, visibility, capture date | `ItemDetail`      | Replaces the entry                     |
| `POST /api/items/:itemId/comments`               | `CommentDto`      | Appended to `comments`                 |
| `PATCH /api/comments/:commentId`                 | `CommentDto`      | Replaces that comment                  |
| `DELETE /api/comments/:commentId`                | `204`             | That comment removed                   |
| `PUT` an item or comment reaction                | `ReactionSummary` | Replaces that summary                  |
| `DELETE` an item or comment reaction             | `204`             | Our own row removed, and `myKind` null |

**Invalidating instead would be a phantom open per tap**, because the refetch
is the counting route, and it would re-sign every URL so the frame flashes.

**Every write on one item shares one mutation scope.** Five of them answer with
a whole `ItemDetail` carrying that request's own snapshot of everything it did
not change, so two close together could otherwise land out of order and revert
each other. `web.md` § Surface 9 records the same fix for `PATCH /api/me`.

After a write that answers with the whole `ItemDetail`, and after the item's
delete, the timeline's queries are **invalidated without being refetched**:
the pile is not mounted while the viewer is, so it refetches when somebody
returns to it and draws the new lock chip, the new day or the missing print.
Comments and reactions are left out, because the pile draws neither, and
marking it stale for them would cost a refetch that changes nothing.

### 3. No re-signing timer

Signed URLs live an hour (`app.config.ts` § `signedUrlTtlSeconds`). The pile
refetches before they die, and the viewer deliberately does not: a timed
refetch here would count an open nobody made, an image already drawn keeps
its bytes, and leaving and returning already refetches. Revisit only if a
long-paused video proves to be a real complaint.

### 4. Every control is drawn from `ItemCapabilities`, never from a role

The interface asks `capabilities` and nothing else, so it cannot offer what
the server will refuse (`conventions.md` § Who may change an item).

| Control                        | Drawn when          |
| ------------------------------ | ------------------- |
| Comment, react                 | Always              |
| Edit tags                      | `canEditTags`       |
| Tag people                     | `canEditPeople`     |
| Describe                       | `canDescribe`       |
| Who can see this, and its line | `canSetVisibility`  |
| When this was taken            | `canFixCaptureDate` |
| Delete                         | `canDelete`         |
| Ask for this to come down      | `canRequestRemoval` |
| Download the original          | Always              |

`me.role` is not read anywhere on this surface, and a test gives an admin's
role with every capability false to prove it. An admin tagged in somebody
else's photograph can hold both `canDelete` and `canRequestRemoval`, and gets
both, because that is what the server says.

### 5. The way back, and the way along the burst

- **Back** uses history when the viewer arrived from inside the app, which
  keeps the pile's filter and its scroll offset. Arriving from a pasted link or
  an email, there is no history to go back to, so it links to
  `/?at=<capturedOn>`. The label is "Back to 14 September" either way.
- **Moving between siblings replaces** the history entry. The strip is where
  you are inside the run, not a trail, so Back leaves the burst instead of
  stepping through forty-five frames.
- **While a sibling loads, the previous item stays drawn**
  (`placeholderData: keepPreviousData`), so the strip keeps keyboard focus
  across the move and the frame swaps when the answer lands.

### 6. The strip: one tab stop, a caption, and the seen latch

- **One tab stop.** Forty-five links would put forty-five tab stops between the
  frame and the comments. The strip is a roving group instead: Tab enters on
  the current frame, ← and → move between frames, Enter opens one, and Tab
  leaves. Each frame is a link named "Frame 7 of 45", with `aria-current` on
  the one open. Its image is decorative, because forty-five copies of the same
  composed sentence read aloud help nobody.
- **"Frame 7 of 45" and the span** come from `burstPosition` and
  `burst.visibleFrameCount`, `burst.startsAt` and `burst.endsAt`, all filtered
  per viewer on the server. The meta line carries the position; the strip is
  captioned "45 frames over 28 seconds", and is labelled by that caption.
- **Past the cap.** `burstFrames` carries at most sixty. When
  `visibleFrameCount` is larger, the strip asks the frames route for the whole
  run instead, which also brings in the current frame when it sits past sixty.
- **The latch is the server's, and the client's job is to not undo it**
  (`items.md` Ruling 6). Step 5a put both latches inside
  `GET /api/items/:itemId` (`apps/server/src/routes/items/readItemRoutes.ts`,
  `docs/server.md` § The item slice): `first_opened_at` for the item, and
  `first_seen_at` for every visible sibling in one batched statement. So the
  strip sends nothing of its own; an earlier draft of this design had it post
  to `POST /api/items/seen`, which would have been a second write for a row
  already written. What the strip must never do is request a sibling's
  permalink to draw itself, which would count forty-five opens. It draws from
  `burstFrames`, and past the cap from the frames route, which latches the
  burst the same way.

### 7. The video: marks from the contract, and a scrubber a keyboard can use

- **Marks are placed from `media.durationMs` on first paint.** `VideoFrame`
  currently waits for `loadedmetadata`, which is exactly the "lands wrong, then
  jumps" `items.md` transformation 4 exists to prevent. The same duration
  drives the clock and the slider, so the three share one scale; the
  element's own duration is only the fallback for a payload without one.
- **The scrubber becomes a slider.** `role="slider"`, `aria-valuetext` such as
  "0:14 of 0:22", ← and → for a second, PageUp and PageDown for a tenth, Home
  and End. Pressing anywhere on the bar seeks there, so nothing needs dragging.
- **The marks leave the slider.** They are buttons nested inside the bar today,
  which a slider's subtree cannot expose. They move to a sibling layer over the
  track, keeping their invisible 44x44 targets. A mark seeks; a stamp in the
  thread seeks and plays.
- **Pinning.** "Pin a comment to this moment" sets the pin at the current time,
  drawn as the outlined pending mark. While a pin is set, pressing the bar or
  pressing an arrow moves it with the playhead, the composer reads "Say
  something at 0:18" with Unpin beside it, and the button reads "Pinned at
  0:18". Sending posts the unrounded float; the outline becomes a solid mark
  and the thread gains the comment with its stamp.
- **The keyboard path** is Play, the slider, Pin, the composer, Send.
- **Nothing autoplays.** The `playing` state is what happens after Play.

### 8. The visibility picker is written against step 8a's contract

`GET /api/members` and `GET /api/groups` are step 8a's and are not built. As
step 5b did for the burst fan, the clients are written now against
`administration.md`, the tests stub them, and the end-to-end case is parked as
`fixme` until 8a merges.

- **Local schemas, narrowed.** `api/members/` parses both shapes of
  `ListMembersResponse` but reads only `memberId`, `displayName` and, on the
  admin shape, `role`; `api/groups/` parses both shapes of `ListGroupsResponse`
  and reads `groupId` and `name`, plus the member count on the admin shape.
  They are local to `apps/web` rather than in `packages/shared`, because 8a
  owns those schemas and will replace these.
- **`PeopleField` relaxes two props.** `role` on a member and `memberCount` on
  a group become optional, because the uploader shapes do not carry them. The
  option line is blank where there is nothing true to print.
- **The options** are the fetched lists, merged with the item's current
  subjects (which carry their names) and the viewer, deduplicated by id. When
  either list fails, the merge is what remains, so "Everyone" and "Only me"
  work end to end before 8a lands. The lists are fetched only when the control
  opens.
- **Saving** compares the chosen mode and subjects with the current rule and
  closes without a request when they match. Otherwise it resolves the rule,
  then repoints the item, skipping the repoint when the resolved id is the one
  the item already has. "Only" with nobody named disables Save with "Name
  somebody first, or choose Everyone", because the resolve answers that with a
  `400`.

### 9. Tags and people save as they change, and their chips are links

- **The plain view.** A person chip links to `/?person=<personId>` and a tag
  chip to `/?tag=<tagId>`, because a person is a filter rather than a profile
  (`PRODUCT.md` § The archive) and a chip that does nothing would be a
  focusable button with no action.
- **Editing.** "+ Tag somebody" and "+ Add a tag" open the field pre-filled
  with the current set, suggesting from `GET /api/people` and `GET /api/tags`.
  Every add or remove sends a `PUT` of the whole set and nothing is pressed,
  which is what `items.md` § What is in it says the chip rows express. A known
  name goes as `personId` and a new one as `displayName`. "Done" closes the
  field. A failure resets the field to the server's set and says so. The caps
  (`LIMITS.itemMaxTags`, `LIMITS.itemMaxPeople`) stop the field.
- **The alt text follows** in the same response, because the people are half of
  what composes it.

### 10. The capture date and the description

- **The date** is a date picker capped at today in `settings.timezone`, and a
  time pre-filled with the current wall clock. The time is sent only when it
  changed, so the server keeps the seconds the file carried. The wall clock is
  `capturedAt` shifted by `capturedAtOffsetMinutes`, or read in
  `settings.timezone` when the offset is null, which is the server's own rule.
- **"The file said …"** reads from `originalCapturedAt`, which is what makes
  the existing "always undoable" sentence true without a second button.
- **Moving it to another day warns first**: the burst it leaves, with "the
  other 44 stay where they are", and each attached milestone whose span would
  no longer contain it.
- **The description** pre-fills from `altTextOverride` and never from
  `media.altText`, and saves on an explicit button, because a typed sentence is
  a round trip somebody expects. Cleared and saved, it returns to the generated
  line, which the prose quotes from `media.altText` while no override exists.

### 11. Copy the payload cannot back is rewritten

| Prototype                                      | Here                                                                           | Why                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| "Goes to all eight"                            | "Everyone who can see this one can read it"                                    | Nothing in `ItemDetail` counts an audience, and the client cannot expand a rule |
| "There are eight people who can see it"        | "Nobody has written on this one yet. Anybody who can see it can be the first." | The same count                                                                  |
| "you will be asked what to do about that next" | "It stays attached to **Mateo is here**."                                      | The reconciliation offer is step 8b's, so nothing asks yet                      |
| No save on the description                     | "Save the description"                                                         | A field that saves on every keystroke would write an override nobody finished   |

Every kind-aware string ("photograph" or "video") lives in one copy module with
its own test.

### 12. Failures

- **`404`** on the read or on any write is one "not here" state: "This one is
  not here. It may have been taken down, or it was never shared with you." The
  same words for both, because the response is byte-identical for both.
- **`403`** on a write says "You can no longer change this one" and refetches
  once, so the controls agree with the server again. It is rare, and one honest
  open is cheaper than a page offering what will be refused.
- **`429`** reads `details.retryAfterSeconds` and says when to try again.
- **Anything else** keeps what was typed and says it did not go through.
- **The composer and the comment editor keep their text** on every failure.
- **A reaction that fails** puts the previous choice back and says so.

### 13. The pile is wired here

- `TimelinePile` passes `onOpenItem`, which navigates to the viewer. Nothing
  passes it today.
- `api/bursts/bursts.ts` parses the shared `burstFramesResponseSchema`. It was
  written in 5b against an `ItemSummary` guess, so the fan cannot open against
  the real server.
- A fanned frame becomes pressable and opens the viewer, and `Print` takes the
  narrower media a frame carries (`thumb` and `altText`).
- `e2e/pile.spec.ts` "fans a burst open in place" comes off `fixme`, as the
  plan README asks of "the next frontend step that touches the pile".

## Module layout

```
apps/web/src/
├── api/
│   ├── items/                 the item query, and every item, comment and reaction call
│   ├── visibilityRules/       POST /api/visibility-rules/resolve
│   ├── members/               GET /api/members, against step 8a's contract
│   ├── groups/                GET /api/groups, against step 8a's contract
│   └── bursts/bursts.ts       now parses BurstFrameRef
├── routes/_app/items.$itemId.tsx   renders ItemSurface; no loader
└── surfaces/Item/
    ├── ItemSurface/           the query, loading, not-here, photo or video, the top bar
    ├── ItemViewer/             the two columns, the video transport, the way back
    ├── PhotoFrame.tsx
    ├── ItemMeta.tsx
    ├── SiblingStrip/           roving focus, the caption, the cap fallback
    ├── PinningSheet.tsx
    ├── ItemTalk/               the thread and the composer, and the quiet state
    ├── InThisOne/              people and tags, and their editors
    ├── WhoCanSee/              the sentence and the visibility editor
    ├── WhenTaken/              the date and its correction
    ├── Describing/             the alt text override
    ├── ItemActions/            download, the removal entry, delete and its modal
    ├── itemWrites/             one mutation hook per write, one scope, cache writes
    └── itemCopy/               every kind-aware string
```

System components that change: `VideoFrame`, `Composer`, `CommentRow`,
`Reactions`, `PeopleField`, `TopBar`, and in the pile `BurstStack`,
`BurstStackItem`, `PileItems` and `Print`.

## Verification

From the step file, and how each is met:

- **`pnpm check` green.**
- **The capabilities test**, rendering the surface three ways: a viewer sees no
  uploader control; an uploader who did not upload the item sees tags, people
  and describe and not visibility, the date or delete; the item's own uploader
  sees all of them. A fourth case gives an admin's role with every capability
  false and expects nothing.
- **The latch test**: opening sends exactly one item `GET`, no
  `POST /api/items/seen` and no request for any sibling's permalink;
  preloading an item link sends nothing; and after a comment, a reaction, a
  tag, a visibility change and a date correction there is still exactly one
  `GET`. The database half, that the opened item is opened and its siblings
  only seen, is asserted end to end below.
- **End to end, in `e2e/item/`**, against the seeded archive. A directory
  rather than one file beside the others, because specs run alphabetically and
  `empty.spec.ts` needs the catalog empty when it runs (`docs/e2e.md` § The
  archive), so a file that seeds has to sort after it:
  - Open a print from the pile, read the thread, react, comment, and on a
    seeded video pin a comment and watch its mark appear. The seeded clips run
    ten seconds, so the case pins at 0:04 rather than the step file's 0:42.
  - As the item's uploader: tag it, change who sees it between Everyone and
    Only me, correct its date, delete it.
  - Read `item_views`: the opened item has `first_opened_at`; its siblings have
    `first_seen_at` and no `first_opened_at`.
  - Keyboard only: open, move along the strip, react, comment, pin.
  - 200% zoom on both surfaces, no horizontal scroll.
  - Surfaces 3 and 4 added to the contrast sweep.
  - The members and groups picker, `fixme` until step 8a merges.
- **Side by side** with every prototype state at 1280, 768 and 400px, in both
  colour schemes.
- **Screen reader.** The accessibility tree is checked through Playwright,
  including the composed alt text. A pass with a real screen reader is a manual
  step this session cannot perform, and is reported as such.

## Documentation

- `docs/web.md`: surfaces 3 and 4 in the built-surfaces section, the layout
  tree, and the reason the item route has no loader.
- `docs/e2e.md`: `e2e/item/`, and the parked picker case.
- `step-6b.md` and the plan README: status.

## Out of scope

- **Surface 10**, the removal request itself: step 8b. This step only links to
  its route.
- **"Who has opened it"**: `GET /api/items/:itemId/viewers` is step 8a's
  route and surface 17, where the panel belongs, is step 9's, so the panel is
  not drawn even for an admin.
- **Milestones on the item**, showing them or attaching one: step 8b.
- **Uploading**: step 7b.
- **Any change to `apps/server`.**
- **Re-signing a long-open viewer**, per decision 3.
