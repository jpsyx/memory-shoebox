# Memory Shoebox implementation plan

Memory Shoebox is a self-hosted private photo and video archive for one
family. The design work is finished and none of it is built: there is no
schema, no API and no web app, only a complete specification of all three.
Eighteen surfaces are drawn in every state, about thirty tables are specified
with their keys and cascades, and seventy-eight routes are written with their
types, their errors and their reasoning. This plan turns those into fifteen
steps.

## The documents behind this plan

| Document                                                       | What it is                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/PRODUCT.md`](../../../PRODUCT.md)                       | The **product requirements**: the problem, who it is for, § How it works, which holds every settled functional rule, and the standing non-goals |
| [`../PRD.md`](../PRD.md)                                       | A three-line pointer to the file above. This is a whole-product run, so the PRD's content is the repository's own product record                |
| [`../design-spec.md`](../design-spec.md)                       | Every surface, every state, five user flows, interactive states, three breakpoints, and accessibility as measured                               |
| [`../tech-specs/data-models.md`](../tech-specs/data-models.md) | The schema: tables, keys, cascades, indexes, what is deliberately not stored, and seventeen recorded decisions with their reasoning             |
| [`../tech-specs/apis/`](../tech-specs/apis/)                   | Every route and its types, one file per slice, with `conventions.md` binding all of them and `README.md` as the master route table              |
| [`../../../../DESIGN.md`](../../../../DESIGN.md)               | The visual system: colours, typography, layout, shapes, motion. Cited by the design spec, never restated in it                                  |
| [`prototypes/`](../../../../prototypes)                        | A running Mantine app with every surface in every state. `pnpm dev:prototypes`, then `/s/<surfaceId>?state=<stateId>`                           |
| [`app.config.ts`](../../../../app.config.ts)                   | Product tuning knobs that are not per deployment, with the reasoning beside each number                                                         |

**Read [`../tech-specs/apis/conventions.md`](../tech-specs/apis/conventions.md)
before writing any route.** The things most easily got wrong are settled there
rather than per route: 404 never 403 for anything the viewer may not see, every
count filtered per viewer, the frozen DTOs, who "uploader" means, the three
documented exceptions, the string length caps, the seven background jobs, and
the auth middleware's contract.

Each slice file ends with a **`## Rulings`** section. Those are answers, not
questions. If you find yourself about to ask the user something, read that
section first: forty-nine of the questions this build raises are answered
there, with the reasoning, including several where the first answer was wrong
and the document says why.

## How to execute this plan

**One step per session.** Each step is a complete
brainstorm to design to plan to implement cycle and ends at a reviewable
milestone. Do not run several in one session: the point of the split is that
each gets a fresh context and its own review.

In a new session:

> Use superpowers to execute step \<N> in
> `docs/prds/2026-09-27-memory-shoebox/plan/step-<N>.md`

The agent should then:

1. Read that step file and the documents it names
2. Run `superpowers:brainstorming`, **scoped to that step only**, asking the
   user only what those documents do not answer
3. Write a **step design** under `docs/superpowers/specs/`, which is a
   different document from the `PRD.md` and `design-spec.md` it reads
4. Run `superpowers:writing-plans` for the detailed implementation plan
5. Implement with `superpowers:subagent-driven-development`

**Steps are not detailed implementation plans.** They are scoped milestones.
The detailed plan is written in the session that implements them, by an agent
that has just read the relevant spec sections.

**Every step follows the repository's own rules**, which the executing agent
must read: [`AGENTS.md`](../../../../AGENTS.md) for the stack, the scope rule,
red/green TDD and the build commands, and [`docs/rules/`](../../../rules) for
TypeScript, SQL, styling and routing. `pnpm check` must be green before a step
is called done.

## Where this is up to

Steps 1 through 5 are done, and so are **6a and 6b**. Step 6a built the upload
session end to end and passed its real-bucket proof; 6b built surfaces 3 and 4
against the eighteen item routes 5a delivered. Step 7b is implemented with acceptance deferred to the final acceptance stage after every build step. Its four residual corrections and keyboard-readiness follow-up have scoped review approval and passing final automated verification. Real-bucket, physical-device/uncoached and live API acceptance remain unchecked. Step 7a remains separate.

Signing in lands on the archive rather than a placeholder, and a print in it
opens. Nine of the eighteen surfaces are built: somebody can open a photograph
or a video, move along its burst, react, comment and pin a comment to a moment
of a video. An uploader can tag it, name who is in it and describe it, and its
own uploader or an admin can change who sees it, put its date right or delete
it. The pile scrolls a seeded 427-item catalog at sixty-one frames a second
with no virtualizer, and forty-five of the contract's 78 routes exist; 6b added
none. The product now calls the upload routes through surface 8. A first morning still
shows surface 5 until an uploader puts up the first occasion. Step 7b browser
cases exercise actual upload/recovery, while milestone and full directory paths
remain contract-only. Real-bucket phone media, an actual phone and an uncoached
uploader remain required final acceptance; see [step 7b](step-7b.md). They do not block
remaining implementation steps.

**Step 5b's parked burst test is on.** 6b turned it on when it wired the pile
into the viewer and made the fan parse what 5a's frames route really returns.

**Step 6b left three things for later steps:**

- **Once 8a has merged, one parked end-to-end case.** The visibility picker
  offering the Shoebox's members and groups is `fixme` in
  `e2e/item/item.uploader.spec.ts`. `apps/web/src/api/members/` and
  `api/groups/` are written against `administration.md` with schemas local to
  `apps/web`. 8a's administration slice is server-only; its first-run setup is the explicit
  frontend addition. The next frontend step that touches the
  picker after it merges checks those schemas against 8a's real routes and
  turns the case on.
- **For 8b, the removal ask's destination.** "Ask for this to come down" is
  drawn when `canRequestRemoval` says so and already links to
  `/items/$itemId/removal`, which renders a placeholder until 8b builds
  surface 10 there.
- **For step 9, the "Who has opened it" panel.** `canSeeViewers` is in every
  `ItemDetail` and nothing reads it. `GET /api/items/:itemId/viewers` is step
  8a's route, and surface 17, where the panel belongs, is step 9's.

**One check is left for a person rather than a step: a pass with a real screen
reader.** Surfaces 3 and 4 are checked through jsdom's accessibility tree and
driven by keyboard alone in Playwright, focus included, but nobody has yet
listened to them with VoiceOver or NVDA (the step design's Verification said
it would be reported as not done, and it is not).

**Surfaces 3 and 4 differ from the prototypes on purpose**, so a side-by-side
comparison will show these
([the step design](../../../superpowers/specs/2026-10-02-item-viewer-design.md)):
copy the payload cannot back is rewritten (decision 11: "Everyone who can see
this one can read it" rather than "Goes to all eight"); people and tag chips
are links into the filtered pile rather than buttons; the burst strip has a
visible caption, "45 frames over 28 seconds", which also names it; a pinned
comment's stamp carries the hidden text "Play the video from here" for a
screen reader; and the capture date's time is Mantine's `TimeInput` rather
than the prototype's text box, themed like every other input, since unthemed
it drew a dimmed description that failed AA in Night.

Verification found more of the same, also on purpose. The copy follows the
item's kind ("Who can see this photograph", "A tag on a person says who is
in the video"), the delete dialog counts in digits ("the 3 comments"), and
the description note says "nobody is going to describe a whole upload by
hand" rather than quoting a fixture's count. A video offers "Download the
original" too (decision 4: always drawn). Buttons stand at the theme's 48px,
the strip centres the open frame, and the time field shows the native
control's own 12-hour format. The verification fixes also mend defects the
prototypes share: the comment editor spans the comment, the pin button's
label wraps at 400px rather than clipping, every dialog's close button is
named "Close" and inked for the sheet, and the reaction summary is named
"3 reactions. See who left them" rather than "3".

**Step 5b left two tools behind**: a generated cartoon media set
(`pnpm --filter @memory-shoebox/prototypes media`, `docs/media.md`), which
replaced real family photographs that no clone and no CI run ever had, and a
development archive seed (`pnpm seed:archive`, `docs/configuration.md`
§ Something to look at), which is what any later frontend step should reach for
when it needs an archive to look at. Both are described in `step-5b.md`.

**Step 5a left two named seams for step 7a** rather than guessing early:
`closeOpenRemovalRequests` in the delete transaction, which closes the requests
a delete answers and returns them so a `removal_resolved` enqueue drops in
without reshaping that transaction, and `canRequestRemoval` on
`ItemCapabilities`, which is computed from the removals slice's own tag gate
and exposes nothing else. See [`docs/server.md`](../../../server.md) § The item
slice.

**Step 6a left the upload engine for step 7b**: `apps/web/src/upload/` and
`apps/web/src/api/uploadsHelpers/` are everything surface 8 needs, and
`upload-proof.html` with `pnpm upload:proof` is the harness they were proven
with. It also left step 6b a risk to handle on the player: phone video is
HEVC, which Firefox and older Android may not play. Both are described in
`step-6a.md`.

Each step file carries its own `**Status:**` line and that is the record. The
table below repeats it, so this is the one file to open first.

### Work that is not a numbered step

One piece of this product was built outside the plan, because step 3a could not
be finished without it. **The email delivery stack** is merged: `packages/emails`
holds the templates, `EmailService` delivers them, and in local development a
message is rendered to a PDF in `~/Downloads` instead of being sent, which is
how the sign-in flow was verified without a mailbox. See `docs/emails.md` and
`docs/mail.md`.

**It left one thing unfinished, and step 4b finished it.** The end-to-end
harness now exists: `playwright.config.ts`, an `e2e/` directory with
twenty-five tests over surfaces 1 and 9 (`signIn.spec.ts`, `account.spec.ts`
and `contrast.spec.ts`), and `@playwright/test` as a dependency. It runs
one Fastify process serving both the API and the built app, which is the
production topology. `pnpm exec playwright install chromium`, then
`pnpm test:e2e`. It is not part of `pnpm check`.

The open question was how a test gets a sign-in code, given that
`makeScrubPatchFromKind` wipes `payload_json` and the subject for
`sign_in_code` when the row reaches `sent`. The answer was none of the three
options listed here: the run leaves mail **unconfigured**, so the worker defers
every message back to `queued` without scrubbing it and the digits stay
readable in the row the product itself wrote. See `docs/e2e.md`.

## The steps

| Step                                   | Delivers                                                                                          | Parallel with | Status                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------- |
| [1](step-1.md) Schema and contract     | Every table, every migration, the frozen DTOs and `SETTING_DEFINITIONS` in `packages/shared`      | nothing       | done                                                  |
| [2](step-2.md) The server spine        | Middleware, the error envelope, rate limits, the job runner, the B2 client, the mail queue        | nothing       | done                                                  |
| [3a](step-3a.md) Identity and access   | Sign in, sessions, devices, the auth middleware, **the visibility predicate**                     | 3b            | done                                                  |
| [3b](step-3b.md) The shell             | The theme and design system lifted out of `prototypes/`, the router, `apiFetch`, the chrome       | 3a            | done                                                  |
| [4a](step-4a.md) The archive read path | `GET /api/timeline` and the rest of the read slice, including the seen latch                      | 4b            | done                                                  |
| [4b](step-4b.md) Sign in and account   | Surfaces 1 and 9, live against step 3a                                                            | 4a            | done                                                  |
| [5a](step-5a.md) One item              | Comments, reactions, tags, people, visibility, the capture date, deletion, burst frames           | 5b            | done                                                  |
| [5b](step-5b.md) The pile              | Surfaces 2, 5, 6 and 7, live against step 4a                                                      | 5a            | done                                                  |
| [6a](step-6a.md) Upload                | The upload session end to end, from manifest to settled, and the derivative contract              | 6b            | done                                                  |
| [6b](step-6b.md) One photo, one video  | Surfaces 3 and 4, live against step 5a                                                            | 6a            | done                                                  |
| [7a](step-7a.md) Milestones, removals  | Both slices, and the five removal emails                                                          | 7b            |                                                       |
| [7b](step-7b.md) The upload surface    | Surface 8, live against step 6a. **The product's promise lives here**                             | 7a            | implemented; final acceptance deferred                |
| [8a](step-8a.md) Administration        | First-run setup, members, invitations, groups, settings, presence, the change log and mail health | 8b            | implemented; Auto reviewed; final acceptance deferred |
| [8b](step-8b.md) Asking and occasions  | Surfaces 10, 14 and 15, live against step 7a                                                      | 8a            |                                                       |
| [9](step-9.md) The admin area          | Surfaces 11, 12, 13, 17 and 18, and **`prototypes/` is deleted**                                  | nothing       |                                                       |

## Final acceptance

Run this stage after steps 8a, 8b and 9 have finished and every build step is
implemented. Step 7b's deferred acceptance belongs here, rather than blocking
further implementation. This stage does not mark an unchecked requirement as
passed and does not waive each step's automated verification.

- Run step 7b's real-bucket proof with at least 200 mixed phone files, its
  actual-phone run and an uncoached person uploading an occasion.
- Verify upload's occasion and member/group controls against their implemented
  APIs, replacing the identifiable client-contract acceptance dependencies.
- Run first-time setup against a fresh catalog, including both inviting and
  skipping invitations, then upload from the resulting home page.
- Perform the remaining manual accessibility acceptance recorded by the steps.
- Record evidence against the original step checklists and resolve failures
  before calling the product accepted.

## Parallelism

Numbered steps are sequential. **Letters mean parallel**: 3a and 3b can be run
at the same time, in separate sessions, on separate branches.

Every pair is one backend step and one frontend step, and they do not collide
for two reasons. They touch different packages: `apps/server` and
`packages/shared` on one side, `apps/web` on the other. And the frontend step
in each pair builds against routes the **previous** backend step delivered, so
it is never waiting on its own partner. That stagger is what makes each
frontend step demonstrable end to end rather than against a mock. First-run
setup is the explicit exception in 8a: it also touches `apps/web` and `e2e/`.
If 8a and 8b run concurrently, assign their route registration, generated
route-tree changes and browser harness changes deliberately rather than
assuming package isolation.

| Pair   | Why they do not collide                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| 3a, 3b | 3a is `apps/server` only; 3b is `apps/web` only and needs nothing from 3a but the frozen DTOs step 1 delivered |
| 4a, 4b | 4b runs against 3a's routes, which are finished before this pair starts                                        |
| 5a, 5b | 5b runs against 4a's timeline                                                                                  |
| 6a, 6b | 6b runs against 5a's item routes                                                                               |
| 7a, 7b | 7b runs against 6a's upload routes                                                                             |
| 8a, 8b | 8b runs against 7a's milestone and removal routes                                                              |

## Worktrees

Run each step in its own worktree, per `superpowers:using-git-worktrees`. For
parallel steps this is required rather than advisable.

## What to watch

**The riskiest decision in the plan is in step 6a.** The browser produces the
image derivatives, because `docs/architecture.md` forbids media bytes passing
through the server and that rules out a server-side worker. It is the right
answer to the constraint and it is unproven: if browser-side resizing turns out
to be too slow on a phone with a 210-file batch, the alternative is an
architecture change, not a code change. Step 6a says to prove it with a spike
before building anything else in that step.

**Steps 3a and 5a carry the permissions work** and neither is folded into a
feature step. 3a owns the visibility predicate, `visibilityGeneration` and its
cache invalidation. 5a owns who may change an item, which the contract splits
by consequence rather than by role. A mistake in either is invisible in the
interface and shows up as somebody seeing a photograph they should not.

**Step 9 deletes `prototypes/`.** Nothing in `apps/` may import from it at any
point (`AGENTS.md`), so lifting the theme and the components across in step 3b
means copying them, then deleting the original once every surface is built.
Until step 9 the prototypes are the reference for every state, so do not delete
them early.
