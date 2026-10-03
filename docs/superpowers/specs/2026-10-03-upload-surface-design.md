# Step 7b: the upload surface

**Status:** proposed, awaiting written-design review.

This is the step design for [step 7b](../../prds/2026-09-27-memory-shoebox/plan/step-7b.md),
covering surface 8 alone. The product requirements remain in
[PRODUCT.md](../../PRODUCT.md) and
[design-spec.md](../../prds/2026-09-27-memory-shoebox/design-spec.md).
The wire contract remains
[upload.md](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/upload.md),
including its Rulings, and
[conventions.md](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md).
Those documents are read-only for this step.

## Intended outcome

A parent can choose everything from an occasion on a phone, see where it will
land by capture day, optionally label a selection, leave visibility on
Everyone, and put the batch up. Ticking photographs chooses the targets of an
edit; it never chooses which photographs are uploaded. Every accepted file in
the manifest goes up, including unticked files.

Closing a tab must preserve the server's edit plan and everything that already
arrived. Reopening asks for the missing files, with the option to pick the
whole folder for convenience. A failed file and a refused file have different
explanations and different available actions. Recovering a file after the
batch settled adds it silently.

## Evidence inspected

- Ran `pnpm skills` and read the repository and personal workspace rules.
- Ran the prototype with `pnpm dev:prototypes` in the `feat/upload-surface`
  worktree. Visited every one of its sixteen upload state URLs.
- Captured every state at 1280px, 768px and 400px in Day and Night, with the
  prototype harness collapsed: 96 reference screenshots under the main
  checkout's ignored `.playwright-mcp/upload-reference-*.png`. No document
  overflow appeared in this reference sweep. These are prototype observations,
  not verification of the as-yet-unbuilt product surface.
- Read the browser engine, worker interface, header reader, upload API helpers,
  shared upload schemas, existing visibility picker, and milestone contract.

The prototype supplies the layout, hierarchy and interaction vocabulary. The
API and implementation settle facts the prototype cannot know. Three copy
corrections follow from that distinction:

1. Uploading can continue while navigating within the open app, but closing
   its tab stops the browser that is sending the bytes. Replace "You can close
   this. They keep going" with "Keep this tab open while they go up. If you
   close it, what arrived and everything you added stay saved."
2. The abandon sweep can settle a batch before the uploader returns. Resume
   copy must distinguish an unfinished batch from one that already settled;
   neither may claim that nobody has been emailed without checking its state.
3. `notifiedAt` and `notifiedMemberCount` record the fan-out into the outbox,
   not successful mail delivery. Say that one batch notification is queued for
   each eligible recipient, rather than asserting an email arrived.

`DESIGN.md` has no section named Motion in this checkout. The applicable motion
rule is [design-spec.md, Motion](../../prds/2026-09-27-memory-shoebox/design-spec.md#accessibility):
reduced motion removes decoration, and information never depends on movement.

## Approach

| Approach                                                                                                  | Consequence                                                                                                                  | Decision     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------ |
| A focused upload controller above the signed-in route outlet, with surface components consuming its state | Reuses the proven engine, survives navigation inside the app, and keeps state transitions testable without React or a bucket | Recommended  |
| Put selection, declaration, editing and transfer directly in one route component                          | Fewer initial files, but navigating away destroys the transfer owner and one component mixes every lifecycle                 | Rejected     |
| Persist media bytes and build a separate offline/background upload subsystem                              | Adds a second persistence and transfer design that the step neither needs nor contracts for                                  | Out of scope |

The controller owns one active batch per signed-in member. The server owns its
manifest, edits, visibility, outcomes and settlement. The browser owns picked
`File` handles, selection, preview URLs, current operations and transfer
measurements. Query entries and component state are representations of those
facts, not independent competing upload plans.

## Route and lifetime

- Replace `routes/_app/upload.tsx`'s placeholder with `UploadSurface` and set
  `hasOwnBar`, using the prototype's Back to the pile bar.
- Add an optional validated `session` search parameter. It identifies the
  batch to reopen, including a settled batch that `/current` no longer returns.
  Session ids remain addresses; every read is authorized by the server.
- Add `UploadSessionProvider` around the signed-in outlet in `_app.tsx`. It
  starts no upload query until the surface is visited and keeps a running
  engine alive while another signed-in surface is open.
- Start engines from explicit controller actions, never from an effect that
  Strict Mode or route remounting could repeat. Serialize batch mutations and
  disable conflicting actions while they run. Freeze draft controls before
  beginning the visibility-save/commit sequence.
- On first arrival without an addressed session, ask `/current`. With no open
  batch, show `select`. With a draft, restore its days and plan. With an
  uploading batch, show `resume` unless this controller is already sending it.
- Retain a member-scoped last-session pointer in local storage to recover the
  same batch after a tab closed and the sweep subsequently settled it. A
  current open batch takes precedence over this pointer. Failure to access
  local storage does not block uploading; the URL still addresses the batch.
- Upload more clears the remembered finished batch and starts from `select`.
  Cancel uses `DELETE` only for a draft. Send what did arrive uses `commit`
  with `intent: "close"` only for an uploading batch.
- Provider teardown aborts local work and releases workers and preview URLs;
  it never silently cancels or closes the server's session. Signing in as
  another member creates a fresh provider and cannot reuse the first member's
  files or recovery pointer.

## Choosing files and grouping days

The drop target opens a native multiple-file input and accepts drag and drop.
It invites everything at once. MIME and size refusal belongs to the server:
include a picked PDF in the declaration so its refusal can be explained,
rather than silently filtering it out. An accept hint may guide the picker,
but it is never validation and never substitutes for declaration.

Open a draft on the first selection, not on every visit to an empty surface.
If opening races another tab and returns `upload_session_conflict`, fetch
`/current` and offer the found batch instead of making another one.

For a fresh batch, call `getManifestEntryFromFile` for each file with bounded
header-read concurrency. It reads small slices and does not hash gigabytes
before the days list appears. Declare in chunks of
`UPLOAD_LIMITS.manifestEntriesPerRequest`. Pair each outcome to its `File`
through `clientRef`, never its filename or array position after filtering.
Merge by `fileId` so repeated outcomes or duplicates cannot enqueue a file
twice. Keep successful declaration chunks when a later chunk fails, show how
many files are saved, and offer continuation without discarding edits.

Build the browser's day groups from the returned `capturedOn` values. The
server executes the capture-date ladder in `shoebox.timezone`; the browser
must not invent a competing timezone rule. Read session detail after
declaration for the complete file rows, undated group and authoritative plan.
Follow the embedded `nextCursor` until every required row is loaded; the
default 100 rows and `pendingFiles` cap must never truncate a 264-file batch.
Merge pages by id, retaining manifest position for stable order.

Tick a print, tick every eligible file on a day, or tick everything in the
batch. Those operations cost no API request and include files past the first
page or visible preview subset. Refused and cancelled rows are explained
separately and excluded from edit targets. The commit button counts accepted
manifest files, independently of the ticked count. An all-refused batch cannot
be armed and remains cancellable.

Show `undated` as a separate explanatory sheet, with a date input for the
affected files. It is optional information, not a compulsory curation step.
An uploader-supplied date amends those manifest rows and refreshes the grouping.
Send a calendar date as `${date}T00:00:00.000Z`; the server preserves the real
clock/offset or substitutes noon for an invented timestamp. Do not convert
local midnight to UTC or recreate that clock-preservation logic in the client.

## Previews and memory

Reuse the existing image derivative helper through the media worker and the
existing video poster helper. A small sequential queue prepares previews for
prints entering the viewport, retaining only thumbnail blobs and object URLs.
Release display derivatives made during preview generation immediately;
the engine prepares its own transfer derivatives when that file's lane starts.
Do not retain hundreds of full-resolution decoded images or all derivative
sets. Recycle HEIC workers at the existing configured limit and on failure.
Pause preview decoding while transfer preparation uses the phone's two lanes.

A file whose browser cannot decode it gets a filename and media-kind fallback
print that is still tickable. It remains an accepted upload. A thumbnail or
poster decoding failure is never described as a refused original. Revoke
preview URLs on release, cancel, replacement and provider teardown, and use
server `media` for already-landed files.

## Bulk actions and their visible results

Use the existing TagsInput pattern, `PeopleField` in `anyone` mode,
`MilestoneDateFields`, `ChipRow`, `Sheet`, `Banner`, `Print` and token-based
styles. Fetch the tag and people vocabularies only when their pickers need
them, preserving the option counts and allowing new labels. Creating a named
person here does not create an account or invitation.

Persist each applied label with `createUploadEdit`, targeting the captured
selection. Existing tags and people use ids; new ones use `labelSnapshot`.
Do not call the post-ingest per-item writers for a draft. A successful answer
adds its actual edit to What you have added; failed submissions keep the modal,
its text and selection intact. When several labels are submitted, retain and
show every successful action if a later one fails. There is no client claim of
an atomic multi-label operation.

For selections larger than `UPLOAD_LIMITS.editTargetsPerRequest`, split a
logical action for an existing subject, a milestone or a new tag into permitted
edit chunks and make partial success visible. A new person is different:
separate `labelSnapshot` edits could each create another person with that name
at ingest. Keep one new-person action within the target cap and explain that
the selection needs at most 1,000 files for that action. Do not silently create
multiple people to work around the limit.
Do not cap the number of files the uploader can choose just to fit this limit.

Print markers track actual successful edits and stay present when the prints
are unticked. The session DTO provides edit counts but not per-file targets.
Keep a member/session-scoped browser hint of targets for edit ids this browser
created, reconciling it against live edit ids and `targetCount` on restore.
It may restore known markers; it never replays an edit. If that hint is absent
on another device, show the full server-owned edit list and omit unknown
per-print counts rather than pretending every print carries every label.

Undo calls `undoUploadEdit` only where `canUndo` is true, updates the edit list
and known markers after success, and refreshes day/mismatch data for milestone
edits. Plan and visibility are read-only after commit, even before the first
file lands.

## Milestones and dates outside their span

The milestone picker calls step 7a's list route and pages it when necessary.
Each option carries the occasion's name, dates and existing item count. Assign
through `createUploadEdit` with `milestoneId`; a day header names the occasions
actually applied to files on that day. It must not imply every file on that
day is attached if only a selection was targeted.

Create inline with `POST /api/milestones`, using the selection's earliest and
latest capture dates to prefill `MilestoneDateFields`. Collapse a one-day form
to equal `startsOn` and `endsOn`. The files are manifest rows, so do not pass
their ids as `itemIds`. After creation succeeds, record the milestone edit.
If attachment fails, retain the created milestone and offer retry of the
attachment, not another creation. A cancelled draft leaves the created
occasion, as the contract explicitly intends.

Refresh detail after assignment and show every `mismatches` group. Preserve the
prototype's default of moving photographs onto the occasion:

- For a one-day occasion, amend each stray manifest file to that day.
- For a span, require an explicit chosen day for each stray file. A placeholder
  cannot silently choose the first day for the uploader.
- Widen the occasion uses `PATCH /api/milestones/:milestoneId`, extending its
  span to the earliest and latest relevant date, and touches no file row.
- Leave them as they are dismisses this browser's prompt, retaining the real
  attachment and original capture days. It does not fake an acknowledgment
  write that the pre-ingest API does not offer. It may be offered again after
  reopening the draft.

The existing `MilestoneFix` is a prototype-style renderer with `onDone`, no
write payload, and required landed media. Add a focused upload reconciliation
component using its styles and interaction, rather than changing unrelated
surface 14 behavior or casting manifest files to items.

## Visibility

Everyone is pre-filled and requires no request or extra confirmation when it
already matches the saved rule. A changed valid choice is saved with
`setUploadVisibility` before arming the batch. Await success so file 1 and file
264 ingest under the same rule. Neither Only nor Except with an empty subject
list may be sent; keep the input editable and explain that a person or group
must be named, or Everyone chosen.

Reuse `VisibilityControl`, the existing members/groups clients and the existing
picker source normalization. Preserve the current viewer and the subjects of
the saved rule when a directory request fails. State when the rest of the
directory could not load; never imply it is an empty Shoebox. Keep the admin
sentence visible. Never silently turn a requested restriction into Everyone.

## Sending, progress and settlement

Arm with `commitUploadSession({ intent: "arm" })`, then pass only distinct
accepted pending file ids and their `File` handles to `createUploadEngine`.
The engine calls the tested derivative helpers, hashes, presigns, handles
multipart, retries, waits for connectivity and completes. This step adds its
presentation and coordination, not another transport implementation.

Subscribe to file-started/progress/done/failed/skipped, settled and batch-closed.
Wrap the existing complete API call passed to the engine to record every
successful completion response, including failed completions, whose engine
`file-failed` event does not itself carry aggregate progress. Delegate to the
same helper and return the same response to the engine.

The large figure and batch bar use confirmed `progress.doneCount` and
`progress.doneBytes`. Per-file percentages use browser transfer measurements
including that file's derivatives; their denominator is not the batch's
original-only `totalBytes`. Preparing, Sending, Up, Did not arrive and Refused
are words, not colour alone. Coalesce high-frequency progress rendering; do
not write its events to the server or announce every byte to a screen reader.

Two completion responses can arrive in a different order from their server
transactions. Within one run, choose the snapshot with the greatest terminal
file count and keep confirmed bytes/counts from regressing. Reset this
comparison baseline after explicit retry transitions, retain per-file terminal
answers, and never undo knowledge of settlement with a delayed response.
Ignore stale reads/events from an earlier controller operation.

Do not GET after each completion and do not poll to animate the bar. Use
`progress`, `sessionState` and `didSettle`; refresh once when the engine's
`start()` promise ends to obtain the summary, final row states and missing
list. The engine's event named `settled` can carry `uploading`; only the actual
server state/latch proves batch settlement. A settled batch being retried
also remains `settled` throughout that run, so wait for the active run to end
before displaying its finished result.

If the network prevents even a failed completion from reaching the API, show
that sending stopped and the affected files are not confirmed up. Preserve
the local failure explanation beside the server's still-pending state. Never
claim the batch settled or that notification was queued without evidence.
Offer Resume or Send what did arrive when the server becomes reachable again.

## Partial failure and recovery

`partial` prints how many arrived and lists the whole missing set, loading
filtered detail pages for `failed` and `refused`, plus any still-unconfirmed
pending rows. It does not repeat hundreds of successful rows to find two
casualties. Include cancelled-by-uploader rows in a closed-batch outcome,
without offering them as retryable failed files. Duplicate-cancelled rows are
reported as duplicate picks, not lost photographs.

Refusal explains unsupported type, empty file or oversized file and offers no
Retry. Storage outage, storage rejection, connection loss, abandonment and
checksum/content mismatch get distinct plain-language copy from their stable
codes. Do not expose `problemDetail` as the primary explanation. A failed row
is retried through `retryUploadFile` before its new engine run.

An uploading batch resumes by hashing re-picked files with the existing worker
hash helper, with bounded memory and visible checking progress. Re-declare
with hashes and send only matched missing rows; `already_done` and `refused`
are skipped. Detect unmatched extra files against the complete known manifest
before declaration, so picking a larger folder does not poison a valid resume
request with forbidden new files. Extra files can be uploaded in a new batch
after this one ends. Persisted labels and visibility are not replayed.

A settled batch cannot accept `PATCH /manifest`. Fetch its complete file list,
match picked files against its recorded content hashes, skip every already-up
file, and retry only matching failed rows by their existing file ids. Where a
failed row has no hash because it failed before hashing, name/size/type can
identify a candidate only if it is unique; show that association explicitly
and require the uploader to choose the file if there is ambiguity. Never match
two equally named candidates silently or send unrelated picked files.

After every retry, consume `isIncludedInEmail`. False means "This photograph
will appear on its day without another email." It also remains outside any
previously detected burst. If the sweep settles the batch between checking it
and retrying, use the retry answer, not earlier optimistic copy. After
`upload_session_conflict` during resume, reload the addressed session and
switch to this settled-batch recovery path when appropriate.

## Dependencies that constrain live verification

| Dependency in this checkout                                                                                   | Implementation within step 7b                                                                                                                                                               | Remaining live verification                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Step 6a upload routes and engine are present                                                                  | Call the existing clients and engine                                                                                                                                                        | Exercise surface 8 with the real bucket                                         |
| Step 7a milestone list/create/patch routes are absent, and shared milestone response schemas have not arrived | Add narrow local response schemas and clients from `apis/milestones.md`, reuse `MilestoneRef`, and test realistic contract fixtures; replace local schemas when 7a supplies its shared ones | Inline create/assign and widening require step 7a's routes                      |
| Member and group directory routes are absent                                                                  | Reuse the existing clients and viewer/saved-subject fallback; contract-test full directory choices and report unavailable options honestly                                                  | Choosing other members/groups from live directories requires their backend step |
| Session detail omits edit targets                                                                             | Preserve server edit summaries and reconcile optional local marker hints by edit id                                                                                                         | No new server interface required for edit-plan recovery                         |

These dependencies do not authorize changes to `apps/server` or implementation
of later steps. Tests using contract fixtures prove client behavior, not that
an absent route works. Record the distinction in the verification report.

## Components and scope of files

The detailed implementation plan will assign exact files under these paths:

- `apps/web/src/surfaces/Upload/`: the surface, day groups, pickers, reconciliation,
  sending, partial/resume/done, copy and their tests.
- `apps/web/src/upload/uploadSessionController/`: coordination, event reduction,
  declaration, resume matching and the provider, with injected APIs/engine for
  behavioral tests.
- `apps/web/src/upload/uploadPreviewHelpers/`: the bounded preview queue using
  existing helpers, object URL ownership and its tests.
- `apps/web/src/api/milestones/`: the three consumed milestone routes and
  temporary response schemas, with contract tests.
- `apps/web/src/api/uploadsHelpers/`: query/paging adapters only as needed,
  keeping existing route helpers and transfer semantics intact.
- `apps/web/src/routes/_app/upload.tsx` and `_app.tsx`: route and provider wiring.
- `apps/web/src/system/` only if a narrowly required prop or upload layout rule
  cannot live in the surface; no unrelated component refactor.
- `e2e/upload-surface/` and narrowly required E2E configuration/support: actual
  user flow tests, separate from the existing headless-engine proof.
- `docs/web.md`, `docs/e2e.md`, step 7b's status, the plan README and the step's
  design/implementation plan: documentation updated with the delivered behavior.

No server changes, new tables, new upload routes, video transcoding, milestone
surface, or unrelated cleanup. Nothing in the product imports `prototypes/`.

## Accessibility and verification

Implement meaningful tests red/green, using the existing testing patterns and
fakes. In particular, prove:

- At least 264 files spanning days, paginated reads, whole-day and whole-batch
  selection, and commit independent of the selection.
- Existing/new tags and people, successful after states, retained input after
  failure, Undo, and chunked bulk action partial success.
- Inline milestone creation followed by attachment, retry without duplicate
  creation, one-day/span corrections, widening and leaving mismatches.
- Everyone makes no redundant visibility write; invalid restricted choices
  cannot commit; successful restrictions save before commit.
- Hundreds of complete answers update progress without a GET per file,
  including failed completions and deliberately reordered responses.
- Refused originals never reach the engine; undecodable accepted files do.
  Preview failures and release cannot fail or cancel the server batch.
- Mid-transfer route navigation keeps the engine alive; tab close/reopen
  restores the plan, reads all missing files and sends no landed file twice.
- Partial results after a dropped network stay accurate even when their failed
  completion could not reach the server.
- Recovery after settlement, including a sweep race, obeys
  `isIncludedInEmail: false` and promises no second email.
- Two equal filenames with different bytes and ambiguous hashless matches.
  Extra re-picked files cannot be silently added to a committed batch.
- Viewer access exposes no upload actions, and an expired session can sign
  back in to the addressed batch without discarding its server plan.

Browser tests cover the complete keyboard path, focus restored from bulk
modals, visible status announcements, honest loading/error states, and the
prototype comparison matrix at 1280px, 768px and 400px in both colour schemes.
Use real inputs/buttons, intrinsic image proportions, CSS Modules and existing
tokens; reserve the accent for its established meaning. Selection controls
wrap on narrow viewports without obscuring their targets. Check at 200% zoom
for overflow and clipped controls, and honor reduced motion without losing
progress information.

Run `pnpm check` and the new E2E cases. Keep milestone/directory contract tests
explicitly separate from live route verification until those dependencies
exist. Then exercise at least 200 mixed phone files through the actual surface
against a real bucket, close and reopen during transfer, and verify recovery
and notification behavior. An actual phone test and an uncoached upload by
someone who did not build the surface are manual acceptance checks; a resized
desktop browser or generated fixtures do not establish either one. Report
any manual or dependency-bound checks still outstanding instead of marking
the full step done prematurely.
