# Step 6a: upload

The upload session end to end: opening a batch, the manifest and its hash
negotiation, the capture-date ladder, presigning single and multipart PUTs
straight to Backblaze, completion and ingest, retry, cancellation, resume,
burst detection, the settle latch that sends exactly one email per recipient,
and `upload-abandon-sweep` with its real body. On the browser side, a headless
upload engine that step 7b draws surface 8 on top of.

This is the step design for
[`plan/step-6a.md`](../../prds/2026-09-27-memory-shoebox/plan/step-6a.md). The
route contract is
[`tech-specs/apis/upload.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/upload.md),
binding, with
[`conventions.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md)
above it, and the email is
[`notifications.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md)
§ 3. Nothing here restates those documents. What it records is the spike the
step file demands before anything else, the decisions the contract leaves open
or gets wrong, and the shape the code takes.

## The spike, before anything else

The step file names browser-side derivatives as the plan's largest unproven
assumption, and asks for it to be measured before any building. It was, with
200 real camera-roll files from 2024: 105 HEIC (iPhone 11, 13 Pro and 16 Pro,
up to 24 MP), 55 JPEG (including 36 MP and 30 MB from a full-frame camera, a
Pixel 8 Pro, and five with no EXIF), 8 PNG screenshots, and 32 videos (29
HEVC, 3 H.264, 23 rotated, one 4K, one 533 MB), with five burst runs among the
photographs. The files are a private family set held locally and never
committed. The harness was throwaway and lives outside the repository.

It ran in real Chrome 154 and in Playwright's WebKit 26.6 on an Apple M4 Max.
Each configuration processed the whole batch: hash, decode, a 2048 px `display`
and a 480 px `thumb` for each photograph, and a `poster` and `thumb` for each
video.

| Configuration                                      | Files done | Wall time | Per photo, median | Peak memory over baseline |
| -------------------------------------------------- | ---------- | --------- | ----------------- | ------------------------- |
| WebKit, two at a time, full decode                 | 200 of 200 | 17.2 s    | 166 ms            | 2.5 GB                    |
| WebKit, two at a time, resize on decode            | 200 of 200 | 14.4 s    | 125 ms            | 2.3 GB                    |
| WebKit, two at a time, resize, streaming hash      | 200 of 200 | 21.4 s    | 125 ms            | 1.0 GB                    |
| WebKit, one at a time, resize, streaming hash      | 200 of 200 | 39.8 s    | 114 ms            | 0.8 GB                    |
| Chrome, two at a time, no HEIC decoder             | 95 of 200  | 3.9 s     | 48 ms             | 2.4 GB                    |
| Chrome, two at a time, WASM HEIC decoder           | 200 of 200 | 25.9 s    | 383 ms            | 3.0 GB                    |
| Chrome, two at a time, WASM HEIC, efficiency cores | 200 of 200 | 114.9 s   | 1.7 s             | 2.5 GB                    |

**The verdict: viable.** The architecture stands and no route changes. Every
photograph came out at the right size and upright, all 116 that carry an EXIF
rotation included, checked against a reference rendered by the operating
system. What the numbers do not settle is iOS Safari's per-tab memory limit,
which only a real phone can answer (§ What is still unproven).

Five findings change what the contract assumes:

1. **Chrome cannot decode HEIC at all.** All 105 failed. The contract's
   fallback for a derivative the browser cannot make is the original, and an
   HEIC original is not a visible photograph in Chrome or Firefox either, so
   for HEIC the fallback is a broken image. Decision 1 answers this.
2. **Phone video is HEVC, not H.264.** Twenty-nine of the 32 videos, which
   matches the uploader's whole 2024 library (135 of 140). Both browsers
   decoded every one and drew upright posters, so this step is unaffected.
   It matters to the player, which plays the original (§ What is still
   unproven).
3. **A one-shot SHA-256 of a large video costs twice its size in memory**,
   about 1 GB for the 533 MB file. A streaming hash costs 77 to 264 MB, and is
   what brought WebKit's batch peak from 2.3 GB to 1.0 GB.
4. **WebKit draws a black video frame** if the poster is captured on `seeked`.
   It needs `requestVideoFrameCallback`. Chrome is the opposite: the callback
   never fires on a paused seek, and the `seeked` frame is already correct.
5. **WebKit silently answers a WebP request with a PNG** 5.7 times the size.
   Derivatives are JPEG, and the engine checks the `Blob`'s actual type.

Two smaller ones: WebKit's JPEG encoder spends 1.7 to 1.9 times Chrome's bytes
at the same quality setting, and CDP CPU throttling slows only the main thread,
not workers, so it says nothing about this workload. The efficiency-core run is
the honest CPU approximation, and it is a slow phone's two minutes for 200
files.

## What this delivers

All twelve routes in `upload.md`, under `routes/uploadSessions/`:

| Route                                                         | What it is                                       |
| ------------------------------------------------------------- | ------------------------------------------------ |
| `POST /api/upload-sessions`                                   | Open a draft                                     |
| `GET /api/upload-sessions/current`                            | The session to pick up, or `204`                 |
| `GET /api/upload-sessions/:sessionId`                         | Progress, days, the edit plan, the done figures  |
| `PATCH /api/upload-sessions/:sessionId/manifest`              | Declare, reconcile, amend; the hash negotiation  |
| `POST /api/upload-sessions/:sessionId/files/:fileId/presign`  | Single or multipart, any rendition purpose       |
| `POST /api/upload-sessions/:sessionId/files/:fileId/complete` | Verify, ingest, run the latch                    |
| `POST /api/upload-sessions/:sessionId/files/:fileId/retry`    | A failed file back to `waiting`                  |
| `PATCH /api/upload-sessions/:sessionId/visibility`            | One rule for the batch                           |
| `POST /api/upload-sessions/:sessionId/edits`                  | One bulk action                                  |
| `DELETE /api/upload-sessions/:sessionId/edits/:editId`        | Undo one                                         |
| `POST /api/upload-sessions/:sessionId/commit`                 | Arm a draft, or close an upload with what landed |
| `DELETE /api/upload-sessions/:sessionId`                      | Cancel a draft                                   |

Plus the `upload_session` email in all three of its prototype shapes,
`upload-abandon-sweep`'s missing halves, four new B2 client operations, a
`pnpm b2:cors` setup command, the headless engine in `apps/web`, a dev-only
harness page, and a `pnpm upload:proof` command.

## What already exists, and what it settles

- **The schema.** Migration 0006 built `upload_sessions`, `upload_files`,
  `upload_batch_edits` and `upload_batch_edit_targets` with every index
  `data-models.md` § Upload declares. This step adds no migration.
- **The sweep's first half.** `runUploadAbandonSweep` already fails idle
  in-flight files as `abandoned` and cancels drafts older than
  `appConfig.upload.draftExpiryHours`. Its docstring leaves the latch and the
  multipart aborts to this step, and decision 4 adds them.
- **The B2 client** has `presignPut`, `presignMultipart` (open and sign in one
  call), `completeMultipart` and `abortMultipart`. Decision 6 adds the rest.
- **Visibility.** Step 5a's `getVisibilityRuleFromSubjects` canonicalises,
  digests and finds or inserts a rule. `PATCH .../visibility` calls it, then
  sets one column.
- **Tags and people.** Step 5a's find-or-create, built on
  `makeNormalisedNameFromName`, is what the ingest fan-out calls for a
  `label_snapshot`, so a bulk "Hospital" and a per-item "hospital" cannot
  become two tags.
- **Time.** `makeInstantFromLocalWallClock` resolves an offset-less wall clock
  in a zone, and `getLocalDayFromInstant` gives the local day. The ladder needs
  nothing new.
- **Mail.** `enqueueEmail` writes one row per recipient and refuses a kind
  without a template, so the template lands before the enqueue can compile.
- **Recipients.** `getVisibleRuleIdsFromMemberId` and its per-generation cache
  are the expansion `notifications.md` § Recipient resolution step 3 asks for.

## Module layout

A new `apps/server/src/upload/` beside `items/` and `archive/`:

| Module                          | What it holds                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `uploadSessionAccess.ts`        | Load a session for its uploader, or for an admin on the two read routes, or 404    |
| `readUploadSessionDetail.ts`    | The composer behind `GET`, `current` and `commit`: progress, days, edits, the page |
| `reconcileManifest.ts`          | The hash negotiation, refusal, the ladder, one multi-row insert and update         |
| `captureDateLadder.ts`          | Six rungs over the declared evidence; pure, no database                            |
| `presignUploadFile.ts`          | Single or multipart, first presign or re-presign, by purpose                       |
| `completeUploadFile.ts`         | Backblaze verification first, then the one transaction                             |
| `ingestUploadFile.ts`           | `items`, `item_renditions`, the edit fan-out; called inside complete's transaction |
| `settleUploadSession.ts`        | The latch, burst detection, the email fan-out, in one function every caller shares |
| `detectBursts.ts`               | Partition, order, cut at the gap; pure over rows                                   |
| `enqueueUploadSessionEmails.ts` | The three-query recipient set and each recipient's own payload                     |

`packages/shared/src/upload.ts` holds every schema in `upload.md` § Shared
types. `packages/emails` gains `UploadSessionEmail.tsx`.

On the web side, `apps/web/src/api/uploads/` holds the route calls, one
function per route, and `apps/web/src/upload/` holds the engine (decision 8).
`apps/web/upload-proof.html` is the harness (decision 10).

## Decisions

### 1. HEIC decodes natively where it can, and through WASM where it cannot

The engine tries `createImageBitmap` first. When an HEIC or HEIF file will not
decode, it loads `libheif-js` into that worker, lazily, so a Safari uploader
never downloads it. The cost is 345 KB of WASM over brotli plus 29 KB of glue,
and about 0.4 s per 12 MP photograph on a fast machine, 1.8 s on slow cores.

Two consequences:

- **The WASM heap grows to about 174 MB after a 24 MP file and never
  shrinks**, so a worker that has decoded HEIC is terminated and replaced after
  a fixed number of HEIC files (`appConfig.upload.heicWorkerRecycleCount`).
- **Licensing.** `libheif-js` is LGPL-3.0, which this AGPL-3.0 project may
  depend on, and it bundles libde265, an HEVC decoder with the patent exposure
  that every HEIC decoder carries. Accepted deliberately: the alternatives were
  refusing an iPhone's own photographs in Chrome, or uploading originals no
  Chrome or Firefox viewer can see.

The contract's ruling stands for everything else: a derivative the browser
still cannot make is dropped, not fatal, and `MediaRef` falls back to the
original.

### 2. No Backblaze call inside a SQLite transaction

SQLite has one writer, and a network round trip inside a transaction holds the
write lock for its whole duration. With two transfers in flight per uploader
and a 300 ms `headObject`, that serialises everybody's comments behind
somebody's upload.

So `complete` verifies first and writes second: `completeMultipart` or
`headObject` for the original, one `headObject` per reported derivative, then
one short transaction holding the file row, ingest, the fan-out and the latch.
If verification fails with a network error the row stays `sending` and the
route answers `503 upload_storage_unavailable`. If it fails because the object
is the wrong size, the row goes `failed` with `content_mismatch`.

The sweep is the same shape. It marks rows and runs the latch in the database,
then aborts multipart uploads afterwards, outside any transaction. An abort
that fails is logged and retried on the next run, because the row still
carries its `multipart_upload_id`.

### 3. Derivatives ride the original's presign, and only the original counts

The contract has `presign` take a `purpose` and `complete` take a
`renditions` list, and leaves the bookkeeping open. This design:

- **Keys are deterministic**: `uploads/<sessionId>/<fileId>/<purpose>.<ext>`,
  where `ext` comes from the declared type for the original and is `jpg` for
  every derivative. `upload_files.storage_key` holds the original's key only.
  The derivative keys never need a column, because `complete` can recompute
  them, and the `item_renditions` rows written at ingest are where they live
  from then on.
- **Only a `purpose: "original"` presign increments `attempt_count`.** A file
  with three derivatives would otherwise read as four attempts on its first
  try.
- **A derivative is always a single PUT.** The largest the spike produced was
  under 2 MB, where an expiry costs nothing worth saving and multipart buys
  nothing. Its URL cannot limit what is sent to it, so `complete` refuses a
  reported derivative over `appConfig.upload.derivatives.maxBytes` (10 MiB)
  with a `400`, and the browser drops one that size before presigning it.
- **A file is `done` only when every rendition it reports has been
  verified**, which is the contract's rule that `UploadFileDto.media` is never
  null on a `done` file. A derivative the browser reports and Backblaze does
  not hold fails the whole `complete` with `content_mismatch`, rather than
  silently dropping it, because the browser said it was there.

### 4. One settle function, called from four places

`settleUploadSession` runs the latch `UPDATE` from `data-models.md` verbatim.
When `changes() = 1`, and only then, it runs burst detection and enqueues the
email in the same transaction. It is called by `complete` on both outcomes,
once by `commit` on both of its meanings, by presign when it cancels a
duplicate (decision 15), and by the sweep, once per batch it fails files in.

The sweep reads the ids of the idle batches, which is a handful in any real
run, and takes each in a transaction of its own: it fails that batch's
in-flight files, queues what they left in the bucket (decision 18), and
settles it. One transaction per batch, so a batch whose settle fails rolls
back alone and is found again next run while the others settle. That loop is
over sessions, not files.

A settled batch can still hold one kind of in-flight row: a file retried after
the batch settled. The sweep fails it as `abandoned` once its own `updated_at`
is past the grace, since another retried file can keep the batch's
`last_activity_at` fresh, queues its leftovers in the same transaction, and
never runs the latch for it: the batch's one email has already gone.

**Bursts** follow `upload.md` § Burst detection with
`appConfig.burst.maxGapSeconds` (10) and `appConfig.burst.minimumFrameCount`
(3), not the `upload.*` setting keys the contract assumed, per its own
ruling 4. `detector_version` is 1. `detectBursts` is pure over
`(itemId, capturedOn, capturedAt)` rows, so the "45 frames four seconds apart"
and "two frames six seconds apart" tests do not need a database.

**`notified_member_count` and `notified_at`** are written by the same
transaction that enqueues the rows: the count is the number of recipient rows
written, and `notified_at` is the settle time. They record that the fan-out
ran. Whether each message was delivered is the outbox's to say, per row, and
`readMailQueueHealth`, behind step 8a's `GET /api/mail/health`, already reads
it there. A batch whose recipients come to zero (an "only me" rule) settles
with a count of 0 and no rows.

### 5. The email is one template in three shapes

`UploadSessionEmail.tsx` renders the prototype's `upload`, `upload-narrowed`
and `upload-multi-day` states from `UploadSessionEmailPayload`. Narrowed is not
a separate shape in the payload, only a smaller `visibleItemCount`;
multi-day is `visibleDayCount > 1`. `capturedOn` is the day carrying most of
that recipient's visible items, with the earliest such day winning a tie, so
it is deterministic. The link opens at `lastCapturedOn` instead, the newest
visible day, and the milestone the email names is that day's.

The recipient set is the three queries `notifications.md` writes out, never one
per member, and each recipient's count falls out of the same intersection that
admitted them. The uploader is excluded by id before the intersection, and so
is anybody with `notify_on_upload = 0`.

### 6. Four new B2 operations, and CORS as a command

- `headObject({ key })`, returning size and content type, or `null` for a 404.
- `signParts({ key, uploadId, partNumbers })`: fresh URLs for chosen parts of
  an upload that is already open. Re-presigning a multipart file must keep its
  `multipartUploadId` (`upload.md` § When a presigned URL expires), and
  `presignMultipart` always opens a new one.
- `getBucketCors()` and `putBucketCors(rules)`, used only by the setup
  command below and never by a route.

**The bucket needs CORS.** `docs/architecture.md` says there is no CORS
configuration, which is true of the API and false of Backblaze: the browser
PUTs to the bucket's origin, which is not the app's. The rule allows `PUT`,
`GET` and `HEAD` from the instance's `public.base_url` and, outside
production, the Vite origin, allows the `content-type` request header, and
**exposes `ETag`**, without which the browser cannot read a part's ETag and
multipart cannot complete.

`pnpm b2:cors` prints the bucket's current rules and the ones this needs, and
applies them when asked. If the application key, or Backblaze's S3
compatibility layer, cannot write bucket settings, it says so and prints the
exact rule to enter in the Backblaze console instead. Whether the scoped key
can do it is found out by running the command, not assumed.
`docs/deployment.md` gains the step, and `docs/architecture.md` gains the
distinction.

### 7. The upload configuration is `appConfig`, with reasons

The contract lists these as `upload.*` keys. Following its own ruling 4, they
are deployment constants in `app.config.ts`, not settings an admin edits:

| Value                         | Default                                                     | Why                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acceptedContentTypes`        | JPEG, HEIC, HEIF, PNG, WebP, GIF, QuickTime, MP4            | What a phone and a messaging app produce                                                                                                                                                 |
| `maxFileBytes`                | 8 GiB                                                       | A long 4K phone video; well inside multipart's 10,000 parts                                                                                                                              |
| `multipartThresholdBytes`     | 32 MiB                                                      | Below it a file is one PUT with no server contact until it lands, so at the floor rate it must finish inside the abandon grace (about 34 minutes); the mockup's 184 MB video is above it |
| `transferFloorBytesPerSecond` | 16 KiB/s                                                    | The slowest per-transfer rate the timing relations are designed to survive; the browser's re-presign arithmetic reads it too                                                             |
| `multipartPartSizeBytes`      | 16 MiB                                                      | The contract's figure; S3's minimum is 5 MB                                                                                                                                              |
| `presignTtlSeconds`           | 3600                                                        | The B2 client's existing `UPLOAD_URL_SECONDS`, which this replaces                                                                                                                       |
| `maxParallelTransfers`        | 2                                                           | The spike: 4 bought a phone nothing and cost memory. The contract's 4 assumed no derivative work                                                                                         |
| `derivatives`                 | `display` 2048 px, `thumb` 480 px, JPEG, quality per engine | A phone's full screen at 2x, and a pile print at 2x                                                                                                                                      |
| `heicWorkerRecycleCount`      | 8                                                           | Decision 1                                                                                                                                                                               |
| `burst.detectorVersion`       | 1                                                           | Recorded per burst, beside the burst thresholds, so a better detector can re-derive the automatic ones                                                                                   |

`declaredContentType` is the browser's `File.type`, except that Chrome reports
an empty string for HEIC on some platforms, so the engine falls back to the
extension. The server still refuses anything outside the list, so the fallback
widens nothing.

### 8. The engine is headless, and it owns the whole client half of the contract

`apps/web/src/upload/` has two entry points.

`getManifestEntryFromFile(file)` collects capture evidence before commit, so
7b's days list exists before a byte moves: EXIF `DateTimeOriginal`,
`OffsetTimeOriginal`, dimensions and orientation through `exifr` (MIT, reads
HEIC), a video's `creation_time` from the QuickTime `mvhd` atom by reading
atom headers through `Blob.slice`, and `lastModified`. It reads headers only
and decodes nothing. The browser supplies evidence; the server picks the rung.

`createUploadEngine({ sessionId, concurrency })` runs each committed file
through one pipeline, in this order:

1. **Hash**, streaming, in a worker, with `hash-wasm` in 8 MB slices.
2. **Derivatives.** Images through `createImageBitmap` with resize on decode,
   the target size from the header dimensions, never upscaling; HEIC through
   decision 1 when native decode fails. Videos on the main thread, because a
   worker has no `<video>`: seek to a tenth of the duration or one second,
   then draw on whichever comes first of `requestVideoFrameCallback` and a
   short timeout, which is the recipe that works in both engines.
3. **The original**: presign, then a single PUT or the parts in order,
   re-presigning when a URL's remaining life is shorter than a part needs and
   re-presigning only the failed parts on a 403.
4. **The derivatives**: presign and PUT each.
5. **Complete**, with the renditions, the post-orientation dimensions and the
   duration.

Derivatives are made before the original transfers, so a file's small blobs
are ready the moment its big one lands, and they are dropped from memory as
each is sent. The engine emits `file-started`, `file-progress`, then one of
`file-done`, `file-failed` or `file-skipped` (a duplicate, decision 15) per
file, and at most one `settled` per run, or instead one `batch-closed` when a
transfer is told the batch was closed or cancelled elsewhere, which stops the
run, which is everything 7b draws. **Resume** is the engine taking
`GET /current`'s pending list, re-declaring the picked files through the
manifest, and skipping every `already_done`.

### 9. Undated files get their group now

`UploadSessionDetail.undated` is marked "proposed" in the contract, which also
writes it out in full and needs no table. It is cheap here and expensive later,
so this step serves it: the files whose `capture_source` is `file_mtime` or
`upload_time`, grouped, so 7b can put "these did not say when they were taken"
at the top of the days list. The picker it leads to is the existing manifest
amendment.

### 10. The proof runs through a dev-only page

`apps/web/upload-proof.html` is a file picker, the engine, and a log of
per-file timings and memory. Vite serves it in development only, and the build
takes `index.html` alone, so it never ships.

`pnpm upload:proof --dir <path> --browser chrome|webkit` signs in by minting a
session for a named member directly against the development catalog (it
refuses to run in production), opens the harness against `pnpm dev`, picks
every file in the directory, and runs the batch into the real bucket. It is
the step file's "200-file batch end to end against a real bucket", and it is
the same page a phone opens for the on-device test.

### 11. `details` gains the four fields the upload contract names

`conventions.md` § Errors says `details` "has three uses today", and
`upload.md` needs four more: `sessionId` on `409 upload_session_conflict`, so
the client can open the batch already in flight; `fileId` on the hash
collision, so it skips the file the server already holds; `state` on
`upload_file_conflict`; and `clientRefs` on `409 upload_manifest_conflict`,
naming which picked files were refused. The contract is binding and "today" is
not "forever", so `apiErrorDetailsSchema` gains the four as optional fields,
additively, and `conventions.md` gains the rows. No existing response changes.

### 12. The last rung is the manifest time, not the commit time

The ladder runs when a file is declared, which is before commit, and
`original_captured_at` freezes the moment it first runs. Rung 6 as written,
"the commit time", is therefore not yet known when it is needed, and stamping
it later would rewrite a frozen column. So rung 6 is the time the file was
declared. Both are an arbitrary "when it was uploaded" for a file that said
nothing, and decision 9's undated group is what makes either visible and
fixable.

### 13. The browser tests run against a local S3 stand-in

The end-to-end layer cannot reach Backblaze, and should not: a test run must
not need keys or cost storage. `e2e/support/fakeS3Server/` is a small HTTP
server that answers the handful of S3 calls the flow makes (a PUT, the four
multipart calls, `HEAD`, `GET`, and the CORS preflight) without checking
signatures. The e2e environment points `B2_ENDPOINT` at it, which works
because the client already uses path-style addressing. The server-side tests
keep `createFakeB2Client`.

The fixtures are small and generated rather than real photographs: a rotated
JPEG, an HEIC, a short video, a file large enough to go multipart, and a PDF to
refuse. They are committed under `e2e/fixtures/upload/` through a deliberate
`.gitignore` exception, which is what the comment above the media rules asks
for. They are not drawn from `prototypes/`, which step 9 deletes.

The upload spec runs in the installed Chrome and in Playwright's WebKit.
Playwright's bundled Chromium (153 when this was measured) decodes H.264 but
not HEVC, which is what a phone records, so it is no stand-in for Chrome. The
Chrome project is Playwright's `chrome` channel, and where Google Chrome is not
installed it skips with a message saying so, rather than falling back to a
weaker assertion, while WebKit still runs. Decision 1's fallback stays under
test in the HEVC clip, which must reach `done` and whose poster the spec does
not require.

### 14. A video's timestamp is an instant, not a local time

Rung 2 of the ladder is a video's QuickTime `creation_time`, which is UTC by
specification. The contract records it with offset 0, and that is wrong in a
way the family would see: a video shot at 00:30 in Madrid is 22:30 UTC the day
before, so it would land on the previous day and show its clock in UTC.

The timestamp says when, not where. So `captured_at` keeps the instant
exactly, `capture_offset_minutes` is null, and `capture_date` is the local day
in `shoebox.timezone`, which is what a null offset means everywhere else: the
instant is the fact and the local clock is the guess.

### 15. A duplicate found at presign is cancelled, not failed

The manifest can only collapse two picks of one file when it already knows
their hashes. When it does not, the duplicate shows at presign: its hash is
one another row of the batch already holds. The row cannot stay `waiting`,
because it would hold the settle latch open until the sweep failed it, and it
should not be `failed`, because a failed row shows as a casualty with a retry
that can never succeed.

So presign finds the collision before any Backblaze call, cancels the row in
one short transaction that also runs the latch, with a `problem_detail`
naming the file that holds the bytes, and answers `409 upload_file_conflict`
with that file's id and `state: "cancelled"`. The engine skips the file.
`cancelled` is the honest terminal state, a draft's cancel already leaves
`problem_code` null, and no migration is needed.

### 16. Bursts form only among photographs whose camera said when

Burst detection groups frames by their gap in time, so it is only as good as
the clock it reads. A file that reached the ladder's lower rungs has no camera
clock: every undated file in one batch shares the declare time, a WhatsApp
name gives only a day (and the ladder pins it to noon), and a file's
modification time is when it was saved, not taken. Fed to the detector, ten
undated forwards would become one stack of ten. So the candidates are the
items whose `capture_source` is `exif` or `video_metadata`, the two rungs that
come from the device that took the picture; everything else lands as a plain
print on its day. The detector itself is unchanged, and the filter is the
caller's, in `settleUploadSession`.

One honest limit: an amendment rewrites `capture_source` to `uploader_set`, so
a real burst whose day the uploader corrects before commit (the milestone-fix
flow) lands as plain prints. Telling a kept camera clock from an invented one
after the fact would need the original source stored on the row, which is a
migration for a rare case; `detector_version` on each burst is what lets a
later detector regroup them.

The same review moved two rungs. A Pixel's `PXL_` filename is a UTC stamp,
so it is read as an instant like a video's creation time, not as a local wall
clock. And an amendment to a file whose clock was invented (`upload_time`,
`file_mtime`) takes noon on the chosen day rather than keeping a time nobody
took the picture at, while an amendment to a file with a real offset keeps
that offset, because moving the day does not move the camera.

### 17. Commit says what it means

`upload.md` gives `POST .../commit` one route and two meanings, keyed on the
session's state: on a draft it arms the batch, on an uploading batch it closes
it with what arrived. Keyed that way, a double click on "Put 264 up", or a
client retrying a commit whose answer was lost, arms the batch with the first
request and then closes it with the second, cancelling every file before a
byte has moved. So the request carries its intent, `{ intent: "arm" | "close" }`.
Arming a batch that is already armed or settled, and closing one that has
settled, answer `200` with the detail and write nothing; closing a draft, and
anything on a cancelled batch, is `409 upload_session_conflict`. The route
keeps its one path, and a retry is now harmless in both directions.

### 18. What a closed or abandoned row leaves in the bucket is deleted

A row cancelled by "Send what did arrive", failed as `abandoned` by the
sweep, or failed by `complete` (reported by the browser, or a mismatch the
server found), may already have bytes in the bucket: a single PUT that landed just
before the tab closed, or the derivatives sent ahead of the original. Nothing
points at them, so nothing would ever delete them, and a family would pay to
store them forever. In the same transaction as the state change, every such
row that holds a `storage_key` and no item has its original key and each
derivative key enqueued into `pending_object_deletions`, which the existing
drain deletes. Deleting a key that never landed is harmless. A multipart
original is aborted, and its key is queued as well, because Backblaze may have
finished assembling the object before `complete` ran, which an abort cannot
undo.

This frees storage only because the bucket keeps only the last version of a
file (`docs/deployment.md` step 1): a B2 `DeleteObject` that names no version,
which is every delete here, merely hides the file, and without the lifecycle
rule `daysFromHidingToDeleting: 1` the hidden bytes are billed for good.

A retry can bring a row back after its keys were queued, and writes the same
deterministic keys again, so the drain checks each key against the catalog
immediately before deleting it. A key an `item_renditions` row holds, or that
belongs to an `upload_files` row now `waiting` or `sending`, only loses its
queue row. A `done` row protects only what its item's renditions hold: when it
lands, `complete` queues the derivative keys it did not report (a derivative
PUT that landed and was then dropped), and when its item is deleted, which
nulls `item_id` and leaves the row `done`, the keys that delete queued are
exactly the ones to destroy. Each abandoned batch is
swept in a transaction of its own, so one batch that cannot settle does not
stop the others.

### 19. Test and production keys live under their own prefix

The owner's requirement: test uploads are never mixed with production files.
One bucket serves both, and a key prefix keeps them apart: `test/` and
`production/`, chosen from `NODE_ENV` and overridable with `B2_KEY_PREFIX`.

It is applied inside `createB2Client` and nowhere else, so every key the rest
of the server uses stays unprefixed. The database stores unprefixed keys, key
parsing, the drain's in-use check and the renditions are untouched, and so are
the fake client and every existing test. Each operation that takes a key sends
`<prefix>/<key>`; `listObjects` lists under the prefix and strips it from what it
returns; the CORS operations are bucket-wide and are not prefixed.

The unset default is `production` only when `NODE_ENV` is exactly `production`,
which leans an unrecognised environment toward `test/`: the failure to prevent
is a developer's machine writing into `production/`. The Docker image sets
`NODE_ENV=production`, so a test or staging app deployed from it sets
`B2_KEY_PREFIX=test` explicitly. An empty value is refused
at startup rather than read as unset, because an empty prefix is the one value
that would write at the root, where the two mix.

The prefix is a convention, not an isolation boundary: a production instance
only ever asks for keys its own catalog holds, so it would never read a test
object anyway. What it adds is that bucket-wide tools, lifecycle rules and
cleanups stay apart. For a hard wall, a Backblaze application key can also be
restricted to a name prefix (`docs/deployment.md`). The end-to-end stack names
its prefix explicitly rather than relying on the default, because Playwright
layers its environment over the developer's, and the one spec helper that reads
raw keys off the stand-in's log expects it.

## What is still unproven

- **iOS Safari's per-tab memory limit.** The leanest configuration still added
  0.8 to 1.0 GB on a desktop with no memory pressure. The phone test runs the
  harness on an iPhone at one and two at a time, with a 24 MP HEIC, the 4K
  video and the 533 MB file in the batch.
- **What the iOS picker hands over.** Whether `<input type=file>` converts HEIC
  to JPEG, or HEVC to H.264, on selection, which decides what an "original" is
  and what its hash identifies. Also how long the picker takes to copy a large
  video, and what a Live Photo becomes.
- **Tab suspension** when Safari goes to the background or the screen locks.
  Resume is designed for it; the phone test confirms it.
- **The phone test needs HTTPS.** The session cookie is `Secure`
  unconditionally, so a phone on the LAN cannot sign in over plain HTTP. The
  test uses either a self-signed certificate on the dev server or a tunnel,
  decided when it runs.
- **HEVC playback** is the player's problem, not this step's: Safari and
  hardware-backed Chrome play it, Firefox and older Android may not. Recorded
  here because the contract's "already H.264" is the assumption that hid it.

## What is deliberately not here

- Surface 8 itself (step 7b). The engine, the route calls and the harness are
  everything it needs.
- `POST /api/milestones` (step 7a). A kind `milestone` edit takes an id that
  route creates; the tests insert milestones directly.
- Any edit to an item after it exists (step 5a, finished).
- A server-side derivative worker, or video transcoding. Neither is allowed
  while media bytes never pass through the server.

## Verification

`pnpm check` green, and these named tests, the step file's eight plus the ones
the decisions above added:

1. **The latch fires exactly once** under every terminal transition order,
   including a sweep racing a complete, and **a retry after settling sends
   nothing** and reports `isIncludedInEmail: false`.
2. **A batch spanning three weeks sends one email per recipient**, not one per
   day, and **each recipient's count is their own**.
3. **The uploader gets no email** about their own upload, and neither does a
   member with `notify_on_upload = 0`.
4. **45 frames four seconds apart become one burst; two frames six seconds
   apart become two plain prints.**
5. **`upload-abandon-sweep` cancels a draft older than a week and leaves a
   six-day-old one alone**, fails idle in-flight files, settles their sessions,
   and aborts their multipart uploads outside the transaction.
6. **The capture-date ladder**, rung by rung, including an offset-less EXIF
   date resolved in `shoebox.timezone` with `capture_offset_minutes` null, a
   23:30 local photograph landing on its local day, and a 1904-epoch video date
   falling through to the filename.
7. **The hash negotiation**: a re-declared batch matches by hash before name,
   reports `already_done` for what landed, and collapses the same file picked
   twice.
8. **The manifest is additive**: a request naming four of 264 files leaves the
   other 260 untouched.
9. **No byte before commit**: presign on a draft is `409`, and cancelling a
   draft leaves nothing in the fake bucket.
10. **Ownership 404s are byte-identical** on every route, an admin included on
    the write routes.
11. **`complete` makes no Backblaze call inside its transaction**, asserted by
    a fake B2 client that fails the test if called while a transaction is
    open.
12. **A file is not `done` until every reported rendition is verified.**
13. **End to end in Chrome and WebKit** against the local S3 stand-in: a
    rotated JPEG, an HEIC, a multipart video, and a refused PDF, through to a
    settled session with items on their days; and **a tab closed mid-transfer
    that reopens to the same batch with its edit plan intact and asks only for
    what is missing**.
14. **The 200-file proof against the real bucket**, with its timings recorded
    here when it has run.
