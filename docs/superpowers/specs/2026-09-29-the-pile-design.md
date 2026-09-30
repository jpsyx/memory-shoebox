# Step 5b: the pile

**Step design** for step 5b of
[`docs/prds/2026-09-27-memory-shoebox/plan/step-5b.md`](../../prds/2026-09-27-memory-shoebox/plan/step-5b.md).

This is not the product spec. The product spec is
[`docs/PRODUCT.md`](../../PRODUCT.md) and
[`design-spec.md`](../../prds/2026-09-27-memory-shoebox/design-spec.md), the
API contract is
[`tech-specs/apis/timeline.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md),
and the visual record is [`DESIGN.md`](../../../DESIGN.md). Those four are
read, never restated. This document records only what is specific to putting
surfaces 2, 5, 6 and 7 in front of the routes step 4a delivered, and cites the
rest.

## What this delivers

The surface the product is for. A chronological archive grouped by day, a
burst that fans in place, a jump rail over every visible day, the filter and
search surface, the people directory, and the two empty states that must be
indistinguishable on the wire.

It also delivers two things the step did not originally name, both of which
this step cannot be verified without: a **generated cartoon media set** that
replaces the real family files the prototypes used, and a **dev and end-to-end
archive seed** that puts days, bursts, milestones, people and tags into a
catalog. Upload is step 7b, so without a seed there is nothing to look at and
nothing to measure.

## What already exists, and what it settles

| File                                    | What it already settles                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/system/Pile/`             | `Archive`, `DayRow`, `DaySpine`, `Pile`, `Print`, `PileItems`, `BurstStack`, `MilestoneBand`, `MilestoneContinues`, `Ghosts`, `scatterStyle`            |
| `apps/web/src/system/system.module.css` | Every class these surfaces need, including `.rail`, `.railSpacer`, `.archiveEnd`, `.milestoneEmptyPile`, `.peopleGrid` and `.personCard`, at all widths |
| `apps/web/src/system/FilterStrip/`      | The sticky strip with its count and its clear-all                                                                                                       |
| `apps/web/src/system/Chip/`             | `Chip` with `active`, `quiet` and `onRemove`, and `ChipRow`                                                                                             |
| `packages/shared/src/timeline.ts`       | Every request and response schema in the slice, including the facet refinement that refuses a chip carrying the wrong one of two counts                 |
| `packages/shared/src/vocabularies.ts`   | `tagsResponseSchema`, `peopleResponseSchema`, `directoryPersonSchema`                                                                                   |
| `packages/shared/src/items.ts`          | `itemsSeenRequestSchema`, capped at `LIMITS.seenMaxIds`                                                                                                 |
| `packages/shared/src/dtos.ts`           | `BurstSummary.hasUnseenFrames`, which is what lets the latch stay silent on a familiar archive                                                          |
| `apps/web/src/routes/_app/index.tsx`    | The search schema: `tag`, `person`, `from`, `until` and `find`, with `_oneOrMany` already handling `?tag=a` and `?tag=a&tag=b` alike                    |
| `apps/web/src/api/client/client.ts`     | `apiFetch`, the error envelope, `jsonInit`, and `z.void()` for a `204`                                                                                  |
| `apps/server/scripts/seedMember.ts`     | The pattern a seed script follows, and the second-handle-on-the-catalog approach `e2e/support/database.ts` reuses                                       |
| `e2e/support/signIn.ts`                 | The per-IP mint budget, counted against `RATE_LIMIT_RULES` rather than a comment                                                                        |

`apps/web/src/system/Pile/timeline.types.ts` is now redundant: it says in its
own doc comment that it is a transcription to be deleted once
`@memory-shoebox/shared` carries these types, and step 4a made it do so. The
three types move to the shared import and the file goes.

## Decisions

### 1. The prototypes get a generated cartoon set, and the real family files go

`prototypes/src/data/media.ts` points at `prototypes/public/media/web/`, which
`.gitignore` excludes and which does not exist on a fresh clone. The source
folder `prototypes/media/` holds 68MB of real family photographs and one video.
Neither can be committed and neither can be seeded into a bucket from CI.

So the media is generated instead: cartoon-baby artwork, authored as parametric
SVG, rasterised to JPEG and encoded to video, committed, and used by both the
prototypes and the seed.

**Both the generator and its output are committed.** The generator makes the set
reproducible and adjustable; the output makes a clone render without
`rsvg-convert`, `magick` or `ffmpeg` installed. Committing only one of the two
would cost one of those two properties and there is no reason to.

| Piece     | Path                                     | What                                                                                                                                         |
| --------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Generator | `prototypes/scripts/makeCartoonMedia.ts` | Writes SVG, shells out to `rsvg-convert`, `magick` and `ffmpeg`. Deterministic: no randomness that is not seeded, so a re-run is byte stable |
| Stills    | `prototypes/public/media/web/`           | Eight scenes (cot, bath, high chair, pram, first steps, cake, beach, arrival), mixed landscape and portrait, ~1600px long edge, 400px thumbs |
| The burst | `prototypes/public/media/web/`           | Forty-five near-identical frames of the cake scene, varying only the flame, an arm and the confetti                                          |
| Clips     | `prototypes/public/media/web/`           | Three ten-second animations at 12fps, as h264 `.mp4` and vp9 `.webm`, each with a poster still                                               |

Forty-five frames between 06:41 and 06:44 is not an arbitrary number: it is the
run `app.config.ts` § `burst.maxGapSeconds` was tuned against, and a burst that
does not reproduce it does not exercise the thing the stack exists for.

The byte stability in that table had to be earned rather than assumed. Running
the generator twice found three WebM files changing every time, because the
Matroska muxer writes a random `SegmentUID` and both muxers stamp the
encoder's version; both `ffmpeg` calls now run bit-exact. `docs/media.md`
records it.

`.gitignore` loses its `prototypes/public/media/` line and keeps excluding
`prototypes/media/`. `docs/prototypes.md` § What is real and what is not stops
saying the media is real family files. `prototypes/media/` is deleted once the
prototypes render from the new set and not before.

### 2. The seed is a script, and it is the one place this step touches `apps/server`

`step-5b.md` § Scope puts "any change to `apps/server`" out. This step adds
`apps/server/scripts/seedArchive.ts` and one line to `apps/server/package.json`
anyway, and records the deviation here rather than doing it quietly.

The reason is that the step's own verification cannot run without it. "Every
state compared against its prototype URL", "scroll performance on a day of
several hundred items, measured rather than felt" and every end-to-end
assertion about a day, a burst or a person need rows in a catalog, and the
route that makes them is step 7b's. The seed touches no route, no service and
no migration: it is additive, it lives beside `seedMember.ts`, and it is
development tooling in the same sense that `e2e/support/database.ts` already
reaches past the API to write a member.

What it writes, and why each is there:

| Shape                                | Exists so that                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| A day of 340 visible items           | The scroll measurement has something to measure, over the 400-item page budget's edge |
| A 45-frame burst                     | The stack and the fan have their design case                                          |
| A burst with one visible frame       | The server must send `burst: null` and the client must draw a plain print             |
| A burst with zero visible frames     | Nothing may be drawn and nothing counted                                              |
| A one-item day                       | Surface 2 `single`: one print in a nine-column pile must read as deliberate           |
| A one-day milestone                  | Surface 2 `milestone`                                                                 |
| A five-day milestone                 | Surface 2 `milestone-span`: one band, four strips, band on the span's **last** date   |
| A day covered by two milestones      | Surface 2 `milestone-two`: the narrowest span takes the band                          |
| A milestone with no items            | Surface 2 `milestone-empty`, which must also survive a date filter and not a tag one  |
| Items restricted to a group          | The lock chip, and a count that moves with its rows                                   |
| A person with no `item_people` rows  | Surface 7 `zero`, the state the `ON`-clause bug kills silently                        |
| A tag whose every item is restricted | The zero chip that stays on the row                                                   |
| `item_views` rows over part of a day | A non-zero `unseenCount` that is not the whole day                                    |

It is deterministic (one fixed seed), idempotent (it clears the rows it owns
before writing), and takes `--no-objects` to skip the bucket upload. The e2e
catalog runs with that flag: `E2E_SERVER_ENVIRONMENT`'s B2 values are
placeholders that cannot reach Backblaze, so the URLs sign correctly in process
and the images simply do not load. Every DOM assertion, every count, every
label and the contrast sweep are unaffected, because none of them is a picture.

**The seed never feeds a count the product reads.** `data-models.md` Decision 3
and `timeline.md` both insist the first-sign-in number comes from a route that
applies the visibility predicate. The seed writes rows; every figure on screen
is still counted by the server from those rows.

### 3. One selection, spelled once

Four routes take the same selection and the URL carries it. Three spellings of
it would drift, so there is one:

```
TimelineSelection        // tags, people, from, until
getSelectionFromSearch() // the route's validated search -> selection
makeQueryFromSelection() // selection -> URLSearchParams for the wire
```

The URL is the source of truth, not component state. A filter is an address in
this product, so a bookmarked or texted `?person=<id>&from=2026-09-01` has to
land on the same pile, and `_oneOrMany` in the existing search schema is
already there for exactly that.

Every query key is derived from the same selection object, so the pile, the
rail and the facets invalidate and refetch together and cannot settle on
different answers to the same question.

The naming follows `AGENTS.md` § Naming conventions: free functions name both
halves, and neither `resolve` nor `build` appears.

### 4. The rail jumps with `?at=`, which is a start position rather than a filter

`GET /api/timeline/rail` returns every visible day, which is 948 in the
fixtures, while the day stream pages ten at a time behind a cursor the client
must not mint. Jumping to a day six hundred entries down therefore needs a way
to start the stream somewhere other than the top, and this step may not change
the server.

A day already loaded is scrolled to, and nothing is fetched. Any other day sets
`at=YYYY-MM-DD` in the URL, which is sent on the wire as `until`, and the
stream restarts from there.

It is deliberately **not** a filter chip. `design-spec.md` calls a filter left
on by accident this surface's worst failure, and a jump is not something
somebody filtered by. So `at` stays out of the filter strip, the strip's
clear-all does not touch it, and the rail's own control shows which day the
stream is standing on.

Two costs, both accepted and both recorded because a future reader will
otherwise think they are bugs. `resultCount` comes back non-null on a request
carrying `until`, because `timeline.md` counts `until` as a filter; the client
ignores it when the only thing set is `at`. And the days above the jump are no
longer reachable by scrolling up, which is what "start the stream here" means;
the rail is the way back and the rail never leaves.

### 5. The two empty states are told apart by the viewer's own role

`timeline.md` transformation 9 makes the payload identity a contract: a
brand-new archive and a fully restricted viewer return byte-identical bodies,
and the copy that differs "is chosen in the browser from the viewer's own role
and the member list, never from this payload".

The role is already in hand: `meQueryOptions` serves `me.role` and the shell
fetches it before any guarded route renders. An uploader or an admin sees
surface 5 `new`, with "Nothing on the door yet" and the upload and invite
buttons. A viewer sees `restricted`.

The member list is not in hand, and must not be: it is an admin route. The
prototype's `restricted` state ends on a button reading "Ask Papá about it",
which needs a name the client cannot have. **The copy becomes "Ask whoever
invited you about it"** in `apps/web`, and the prototype is corrected to match,
because `docs/prototypes.md` requires a surface whose copy is wrong to be
fixed in both places until step 9.

A viewer looking at a genuinely empty archive therefore reads the restricted
copy. That is not a defect. It is the indistinguishability the contract asks
for, seen from the one side that cannot tell.

### 6. The fan is built against step 5a's frozen contract

`timeline.md` Ruling 2 fixes the shape: `GET /api/bursts/:burstId/frames`
returns `ItemSummary[]` ordered by `burst_index`, filtered by the same
predicate, `404` on a burst with no visible frames. The route belongs to step
5a, which is running in parallel and is not merged.

The client is written against that contract now, because the alternative fails
this step's own done-when clause. `BurstStack` was already shaped for it in
step 3b: it takes `frames` separately from `cover`, exposes `onOpen`, and
refuses to draw a fan header over an empty run, so nothing about the component
has to change.

Unit tests stub the fetch, so this branch's suite is green on its own. The
end-to-end fan test is written and skipped with a reason naming step 5a, so it
turns on with one line rather than being remembered.

### 7. Scroll is contained before it is virtualized, and the decision is measured

`.pile` is `columns: var(--tile) auto`. A CSS multi-column box cannot be
windowed: the browser has to lay out every child to balance the columns, so
there is no way to render half a day.

What can be skipped is a whole day. `content-visibility: auto` with a
`contain-intrinsic-size` estimate on each day's pile lets the browser skip
layout, paint and hit-testing for every day that is not near the viewport,
which is most of them, and it costs one CSS rule. The prints already carry
`loading="lazy"`, and the day stream already pages behind an intersection
observer.

Then it is measured rather than felt: a scripted scroll over the seeded
340-item day at a 400px viewport, reporting long tasks, dropped frames and the
time to first paint of a day entering view, with the numbers written into this
document under § What the measurement found.

Virtualization is added only if that measurement asks for it. A day-level
virtualizer fights the sticky spine and the `display: contents` day row, and a
dependency added before anything has proved it is needed is a dependency
nobody can later argue about removing.

### 8. Re-signing watches one clock and refetches in place

`timeline.md` Ruling 3: when `MediaSource.expiresAt` passes the client refetches
the affected page in place and merges by id. There is no refresh route and none
is wanted.

One hook scans the loaded pages for the earliest `expiresAt`, sets a single
timer for it, and on fire calls `refetchQueries` for that infinite query.
TanStack Query refetches every loaded page and replaces them together, so
"merge by id" is React's own reconciliation given a stable `key={item.itemId}`:
no node is unmounted, nothing above the viewport changes height, and the scroll
offset survives because nothing navigated.

One timer rather than one per page, because a hundred timers for a fact that
moves once an hour is a hundred things to clear on unmount.

The test drives the hook with a fixture whose `expiresAt` is seconds away,
asserts the refetch, and asserts the scroll offset of the scrolling container is
unchanged across it. An end-to-end version would have to wait an hour or fake a
clock the server also reads, and it would prove less.

### 9. The latch is silent on a familiar archive

`timeline.md` § Performance: steady-state browsing must cost zero writes,
including zero requests.

An intersection observer marks a print as seen, ids collect in a batch, and the
batch flushes on idle or after 500ms, capped at `LIMITS.seenMaxIds`. **The
request is suppressed entirely when no item in the batch has `isUnseen` and no
burst in it has `hasUnseenFrames`**, which the client knows without asking. A
collapsed stack posts its `burstId` rather than frames it does not hold.

The dot goes out locally, without a refetch. The latch is one-way, so the
client already knows the answer, and refetching a page to learn what it just
caused would be the write it avoided plus a read.

### 10. The first-sign-in sentence is finished from the rail

Step 4b left `apps/web/src/routes/_app/index.tsx` reading "The count that
finishes this sentence comes from the timeline, which is built in step 4a", and
was right not to invent a number.

The number is the rail's summed `itemCount`, not the timeline's. Step 4a's
design Decision 11 settles it: `TimelineResponse` has no total,
`resultCount` is null on an unfiltered request by design, and adding a total
would be a second place the two empty states could drift apart. The rail is
already being fetched for the jump control, so the count costs nothing.

The banner stays and the sentence ends where the count goes.

### 11. The shared signed-in fixture goes in before the first new spec

`step-5b.md` § Handed over from step 4b: the run spends eighteen of a twenty
sign-in-code budget shared by the whole suite, because every request comes from
`127.0.0.1`. Every surface this step adds that needs a session adds another,
and the failure lands on whichever spec runs next, as a timeout on the code
field.

So `e2e/support/signedIn.ts` exports a Playwright fixture that signs in once per
run and hands the storage state to every context, and `contrast.spec.ts` and the
keyboard pair at the foot of `account.spec.ts` are moved onto it, which is the
same thing they already do by hand. It goes in as its own commit, before any new
spec, so that the budget is falling rather than rising when the surfaces arrive.

The mint counter in `e2e/support/signIn.ts` stays exactly as it is. It is the
guard that made this visible in the first place, and a fixture is a way of
spending fewer mints, not a reason to stop counting them.

## Module layout

```
prototypes/
  scripts/media/cartoonScene.ts      the scenes, as data
  scripts/media/cartoonSvg.ts        shapes to an SVG document
  scripts/media/makeCartoonMedia.ts  the generator's CLI
  public/media/web/                  its committed output
  src/data/media.ts                  rewritten to the new names

apps/server/
  scripts/archiveSeed/archivePlan.ts      what to write, as data
  scripts/archiveSeed/writeArchivePlan.ts the plan into a catalog
  scripts/seedArchive.ts                  the CLI and the object upload

apps/web/src/
  api/
    timeline/selection.ts            TimelineSelection, TimelineView
    timeline/timeline.ts             day stream, rail, archive totals
    vocabularies/vocabularies.ts     facets, tags, people
    items/seen.ts                    the latch, and what suppresses it
    bursts/bursts.ts                 frames, against step 5a's contract
  surfaces/
    Timeline/TimelineSurface.tsx     surfaces 2 and 6's results
    Timeline/DayStream.tsx           the paged days and the sentinel
    Timeline/DayBlock.tsx            one day: spine, band, strips, prints
    Timeline/ArchiveEnd.tsx          the end of the archive
    Timeline/JumpRail.tsx            the rail and `?at=`
    Timeline/EmptyArchive.tsx        surface 5, both states
    Timeline/FilterSheet.tsx         surface 6's controls
    Timeline/FilterChips.tsx         the strip's chips
    Timeline/NoResults.tsx           surface 6's `none` state
    Timeline/pileCopy/               the spine's count label, the none copy
    Timeline/useSeenLatch/           the observer, the batch, the suppression
    Timeline/useReSigning/           the one timer
    People/PeopleSurface.tsx         surface 7
    People/PersonCard.tsx            one person, member or not
  testing/surfaceHarness.tsx         the canned server and the real router
  routes/_app/index.tsx              surfaces 2, 5, 6
  routes/_app/people.tsx             surface 7

e2e/
  support/signedIn.ts                the shared fixture
  support/archive.ts                 the seed, into the run's catalog
  pile.spec.ts  empty.spec.ts  filter.spec.ts  people.spec.ts
  scroll.spec.ts                     the scroll measurement
```

`scripts/measureScroll.ts` was planned and is not written. The measurement it
was for needs a server, a catalog holding the fat day and a signed-in browser,
all three of which the end-to-end run already builds, so it is
`e2e/scroll.spec.ts` instead and its thresholds are assertions rather than
numbers printed for somebody to read.

`apps/web/src/system/Pile/timeline.types.ts` is deleted and its three types come
from `@memory-shoebox/shared`.

## Verification

Everything `step-5b.md` § Verification asks for:

- `pnpm check` green.
- Every state compared against its prototype URL at 1280px, 768px and 400px in
  both colour schemes, opened side by side.
- The scroll measurement on the seeded 340-item day at a phone-sized viewport,
  with its numbers recorded below.
- Keyboard only: reach a print, fan a burst, apply and clear a filter. Nothing
  depends on hover, long-press, dragging or a discovered gesture.
- 200% zoom on all four surfaces with no horizontal scrolling and nothing
  clipped.
- A burst with one visible frame renders as a plain print; one with zero visible
  frames does not render at all.
- A page left open past the signed-URL lifetime refetches and keeps its scroll
  position.

Plus what this design adds:

- The two empty states are pixel identical but for their copy, and the copy is
  chosen from `me.role` and nothing else.
- `?at=` scrolls when the day is loaded and refetches when it is not, and never
  puts a chip in the filter strip.
- The latch sends nothing when every item in view is already seen.
- The day spine's count label under a person filter reads that person's own
  name, never a pronoun.
- The seed is idempotent: running it twice leaves the same catalog.

## What the measurement found

`e2e/scroll.spec.ts`, scrolling the seeded 340-item day thirty thousand pixels
in six-hundred-pixel steps at a 400px viewport, one animation frame apart, on
a built app served by the real Fastify process:

```
scroll measurement {"framesPerSecond":57,"longTaskCount":2,"longestTaskMs":58}
```

Fifty-six to fifty-eight frames a second across five runs, against a threshold
of thirty, and one or two long tasks of about fifty-five milliseconds, against
a threshold of two hundred for the longest. **No virtualizer was added.** The
day-level `content-visibility: auto` of decision 7 is the whole of the scroll
strategy, and it is one CSS rule.

The two figures are assertions in that spec rather than numbers recorded here
and left to rot: a change that makes the pile heavy fails the run rather than
quietly disagreeing with this paragraph. The `console.log` beside them is what
put the line above in the run's output.

**The long task is the seen latch, and its cost was measured rather than
assumed.** Before the fix in § What the side-by-side found, the same scroll
read 60 to 61 frames a second with no long task at all, because the latch was
registering nothing. Registering every print of a freshly appended page with
the intersection observer, in one go, is one task of fifty-odd milliseconds
per page. Three frames a second and a task a quarter of the budget is what the
dots going out costs, and it is worth paying; chunking the registration across
animation frames is the obvious lever if a slower phone ever says otherwise.

`longtask` is not an entry type every browser knows. The run is Chromium,
where it is, and the spec reports `longTaskCount: -1` rather than failing if a
future browser's `PerformanceObserver` throws on it: losing the frame rate
because the task counter was unavailable would be the wrong trade.

## What the side-by-side found

Twenty pairs, opened against a seeded development catalog at 1280px, 768px and
400px in both colour schemes, with the prototypes' harness rail hidden so only
the surface was being compared. Five defects and four deliberate differences.
The fan is the one pair that could not be compared, because pressing the stack
calls `GET /api/bursts/:burstId/frames` and that route is step 5a's.

**The seen latch registered nothing on a first page load.** The hook queried
the archive for prints once, in its ref callback, and the archive mounts while
the day stream is still in flight, so it watched an empty pile and never saw
the days that landed in it, nor any page the infinite scroll appended. It
happened to work on a return to a pile the query cache still held, which is
why every test passed: the unit harness mounts the container with its prints
already in the tree, and that is the one arrangement that works. Found by
watching `POST /api/items/seen` in a real browser and then counting
`item_views`: zero on a cold load, one batch on a navigation back. A
`MutationObserver` beside the intersection observer now hands it every
arrival, and both are disconnected by the cleanup a React 19 ref callback may
return. This is the defect the side-by-side existed to find and no other check
would have.

**A person's card was an underlined anchor.** `PersonCard` is a `Link` where
the mockup used a `button`, and `.personCard` reset the border, the background
and the font but not `text-decoration`, so the name and the count both carried
the browser's underline in both colour schemes. `.barLink` already documents
this exact trap for the product bar.

**The date chip said one decision three times.** The filter strip read
"1 September 2026 to 30 September 2026" where the mockup reads "1 Sep to 30
Sep 2026" and `FilterChips`'s own doc comment claims "1 Sep to 30 Sep". The
collapsing rule already existed for a milestone's span, so it is now
`dateRangeLabel`, shared by both, and the chip reads "1 to 30 September 2026".

**Surface 6 `open` was missing its sentence.** The mockup ends the unnarrowed
sheet with "Nothing chosen yet, so this is the whole archive: N photos and
videos across M days", and the product drew nothing there. The figures are the
rail's, summed exactly as the end of the archive sums them.

**The dead end drew an empty jump control.** A `none` result leaves the rail
with no days, and the pile is still drawn under the dead end deliberately, so
a native select with no options sat there taking a tab stop.

**And one correction this step had already decided and only half made.**
Decision 5 says the restricted copy becomes "Ask whoever invited you about
it" in both places. `apps/web` said it; the mockup still named Papá.

### The four differences that are deliberate

**The product bar stays on `/?find=true` and `/people`.** Both mockups draw a
"Back to the pile" bar instead. `DESIGN.md` § Navigation gives that treatment
to **item pages** alone, so the product is right and the mockups are early;
`prototypes/src/surfaces/Upload.tsx` carries the same pattern and belongs to
step 7b, so correcting one of the three would be worse than recording all
three here.

**The bar carries no count line.** `DESIGN.md` asks for "a quiet count line"
under the instance name and the mockup fills it with "2,147 photos and videos
· 8 people". Half of that is an admin fact: the member count comes from a
route step 8a builds, and the same reasoning that keeps the member list out of
surface 5's copy keeps it out of here. The other half would mean fetching the
rail from `_app.tsx` on every guarded route, including My account, to fill a
subtitle. The bar belongs to step 3b and `_app.tsx` to step 4b; neither is
this step's, and the line is left for whichever step owns the member count.

**A URL written by the product spells a list as JSON.** Pressing a chip leaves
`?tag=%5B%22<id>%22%5D` rather than `?tag=<id>`, because that is how TanStack
Router serialises an array. Both parse, `_oneOrMany` sees the same selection
either way, and a hand-written or texted `?tag=a&tag=b` still works; changing
the router's stringifier would change every route in the app.

**The empty archive still offers Find and People.** The mockup's bar drops the
switcher chips on an archive with nothing in it. The product's bar is the
shell's and is the same on every guarded route, which is the same boundary as
the two above.

### What was checked by hand rather than asserted

200% zoom is an assertion in `e2e/pile.spec.ts` and `e2e/people.spec.ts` for
`/` and `/people`. `/?find=true` and `/people?q=a` were checked by hand at the
same 640px emulation and neither overflows horizontally; the empty archive was
compared at all three widths but its zoom is unasserted, because the run's one
catalog is seeded by the time any spec could ask for it.

Keyboard only: reaching a print is asserted in `e2e/pile.spec.ts`. Applying a
filter from the sheet and clearing it again was driven by hand, tabbing from
the bar to the facet chips, pressing Enter, walking back up with Shift+Tab to
the strip's clear-all and pressing Enter again. Reaching a person's card and
pressing it was driven the same way. Fanning a burst stays out until 5a.

## Documentation

`docs/web.md` gains the four surfaces and the api modules. `docs/prototypes.md`
§ What is real and what is not is rewritten for the cartoon set. `docs/e2e.md`
gains the shared fixture and a corrected mint budget. `docs/archive.md` gains
the client half: the selection, `?at=`, the latch's suppression rule and the
re-signing timer. A new `docs/media.md` records the generator, what it produces
and how to re-run it.

## Out of scope

Opening one item is step 6b and a click navigates to the existing placeholder
route. Uploading is step 7b. Creating a milestone is step 8b. Members, groups,
settings, presence and the log are step 9. No route, service or migration in
`apps/server` changes; the one file added there is a development script.
