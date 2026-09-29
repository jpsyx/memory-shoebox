# Step 5b: The pile

**Status:** not started
**Parallel with:** 5a
**Depends on:** steps 3b, 4a and 4b

## What this step delivers

The surface the product is for. A chronological archive grouped by day, where a
single day can hold hundreds of items, scrolled at leisure and stopped at
whatever catches somebody. Plus the two empty states, the filter and search
surface, and the people directory.

**Done when:** a member can scroll years of days at speed, fan a burst open in
place, jump by month on the rail, narrow by tag, person and date range and
clear back to the whole pile, and see accent dots go out as they pass.

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
   and **run the prototypes**. Twenty-odd states are already drawn and every one
   is a URL. Ask the user only what they genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-the-pile-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                          | What you need from it                                                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`              | Surfaces 2, 5, 6 and 7, every state, the "Looking at a day" flow, § Interactive states, and the responsive behaviour at 44rem     |
| `prototypes/` surfaces `timeline`, `empty`, `filter`, `people`    | `/s/timeline?state=pile` and the rest. `burst`, `milestone-span` and `milestone-empty` are the three that carry the most rules    |
| `prototypes/src/system/Pile.tsx`                                  | The stack, the fan, the day spine and the print. Already written in the library the product ships with                            |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md` | Every route you call, its request, its response and its cursor. Also its `## Rulings`, in particular 3 on re-signing a stale page |
| `DESIGN.md`                                                       | § Layout, § Shapes, § Motion. The messy pile and its rotations are specified, not improvised                                      |
| `docs/PRODUCT.md`                                                 | § Positioning on browsing a pile rather than a gallery, and § Accessibility & Inclusion                                           |
| `app.config.ts`                                                   | Why a stack is a stack: 10 seconds, three frames                                                                                  |

## Scope

**In:**

- Surface 2, every state: the pile by day, a burst closed and fanned, a
  milestone inline, one spanning several days, one with nothing attached, a day
  with one item, filtered, and the end of the archive
- Fast scrolling through thousands of items. This is a product requirement
  rather than an optimisation (`PRODUCT.md` § Product surface)
- The jump rail
- Surface 5, both states: a brand-new instance and a viewer who can see
  nothing. These two must be indistinguishable on the wire, and the copy on
  each is what makes them distinguishable to the right person only
- Surface 6, every state: by tag, by person, by date range, several at once, no
  results, and clearing back. One route with query parameters, never a second
  results shape
- Surface 7, the people directory, including somebody with no photographs yet
- The seen latch, called as somebody passes, and the accent dots going out
- Re-signing a page left open: when `MediaSource.expiresAt` passes, refetch the
  affected page **in place** and merge by id, so scroll position survives.
  There is no refresh route and none is wanted
- The day spine's count label using the filtered person's **own name**, never a
  pronoun. Nothing in the schema knows anybody's gender

**Out, and owned by a later step:**

- Opening one item (step 6b). A click can navigate to a placeholder
- Uploading (step 7b)
- Creating a milestone (step 8b)
- Any change to `apps/server`

## Interfaces this step produces

- The pile, the stack, the fan, the day spine and the filter strip as
  application components, moved from `apps/web/src/system/` into real use
- The infinite-scroll and cursor handling every later list reuses

## Interfaces this step consumes

From step 4a: all six timeline-slice routes.
From step 3b: the theme, the system components, `apiFetch`, the router.
From step 4b: the signed-in shell and the route guard.

## Handed over from step 4b

Two things step 4b found that become this step's the moment it starts. Neither
is a defect, and neither had an owner until now.

**The first-sign-in banner has an unfinished sentence, and finishing it is the
work rather than deleting it.** `apps/web/src/routes/_app/index.tsx` currently
reads "The count that finishes this sentence comes from the timeline, which is
built in step 4a." Step 4b was right not to invent a number: its own scope says
the one-time line's number "comes from step 4a's timeline response and never
from a seed". But nothing records that the sentence is unfinished rather than
finished-and-terse, and the placeholder page around it is the very thing this
step replaces. When the real pile goes in, the banner stays and the count goes
where that sentence stops.

**The end-to-end suite is two sign-in codes from its per-IP cap.** The whole
run shares one bucket of twenty because every request comes from `127.0.0.1`,
and it currently spends eighteen (`docs/e2e.md` § The per-IP mint budget).
Every surface this step adds that needs a session adds another, and the failure
does not land on the test that added it: files run alphabetically under one
worker, so the `429` surfaces in whichever spec runs next, as a timeout on the
code field. **Put a shared signed-in fixture in before adding the first one.**
`contrast.spec.ts` and the keyboard pair at the foot of `account.spec.ts`
already do this by hand, signing in once in a `beforeAll` and handing the
storage state to every context; making it a Playwright fixture is the obvious
next move and it is cheaper to do before the surfaces than after.

## Do not ask the user about

| Topic                                        | Owned by             |
| -------------------------------------------- | -------------------- |
| One photo, one video, comments, reactions    | step 6b              |
| Uploading                                    | step 7b              |
| Milestones, removals                         | step 8b              |
| Members, groups, settings, presence, the log | step 9               |
| Anything in `apps/server`                    | its own backend step |

## Verification

- `pnpm check` green
- Every state compared against its prototype URL at 1280px, 768px and 400px, in
  both colour schemes. Open them side by side
- Scroll performance on a day of several hundred items, on a phone-sized
  viewport, measured rather than felt
- Keyboard-only: reach a print, fan a burst, apply and clear a filter. Nothing
  may depend on hover, long-press, precise dragging or a discovered gesture
- 200% zoom on all four surfaces with no horizontal scrolling and nothing
  clipped
- A test that a burst with one visible frame renders as a plain print and one
  with zero visible frames does not render at all
- A test that leaving a page open past the signed-URL lifetime and refetching
  keeps the scroll position
