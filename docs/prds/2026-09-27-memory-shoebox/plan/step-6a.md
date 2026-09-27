# Step 6a: Upload

**Status:** not started
**Parallel with:** 6b
**Depends on:** steps 1, 2, 3a and 5a

## What this step delivers

The upload session end to end: the manifest and its hash negotiation,
presigning, single and multipart transfer straight to Backblaze, completion,
retry, cancellation, the resume path, burst detection, ingest into `items`, and
the settle latch that sends exactly one email when the last file lands.

**Read the risk note before planning anything else.**

**Done when:** a batch of a few hundred mixed photos and videos can be declared,
transferred, completed and settled; the items appear on the right days with
their bursts grouped; exactly one email goes to each member who can see at
least one of them; and a closed tab can resume the same batch with its edit
plan intact.

## The risk in this step, and what to do about it first

**The browser produces the image derivatives.** Not a preference: the
architecture forbids media bytes passing through the server, which rules out a
server-side worker pulling originals back from Backblaze
(`docs/architecture.md` § Where data lives). So the browser makes `display`,
`thumb` and a video's `poster` and uploads each alongside the original.
`video_webm` and `video_mp4` are **not** produced in v1; the player plays the
original, which from a phone is already H.264 in an MP4 container.

This is the plan's largest unproven assumption. **Spike it before building
anything else in this step**: take a 200-file batch of real phone photographs,
including some HEIC, on a mid-range phone, and measure how long the browser
takes to decode and resize them and what it does to memory. If that is not
viable, the fix is an architecture change and it needs to surface now, not in
step 7b when the surface is being built on top of it.

The contract already absorbs either answer without a route change: `presign`
takes a `purpose` and `complete` takes a `renditions` list. What the answer
decides is whether a file may report `done` before its thumbnail exists. Under
the browser answer it may not, so `UploadFileDto.media` is never null on a
`done` file.

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
   before asking anything. `upload.md` ends with a `## Rulings` section that
   answers ten questions this step would otherwise raise, the derivative
   question among them. Ask the user only what the documents genuinely do not
   settle, and report the spike's result whichever way it goes.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-upload-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                                               | What you need from it                                                                                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/upload.md`                        | **The whole file**, including its `## Rulings`. Twelve routes, the hash negotiation, the state machine and the settle latch               |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`                        | § `upload_sessions`, § `upload_files`, § Capture dates and the five-rung ladder, § `bursts`, § Exactly one email when the last file lands |
| `docs/architecture.md`                                                                 | § Where data lives. The constraint that decides the derivative question                                                                   |
| `app.config.ts`                                                                        | `appConfig.burst` (10 seconds, three frames) and `appConfig.upload.draftExpiryHours` (one week), both with their reasoning                |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                                   | Surface 8's states and the "Putting a batch up" flow, including `partial` and `resume`                                                    |
| `prototypes/` surface `upload`                                                         | Every state. `done`, `partial` and `resume` are the three this step must make true                                                        |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md`                 | § 3 `upload_session`, both variants. This step owns that copy and enqueues it                                                             |
| `prototypes/` surface `emails`, states `upload`, `upload-narrowed`, `upload-multi-day` | The three shapes that one email takes                                                                                                     |
| `docs/PRODUCT.md`                                                                      | § Positioning: nobody curates, and that is the point                                                                                      |

## Scope

**In:**

- Every route in `upload.md`, with `PATCH .../manifest` reconciling rather than
  replacing: a request naming four of 264 files leaves the other 260 alone
- The hash negotiation, and idempotent retry keyed on
  `(upload_session_id, content_hash)`
- Presigning single and multipart PUTs, and `503 upload_storage_unavailable`
  when Backblaze is down while the database is fine
- The five-rung capture-date ladder, resolving an offset-less date in
  `shoebox.timezone` and never in the browser's zone, with
  `capture_offset_minutes` left null so the guess stays distinguishable
- Burst detection at ingest: frames no more than `appConfig.burst.maxGapSeconds`
  apart, at least `appConfig.burst.minimumFrameCount` of them, within one
  upload, writing `threshold_seconds` and `detector_version` on the row
- Ingest into `items` and `item_renditions`, copying `upload_files`'
  `original_captured_at` so "revert to what the file said" survives a
  pre-ingest amendment
- The settle latch, run after **every** terminal file transition and once at
  commit, sending exactly one `upload_session` email per recipient with that
  recipient's own visible count
- `upload-abandon-sweep` given its real body, both halves: abandoned files, and
  pre-commit drafts idle past `appConfig.upload.draftExpiryHours`
- The browser-side derivative contract as a documented, tested client helper in
  `apps/web`, ready for step 7b to call. A missing derivative is not a failure:
  `MediaRef` resolves that purpose to `original` at read time

**Out, and owned by a later step:**

- Surface 8 itself (step 7b). This step delivers the routes and the client
  helper, not the screen
- Tagging and visibility on a _single_ item, which is step 5a's and finished.
  Bulk actions during upload are this step's
- Milestone creation from within the upload flow (step 7a owns milestones; this
  step calls them)

## Interfaces this step produces

- `@memory-shoebox/shared`: every upload-slice schema, including
  `UploadSessionDetail`, `UploadFileDto` and `UploadedRendition`
- The browser derivative helper in `apps/web`
- Items in the database, which is what steps 4a and 5a read

## Interfaces this step consumes

From step 2: the B2 client, the mail queue, the job runner.
From step 3a: the request context and the visibility predicate.
From step 5a: `POST /api/visibility-rules/resolve` and the tag and people
writers, which the bulk actions call rather than reimplement.

## Do not ask the user about

| Topic                                 | Owned by |
| ------------------------------------- | -------- |
| The upload surface itself             | step 7b  |
| Milestone creation and reconciliation | step 7a  |
| Removal requests                      | step 7a  |
| Members, groups, settings             | step 8a  |
| Presence, the change log              | step 8a  |

## Verification

- The spike result, written down, before anything else
- `pnpm check` green
- A 200-file batch end to end against a real bucket, including at least one
  video and one file type that is refused
- A test that a batch spanning three weeks produces **one** email per recipient,
  not one per day, and that each recipient's count is their own
- A test that the uploader gets no email about their own upload
- A test that the settle latch fires exactly once under every terminal
  transition order, including a retry after settling, which must send nothing
- A test that a run of 45 frames four seconds apart becomes one burst, and that
  a run of two frames six seconds apart becomes two plain prints
- A test that killing the tab mid-transfer and reopening finds the batch with
  its edit plan intact and asks only for what is missing
- A test that `upload-abandon-sweep` cancels a draft older than a week and
  leaves a six-day-old one alone
