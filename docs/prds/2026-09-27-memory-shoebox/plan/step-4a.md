# Step 4a: The archive read path

**Status:** done
**Parallel with:** 4b
**Depends on:** steps 1, 2 and 3a

## What this step delivers

The whole read side of the pile: the day stream with its milestone bands and
its per-viewer counts, the jump rail, filtering and search, the tag and people
directories, and the one-way latch that clears accent dots. Six routes, and the
hardest query in the product.

**Done when:** a member's timeline page returns days with correct per-viewer
counts, a filtered request returns the same shape narrowed, an invisible item is
absent from both the rows and every count that heads them, and an empty archive
is byte-identical on the wire to one the viewer cannot see any of.

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
   before asking anything. `timeline.md` ends with a `## Rulings` section that
   answers five questions this step would otherwise raise, including what a
   filter does to the milestone-span union. Ask the user only what the documents
   genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-archive-read-path-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                             | What you need from it                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md`    | **The whole file**, including its `## Rulings`. Six routes, the cursor, the union, and the three properties asserted once at its head |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md` | § The visibility predicate, § Errors, § Envelope, § Pagination, § The three documented exceptions (`peopleCount` is one of them)      |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`      | § `items`, § `bursts`, § `milestones`, § `tags`, § `people`, § `item_views`, § One rule that outranks the others, § The evaluation    |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                 | Surfaces 2, 5, 6 and 7 and their states, plus the "Looking at a day" flow                                                             |
| `prototypes/` surfaces `timeline`, `empty`, `filter`, `people`       | Every state. `milestone-empty` and `restricted` are the two that constrain the query most                                             |
| `docs/PRODUCT.md`                                                    | § How it works: the archive, days, bursts, milestones. And § Positioning on a small circle around a large unsorted archive            |
| `app.config.ts`                                                      | `appConfig.burst` is what grouped the frames this route now renders as stacks                                                         |
| `docs/rules/sql.md`                                                  | Binding house style for every query here                                                                                              |

## Scope

**In:**

- `GET /api/timeline`, including the milestone-span union, the opaque cursor
  that encodes the last day and the opened-milestone set, and `resultCount`
  returned only on an uncursored filtered request
- `GET /api/timeline/rail`, `GET /api/filters/facets`, `GET /api/tags`,
  `GET /api/people`
- `POST /api/items/seen`, the one-way latch, which deliberately does not report
  on the ids it was given
- `attachedToMilestoneId` and `excludeAttached` on the timeline request, which
  the milestone attach picker drives from in step 7a rather than reinventing
- The one-time line after a first sign-in: this route supplies the
  viewer-filtered number, and it must never come from a seed
- Every count filtered by the identical predicate expression as the rows it
  heads, composed from step 3a's single expression and never retyped
- The burst rendering rules at read time: the cover resolves to
  `cover_item_id` if visible and otherwise the earliest visible frame; **one**
  visible frame renders as a plain print; **zero** and the burst vanishes and
  contributes nothing to the day

**Out, and owned by a later step:**

- `GET /api/items/:itemId` and everything hanging off one item, including
  `GET /api/bursts/:burstId/frames` (step 5a)
- Creating or editing any tag, person or milestone (steps 5a and 7a)
- Every surface (steps 4b and 5b)

## Interfaces this step produces

- `@memory-shoebox/shared`: `TimelineRequest`, `TimelineResponse`,
  `TimelineDay`, `DayMilestoneBand`, `DayMilestoneStrip` and the four other
  routes' schemas
- The per-viewer count expression, reused by every later slice that counts

## Interfaces this step consumes

From step 3a: the request context, `visibleRuleIds`, the visibility predicate.
From step 1: the frozen DTOs, in particular `ItemSummary`, `BurstSummary`,
`MediaRef` and `MilestoneRef`.

## Do not ask the user about

| Topic                                           | Owned by     |
| ----------------------------------------------- | ------------ |
| One item: comments, reactions, tags, visibility | step 5a      |
| Uploading anything                              | step 6a      |
| Creating or editing milestones                  | step 7a      |
| Any surface at all                              | steps 4b, 5b |
| Members, groups, settings                       | step 8a      |

## Verification

- `pnpm check` green
- A test that a brand-new archive and an archive where the viewer can see
  nothing produce **byte-identical** responses. No `hiddenCount`, no
  `archiveIsEmpty`, no debug field. This is a contract, not an accident
- A test per count that the number and the rows it heads are produced by the
  same predicate: restrict one item and assert both move together
- A test that a day of 212 items reads as 204 to somebody restricted from 8,
  and that nothing in the payload reveals the other 8
- A test that a date-range filter keeps a milestone-only day and a tag filter
  drops it, which is the ruling in `timeline.md` § Rulings 1
- A test that an unknown tag or person id narrows to nothing rather than
  erroring, because erroring would make the route an existence oracle
- A cursor test: paging the whole archive returns every day exactly once
- The query plan for one timeline page, asserting it is a constant six to eight
  queries regardless of how many days and items come back
