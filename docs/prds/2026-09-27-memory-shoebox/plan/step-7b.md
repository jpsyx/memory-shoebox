# Step 7b: The upload surface

**Status:** in progress (Tasks 1 through 7 implemented and reviewed; surface and routing next)
**Parallel with:** 7a
**Depends on:** steps 3b, 5b, 6a and 6b

## What this step delivers

Surface 8, and only surface 8. **The product's promise lives here**: a parent
puts up everything from an occasion in one go, without choosing between them
first, because choosing is the work that stops them doing it at all. This is the
one surface where the product either survives that promise or quietly becomes
curation.

**Done when:** somebody can select a few hundred files off a phone, watch them
group by the day they were taken, tag and people-tag and assign a milestone in
bulk, skip past the visibility step because it is already right, and watch the
batch go up, including when some of it fails and when the tab is closed
halfway.

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
   and **run the prototype**. Surface 8 has more designed states than any other
   and every one is a URL. Ask the user only what they genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-upload-surface-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                             | What you need from it                                                                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                 | Surface 8, every state, and the "Putting a batch up" flow **including where it fails**. Also why it carries more weight |
| `prototypes/` surface `upload`                                       | `/s/upload?state=select` and every other state. This is the specification, not an illustration of one                   |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/upload.md`      | Every route you call, the state machine, the progress shape, and its `## Rulings`                                       |
| `apps/web`'s derivative helper                                       | Step 6a built and tested it. Call it; do not write a second one                                                         |
| `docs/PRODUCT.md`                                                    | § Positioning on nobody curating, § User stories, and § Product surface on bulk upload with no curation step            |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md` | § Errors, so a refused file type and a storage outage read as different things                                          |
| `DESIGN.md`                                                          | § Motion, for progress that is honest rather than decorative                                                            |

## Scope

**In:**

- Every state of surface 8: `select`, `days`, `selection`, `tag`, `tagged`,
  `person`, `people-tagged`, `milestone`, `milestone-assigned`,
  `milestone-new`, `milestone-fix`, `visibility`, `sending`, `done`,
  `partial`, `resume`, and a refused file type
- Grouping by capture day in the browser, because one upload is routinely
  several weeks
- Bulk actions on a selection, each with the after state that shows it applied.
  An action whose result is invisible gets repeated
- Creating an occasion inline, and reconciling photographs captured outside its
  span
- The visibility step pre-filled to everybody, so it reads as a step you skip
- Real progress across a few hundred files, driven by `complete`'s `progress`
  and `didSettle` rather than by polling a `GET` after each of 264 completes
- `partial`, which says plainly what did not arrive and offers only what is
  missing
- `resume`, which finds the batch again with its edit plan intact after a closed
  tab, and which must **not** promise a second email: after a batch has settled,
  `isIncludedInEmail` is false and the recovered photograph appears silently
- Calling the derivative helper, and handling the case where it cannot decode a
  file: that is a shorter `renditions` list, not a failed upload

**Out, and owned by a later step:**

- Every upload route (step 6a, finished)
- The milestone surface itself, surface 14 (step 8b). This step creates one
  inline through step 7a's route
- Any change to `apps/server`

## Interfaces this step produces

- Surface 8, complete. Nothing later depends on it

## Interfaces this step consumes

From step 6a: every upload-slice route and the browser derivative helper.
From step 7a: `POST /api/milestones`, for the inline creation. If step 7a is
running in parallel and is not finished, build against the contract and verify
that one path last.
From step 5a: the tag, people and visibility writers the bulk actions call.
From step 3b: the theme, the system components, `apiFetch`, the router.

## Do not ask the user about

| Topic                                        | Owned by                         |
| -------------------------------------------- | -------------------------------- |
| The milestone surface, the removal queue     | step 8b                          |
| Members, groups, settings, presence, the log | step 9                           |
| Anything in `apps/server`                    | its own backend step             |
| Whether the browser should make derivatives  | settled in step 6a, with a spike |

## Verification

- `pnpm check` green
- A real batch of at least 200 mixed files, from a phone, on a phone-sized
  viewport, against a real bucket
- Every state compared against its prototype URL at 1280px, 768px and 400px, in
  both colour schemes
- Close the tab mid-transfer, reopen, and confirm the edit plan survived and
  only the missing files are asked for
- Kill the network mid-transfer and confirm `partial` says plainly what did not
  arrive
- Confirm a file recovered **after** the batch settled sends no second email and
  that the surface does not promise one
- Keyboard-only through the whole flow, including the bulk actions
- 200% zoom with no horizontal scrolling and nothing clipped
- Ask somebody who did not build it to put up a real occasion without being
  told how. If they stop to choose between photographs, the surface has failed
  at the thing it exists for
