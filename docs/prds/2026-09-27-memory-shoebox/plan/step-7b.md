# Step 7b: The upload surface

**Status:** implemented; acceptance pending

**Review:** implementation and keyboard-readiness scoped reviews approved; final automated verification passes; live/manual acceptance pending
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
- Rendering server-owned capture-day groups in the browser, because one upload is routinely
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

## Delivered verification and remaining acceptance

The actual `/upload` suite covers a 264-file distinct mixed batch against the real
API and local S3 stand-in, saved bulk edits, untouched Everyone, refusal, tab-close
recovery without resending landed originals, failure versus refusal, silent settled
retry, unconfirmed completion loss, provider lifetime during router navigation and
sign-in returning to an addressed draft. The responsive matrix covers all sixteen
prototype states plus denied/unavailable/undated at the three specified widths in
Day/Night; real ready previews are checked after ticking and viewport reentry.
Keyboard cases choose/attach an occasion and a restricted group using explicitly
identified client-contract replies, then assert saved payloads before commit.
Reduced motion and active text contrast have browser cases. The 200% layout proof
uses 640x450, the two-dimension CSS viewport equivalent of 1280x900 at 200%, rather
than genuine browser zoom, checking form/action reachability and clipping in both
browser projects. Native date empty/filled text and focused segments have rendered
color measurements in Day/Night.
Command outcomes and remaining checks are retained in
[the routed Upload E2E documentation](../../../e2e.md#the-routed-upload-surface).
Ignored local browser captures and logs remain available for review.

Milestone list/create/patch and full member/group choices are identifiable client
contract tests. Live acceptance of `GET/POST /api/milestones`,
`PATCH /api/milestones/:milestoneId`, `GET /api/members` and `GET /api/groups` awaits
their backend owners. A real-bucket run with at least 200 mixed phone files, an
actual-phone run and an uncoached person uploading an occasion remain unchecked.
Generated E2E media and the older headless proof do not satisfy those checks.

Intentional copy corrections follow the runtime: a closed tab stops transfer but
keeps landed items and edits; route navigation retains the uploader. Resume asks
for missing files, settled recovery promises no second email, and notification
figures describe queuing rather than delivery. Bytes with a lost completion answer
remain Not confirmed up. Optional date correction includes server fallback dates
without moving the ordinary capture-day groups.

## Review fix chronology

The whole-branch review and one fix/re-review wave are complete. The original
milestone target, label-focus and incoming recovery-identity defects are fixed.
The earlier re-review reproduced two remaining retry problems: choosing a different
existing occasion after failed attachment can save the previous occasion, and
a completed label can be applied again after a later label fails in a multi-label
chunked submission. Integration remained unapproved pending their correction.
Three comment-width violations and missing saved-edit component keys were also
recorded as nonblocking follow-up. The normal draft Add more files affordance
remains deliberately deferred. Those earlier passing automated checks did not cover the newly reproduced retry
sequences or satisfy the live/manual acceptance above.

Task 10 subsequently corrected all four residuals and added rendered
form/controller regressions plus identifiable `/upload` retry contract cases.
Changed occasions submit a new action; same-occasion retries keep original targets
and confirmed chunks. Fully completed labels leave pending input even after a
later label fails. Saved-row keys are at the mapped component boundary, and the
three comments are wrapped. The focused owning suite passes 128 tests; both retry
cases passed five times in each browser, including Undo and marker removal.
The repeated browser run also exposed an intermittent failure in the unchanged
Chrome keyboard focus-ring check after Escape. At that checkpoint it remained a
review concern; the run remains recorded as failed, not described as wholly passing. The earlier re-review remains historical evidence; the subsequent scoped reviews
approved the corrections and settled-picker readiness amendment.
The normal draft Add more files affordance and every live/manual acceptance check
above remain pending. See the Task 10 chronology in `docs/e2e.md`.

The subsequent scoped review approved the four production corrections. A bounded
keyboard-test follow-up now awaits initial Close focus and opacity 1 before
Escape, then dialog hidden before checking the restored trigger. Its five
repetitions per browser passed with the original keyboard inputs and visible-ring
assertion. Both separate diagnostic variants had passed, so this readiness
amendment is not a proven root-cause or rapid-Escape product fix. Production focus
and CSS remain unchanged, and the earlier failed verification remains evidence.

The final affected retry/interaction/contract/keyboard/264-file surface run also
passed in Chrome and WebKit (109 passed, one existing dependency skip, exit 0).
The earlier failure's cause and rapid-Escape behavior remain unproven. The scoped follow-up review approved the amendment with no new findings. Fresh
`pnpm check` also passed all 2,727 tests in 382 files. Every live/manual acceptance
check above remains pending, so the step is not marked done. See the readiness chronology in `docs/e2e.md`.
