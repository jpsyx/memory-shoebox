# Step 6b: One photo, one video

**Status:** done
**Parallel with:** 6a
**Depends on:** steps 3b, 5a and 5b

## What this step delivers

The item viewer, in both its forms. A photograph full frame with its burst
siblings beside it, its comments, its tags and people, and the uploader's
controls. A video with its transport, its scrubber, and comments pinned to a
moment on it.

**Done when:** somebody can open a print from the pile, read what was said,
react, leave a comment, pin one to 0:42 of a video and watch it appear on the
scrubber; and an uploader can tag the photograph, change who sees it, correct
its date and delete it.

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
   and **run the prototypes**. Ask the user only what they genuinely do not
   settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-item-viewer-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                             | What you need from it                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                 | Surfaces 3 and 4, every state, § Interactive states, and the "Looking at a day" flow including where it fails |
| `prototypes/` surfaces `photo` and `video`                           | `/s/photo?state=viewer` and the rest. `quiet` and `pinning` are the two that are easiest to get wrong         |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/items.md`       | Every route you call, and `ItemCapabilities`, which decides which controls to draw at all                     |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md` | § Who may change an item, so the interface offers exactly what the server will allow, and § Errors            |
| `DESIGN.md`                                                          | § Reactions in particular: six choices, each carrying its word, because a tooltip is unreachable on a phone   |
| `docs/PRODUCT.md`                                                    | § How it works: comments, reactions, deletion. § Accessibility & Inclusion                                    |
| `prototypes/src/system/Reactions.tsx`, `PeopleField.tsx`             | Both already written in the shipping library                                                                  |

## Scope

**In:**

- Surface 3, every state: full frame, burst siblings, comments, tags and
  people, the visibility control for the item's own uploader, delete
- Surface 4, every state: playing and paused, comments pinned to a moment, a
  comment being pinned, and no comments yet
- The composer as the surface in the `quiet` state rather than an afterthought
  under an empty list
- Reactions, on items and on comments, each carrying its word
- The uploader's controls, drawn from `ItemCapabilities` and never from a local
  role guess, so the interface and the server cannot disagree
- Burst siblings staying visible beside the frame, because in a pile you are
  always somewhere inside a run
- "Frame 7 of 45" and the span, both from the visibility-filtered sibling query
  rather than from a stored count
- The entry point to asking for a photograph to come down, drawn only when
  `capabilities.canRequestRemoval` says so. The surface it leads to is step 8b's
- The seen and opened latches called correctly: opening latches both, the
  sibling strip latches seen only

**Out, and owned by a later step:**

- Surface 10, the removal request itself (step 8b)
- Milestone attachment from the viewer (step 8b)
- Uploading (step 7b)
- Any change to `apps/server`

## Interfaces this step produces

- The item viewer route, which the pile links into
- The comment composer and the pinning control, reused by nothing else but
  worth building as components

## Interfaces this step consumes

From step 5a: every items-slice route.
From step 5b: the pile, which links here.
From step 3b: the theme, the system components, `apiFetch`, the router.

## Do not ask the user about

| Topic                                        | Owned by             |
| -------------------------------------------- | -------------------- |
| Uploading                                    | step 7b              |
| Asking for a photograph to come down         | step 8b              |
| Milestones                                   | step 8b              |
| Members, groups, settings, presence, the log | step 9               |
| Anything in `apps/server`                    | its own backend step |

## Verification

- `pnpm check` green
- Every state compared against its prototype URL at 1280px, 768px and 400px, in
  both colour schemes
- Keyboard-only: open an item, move through the siblings, react, comment, pin a
  comment to a moment. **Nothing may depend on hover**, and the reactions
  control is the worked example of why
- A screen-reader pass over surface 3, including the generated alt text
- 200% zoom on both surfaces with no horizontal scrolling and nothing clipped
- A test that a viewer sees no uploader controls, an uploader who did not upload
  it sees tags and people but not visibility or delete, and the item's own
  uploader sees all of them. Drive it from `ItemCapabilities`
- A test that opening an item latches opened, and that the sibling strip latches
  seen only, which is what keeps surface 17's "scrolled past, never opened" row
  honest
