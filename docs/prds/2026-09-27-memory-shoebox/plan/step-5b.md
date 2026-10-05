# Step 5b: The pile

> Historical source references. `reference/` and `@memory-shoebox/reference` below are historical shorthand for the retired surface package at commit `3e09157b`, not current paths or runnable instructions. Read that commit for the original source spelling. Product decisions remain binding; current implementation and acceptance are documented in `docs/web.md` and step 9 verification.

**Status:** done
**Parallel with:** 5a
**Depends on:** steps 3b, 4a and 4b

Everything in Scope is implemented. Every check in Verification was run, one
of them against a route that has not merged yet and so is parked rather than
passing.

**What was verified.** `pnpm check` is green: 54 files and 311 tests in
`apps/web`, 95 files and 644 tests in `apps/server` with one skipped, plus
`packages/shared`, `packages/emails` and `reference`. `pnpm test:e2e` passes
54 and skips 1, the skip being a deliberate `test.fixme` for fanning a burst,
because `GET /api/bursts/:burstId/frames` belongs to step 5a. Every state was
opened beside its prototype URL at 1280px, 768px and 400px in both colour
schemes, which found five defects and four deliberate differences, all
recorded in the step design under § What the side-by-side found. 200% zoom is
an assertion for `/` and `/people` and was checked by hand for `/?find=true`
and `/people?q=a`. Reaching a print with a keyboard is an assertion; applying
a filter and clearing it again was driven by hand.

**Scroll was measured rather than felt, and the measurement answered the
question.** `e2e/scroll.spec.ts` scrolls the seeded 340-item day thirty
thousand pixels at a 400px viewport and reports 61 frames a second with no
long task at all, against thresholds of 30 and 200ms that are assertions in
that spec. **No virtualizer was added.** A day-level
`content-visibility: auto` is the whole of the scroll strategy and it is one
CSS rule; a CSS multi-column box cannot be windowed, because the browser has
to lay out every child to balance the columns.

**Two deliverables this step did not originally name, and could not be
finished without.** A **generated cartoon media set**
(`reference/scripts/media/`, `pnpm --filter @memory-shoebox/reference
media`, 118 committed files at 1.8MB) replaced the real family photographs
that were gitignored and therefore absent from a fresh clone, and is
byte-deterministic so a regenerate is an empty diff. See `docs/media.md`. And
a **development archive seed** (`apps/server/scripts/archiveSeed/`, `pnpm
seed:archive`) writes 427 items over 11 days shaped to reach every state
these surfaces must draw. Uploading is step 7b, so without it there is
nothing to look at, nothing to measure and nothing for a browser test to
find. The seed is the one place this step touches `apps/server`, which
§ Scope puts out; it adds no route, no service and no migration, and the
deviation is argued in the step design's decision 2. See
`docs/configuration.md` § Something to look at.

**One fix outside this step's scope**, in `apps/web`'s test configuration and
nowhere near a surface. A flake that predates this branch had the surface-9
device case failing on a full suite and passing in isolation, and
`vitest.setup.ts` raised Testing Library's `asyncUtilTimeout` to 5000ms for
it. That is exactly Vitest's own default `testTimeout`, so a slow wait was
killed as a test timeout a moment before it would have passed, roughly one
full-suite run in three. `vitest.config.ts` now sets `testTimeout` to 20s,
above the wait it has to contain.

**What was not verified.** Fanning a burst, in a browser or by hand. The
client is written against `timeline.md` Ruling 2 and its unit tests stub the
fetch; the end-to-end case is written and skipped with a reason naming step
5a, so it turns on with one line.

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
   and **run the reference**. Twenty-odd states are already drawn and every one
   is a URL. Ask the user only what they genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-the-pile-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                          | What you need from it                                                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`              | Surfaces 2, 5, 6 and 7, every state, the "Looking at a day" flow, § Interactive states, and the responsive behaviour at 44rem     |
| `reference/` surfaces `timeline`, `empty`, `filter`, `people`     | `/s/timeline?state=pile` and the rest. `burst`, `milestone-span` and `milestone-empty` are the three that carry the most rules    |
| `reference/src/system/Pile.tsx`                                   | The stack, the fan, the day spine and the print. Already written in the library the product ships with                            |
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
