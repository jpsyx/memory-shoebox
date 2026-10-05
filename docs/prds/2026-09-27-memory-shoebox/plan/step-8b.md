# Step 8b: Asking, and occasions

**Status:** complete (5 October 2026)
**Parallel with:** 8a
**Depends on:** steps 3b, 6b and 7a

## What this step delivers

Three surfaces that share a shape: something a person raises, and the queue
somebody answers it in. Surface 10 is asking for a photograph of you to come
down. Surface 15 is the uploader's and the admin's view of those asks. Surface
14 is milestones, the dated occasion and everything that hangs off it.

**Done when:** a member tagged in a photograph can ask for it to come down and
see that somebody heard them; an uploader can delete it or decline with a
reason in their own words; and an uploader can create an occasion, attach
photographs to it, and reconcile the ones captured outside its span.

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
   `docs/superpowers/specs/YYYY-MM-DD-asking-and-occasions-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                            | What you need from it                                                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                | Surfaces 10, 14 and 15, every state, and the "Asking for a photograph to come down" flow including where it stops early |
| `prototypes/` surfaces `removal`, `removal-requests`, `milestones`  | `/s/removal?state=ask` and the rest. `already`, `settled` and `fix` are the three that are easiest to get wrong         |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/removals.md`   | Every route you call, and `RemovalRequestDto`'s per-viewer `canWithdraw`, `canDecline` and `canDeleteItem`              |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/milestones.md` | Every route you call, and its `## Rulings` 3, on where the attach picker's narrowing comes from                         |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md`   | `attachedToMilestoneId` and `excludeAttached`, which the attach picker drives from                                      |
| `docs/PRODUCT.md`                                                   | § How it works: milestones and asking for something to come down. The removal flow exists to replace a phone call       |
| `DESIGN.md`                                                         | § Typography and § Shapes. A declined request carries somebody's own words and has to read like a person wrote it       |

## Scope

**In:**

- Surface 10, every state: asking with an optional reason, already requested
  with "Withdraw the request", and the uploader's and admin's view of one
- Surface 15, every state: open requests, acting on one by deleting, declining
  one and what the requester is told, and settled. The settled tab holds
  deleted, declined **and** withdrawn
- A request whose photograph has since been deleted, which has nothing to show
  because the file is genuinely gone. The gap is the honest picture
- The three per-viewer capability booleans driving which buttons exist at all,
  never a local role guess
- Surface 14, all nine states: the list, create, create with a span, created and
  then finding its photographs, edit, attach, reconcile items captured outside
  the span, a milestone with nothing attached, and delete
- The attach picker narrowing through `GET /api/timeline` with
  `attachedToMilestoneId`, rather than a second search grammar
- Delete copy that says plainly what it does: removes the label, removes no
  photograph

**Out, and owned by a later step:**

- Members, groups, settings, presence, the change log (step 9)
- Any change to `apps/server`
- The item viewer's entry point into surface 10, which step 6b already drew

## Interfaces this step produces

- Surfaces 10, 14 and 15. Step 9 depends on none of them

## Interfaces this step consumes

From step 7a: both slices' routes.
From step 4a: the timeline query, for the attach picker.
From step 6b: the item viewer, which links into surface 10.
From step 3b: the theme, the system components, `apiFetch`, the router.

## Do not ask the user about

| Topic                          | Owned by                                         |
| ------------------------------ | ------------------------------------------------ |
| Members, groups, settings      | step 9                                           |
| Presence and the change log    | step 9                                           |
| Uploading                      | step 7b                                          |
| Anything in `apps/server`      | its own backend step                             |
| Whether withdrawing sends mail | settled: it does, to the uploader and the admins |

## Verification

- `pnpm check` green
- Every state compared against its prototype URL at 1280px, 768px and 400px, in
  both colour schemes
- The whole "Asking for a photograph to come down" flow by hand, as three
  different people: the asker, the uploader and an admin
- The withdraw path, end to end, confirming the uploader is told
- A test that a viewer sees no decline or delete control, and that an admin
  sees no withdraw control on somebody else's request
- A test that a settled request whose item is gone renders without a broken
  image and without a link that 404s
- Keyboard-only through asking, declining and attaching
- 200% zoom on all three surfaces with no horizontal scrolling and nothing
  clipped

## Completion evidence

All verification criteria above passed. The focused Chromium suite passed 34
cases; impacted item/account/filter plus this suite passed 72 with one documented
pre-existing administration picker case parked. `pnpm check` passed all gates
and 3,065 tests in 469 files. All 114 production/prototype state comparisons,
640px equivalent reflow, final description sizing, long/failed controls, manual
three-person withdrawal/decline/delete, keyboard attachment and actual native
200% zoom were verified. Mail evidence proves queued notification, not delivery.
Evidence remains ignored under `.playwright-mcp/step8b-acceptance/`; native
acceptance uses the usable `native-cdp-*` captures and `native-200-metrics.json`,
with earlier failed captures preserved diagnostically. Baseline JSDOM notices
remain; no required case was newly skipped. Controller review follows completion.

Task 7 review found a missed dark reconciliation Back to the list contrast
defect and a calendar helper dependent on the machine month. Fix round 1
verified the owner print background at light/dark 1280/768/400 and 640px reflow,
then passed all five live occasion cases after an out-of-month browser RED.
The bounded eight-case browser command and five reconciliation unit tests
passed. The expected 20-code full-suite budget is a static calculation from
the existing 18 plus two cached actors; no unfiltered full-suite mint count
was observed during Task 7.
