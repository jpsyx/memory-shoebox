# The API server (`apps/server`)

A Fastify 5 process that owns the SQLite catalog, talks to Backblaze B2, and
serves the built web app. Node executes its TypeScript directly, so there is no
build step and the production container runs the same files you edit.

## Layout

```
apps/server/
├── src/
│   ├── index.ts            entry point: config, database, listen, shutdown
│   ├── app.ts              builds the Fastify instance (createApp)
│   ├── config.ts           environment parsing and validation
│   ├── auth/               the cookie, the code, the session, the middleware
│   ├── archive/            the day stream, the vocabularies, the directory and
│   │                       the seen latch
│   ├── db/
│   │   ├── client.ts       opens SQLite, returns a typed Kysely handle
│   │   ├── types/          the schema as Kysely sees it, by table group
│   │   ├── migrate.ts      migration runner, also a CLI
│   │   └── migrations/     one file per migration, registered explicitly
│   ├── items/              one photograph: the predicate gate, the two guards,
│   │                       the composer, and the delete transaction
│   ├── upload/             the upload session: access, the ladder, the
│   │                       manifest, presign, ingest, bursts, the settle latch
│   ├── http/
│   │   ├── requestContextHelpers.ts  the viewer, and requireViewer
│   │   ├── ApiError.ts        one constructor per refusal
│   │   ├── registerErrorHandler.ts  the error envelope every failure wears
│   │   └── rateLimit/         the rule table, the counters, and the hook
│   ├── jobs/
│   │   ├── createJobRunner.ts    intervals, overlap guard, clean stop
│   │   ├── createJobRegistry.ts  the seven jobs, with their cadences
│   │   └── run*.ts         one module per job
│   ├── mail/               the outbound queue: see mail.md
│   ├── milestones/         occasions, visible counts, attachment deltas
│   ├── members/            the account shape and the first-sign-in seed
│   ├── settings/           instance settings, read through their defaults
│   ├── time/               calendar days in the Shoebox's own timezone
│   ├── visibility/         the predicate, its cache, and the generation bump
│   ├── b2/client/          Backblaze B2 over the S3-compatible API
│   ├── routes/             one module per route group, mounted under /api
│   └── web/staticSpa.ts    serves the built SPA and the SPA fallback
├── test/                   Vitest suites
└── .env.example            template for local configuration
```

## Startup

`src/index.ts` does four things in order: read configuration, open the
database, apply pending migrations, then build and start the app. Migrations
run at boot deliberately, so a self-hoster upgrading their instance never has
to remember a separate step.

It also handles `SIGTERM` and `SIGINT` by closing the server and the database
before exiting. Fly.io stops machines with `SIGTERM`, and SQLite wants a clean
close so its write-ahead log checkpoints properly.

## The application factory

`createApp(deps)` in `src/app.ts` builds the Fastify instance and returns it.
It reads no environment variables and opens no connections: the caller passes
in the config, the database, and optionally a Backblaze client. That is what
lets tests run the real application against an in-memory database and a fake
B2, using `app.inject()` instead of a socket.

Dependencies are attached to the instance with `app.decorate`, so any handler
can reach them as `request.server.database` or `request.server.b2` without
importing module-level state.

## Routes

Route modules live in `src/routes/` and are registered under the `/api` prefix,
so a module declaring `GET /health` is reachable at `/api/health`. Group them
by resource, one module per group.

There are fifteen:

| Module               | Covers                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| `health.ts`          | `GET /api/health`, for Fly.io's health check                               |
| `auth.ts`            | Sign-in codes and sessions, all four anonymous                             |
| `me.ts`              | The signed-in member's own account and their devices                       |
| `publicSettings.ts`  | `GET /api/public-settings`, the one anonymous read                         |
| `timeline.ts`        | `GET /api/timeline` and `GET /api/timeline/rail`                           |
| `filters.ts`         | `GET /api/filters/facets`                                                  |
| `milestones/`        | Occasion CRUD and attachment deltas: see [milestones.md](milestones.md)    |
| `removals/`          | Removal queues, item asks, and settlements: see [removals.md](removals.md) |
| `tags.ts`            | `GET /api/tags`                                                            |
| `people.ts`          | `GET /api/people`                                                          |
| `items/`             | One item: the permalink, the download, every edit, the                     |
|                      | delete, comments on it, reactions, and the seen latch                      |
| `comments.ts`        | A comment by its own id: edit, delete, and its pair of                     |
|                      | reaction routes                                                            |
| `bursts.ts`          | `GET /api/bursts/:burstId/frames`                                          |
| `visibilityRules.ts` | `POST /api/visibility-rules/resolve`                                       |
| `uploadSessions/`    | The upload session's twelve routes, from opening a                         |
|                      | draft to committing it                                                     |

`health.ts` is the odd one: it reports the server version and uptime, is
unauthenticated, and deliberately reveals nothing else. `auth.ts`, `me.ts` and
`publicSettings.ts` are [auth.md](auth.md). The four that read the archive are
[archive.md](archive.md), which is where the day stream, the milestone-span
union, the cursor and the `ON`-clause hazard are written down; the readers they
call live in `src/archive/`. `items/`, `comments.ts`, `bursts.ts` and
`visibilityRules.ts` are the item slice, below, and their modules live in
`src/items/`. `uploadSessions/` is the upload slice, after it, and its modules
live in `src/upload/`. `POST /api/items/seen` is the one crossing: it is
the archive's seen latch and it is served from `items/`, because the path it
sits under is an item's.

**A new module inherits most of what a route needs.** Registered here it
already gets `request.viewer` filled in by the authenticator, the rate limits
its route config names, and the single error envelope, from the sections below;
it can enqueue mail inside its own transaction, compose the visibility
predicate, and rely on the seven background jobs its tables need. What a route
slice still has to build is its own handlers.

Fifty-nine of the contract's 78 routes are built and the other nineteen
are specified and unbuilt. `GET /api/health` is not one of the 78. [`docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/`](prds/2026-09-27-memory-shoebox/tech-specs/apis) carries the whole
contract: one document per route group, matching the module-per-resource layout
above, plus [`conventions.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md), which is binding on all of
them. Read that file before adding any route, because the things most easily
got wrong are settled there rather than per route: 404 never 403 for anything
the viewer may not see, every count filtered per viewer, and the visibility
predicate computed once by the middleware.

Milestone reconciliation is registered under
`routes/milestones/registerReconcileMilestoneRoute.ts`. The handler owns one immediate
transaction; `milestones/reconcileMilestone.ts` validates the entire visible
attachment selection, then acknowledges or delegates moves to the shared capture
service. It batches settings, visibility, bursts, and other occasion mismatch
counts. [milestones.md](milestones.md) describes its errors and audit behavior.

## The item slice

Eighteen routes hang off one photograph, and `src/items/` holds everything
they share. The contract is
[`tech-specs/apis/items.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/items.md);
this section is how it is put together here, and what a later step has to
respect.

| Module                             | Owns                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `getVisibleItemOr404.ts`           | One item under the viewer's predicate, or the 404. Every handler starts here                     |
| `itemPermissions.ts`               | The two guards, the capability flags, and the table below                                        |
| `readItemDetail/`                  | `ItemDetail`, composed once for the read route and for every mutation                            |
| `readBurstFrameRefs/`              | The strip: its rows, the refs, the aggregate, and the frames route's paging                      |
| `makeBurstSummaryFromRows.ts`      | `BurstSummary`, from the totals over **every** visible sibling                                   |
| `readCommentThread.ts`             | One item's whole thread, oldest first, with its reactions                                        |
| `readReactionSummaries.ts`         | Reaction rows to summaries, for items and for a whole thread of comments                         |
| `readItemSummariesByIds/`          | `ItemSummary` per id, for the selection save's response                                          |
| `setItemTags.ts`                   | The tag set by diff, and `getTagIdsFromNames`, which upload ingest shares                        |
| `setItemPeople.ts`                 | The people set, by diff                                                                          |
| `setItemCaptureDate.ts`            | The singular hand-correction adapter, preserving its existing interface                          |
| `setItemCaptureDates.ts`           | Shared batched clock planning, item changes, capture history, and acknowledgement resets         |
| `ejectCaptureDateBurstFrames.ts`   | Batch ejection and storage-level empty-burst deletion, including hidden siblings                 |
| `getVisibilityRuleFromSubjects.ts` | A `(mode, subject set)` to a rule id, found or created, over a digest                            |
| `deleteItem.ts`                    | The delete transaction, in the order below                                                       |
| `closeOpenRemovalRequests.ts`      | Resolving every open removal request the delete answers. Deleted answers in the same transaction |
| `enqueueCommentEmails.ts`          | The `comment` message, in the comment's own transaction                                          |
| `latchItemOpened.ts`               | `item_views` for an open at full size                                                            |

### `getVisibleItemOr404` is the first line of every handler

**Every single-item handler checks a role only after the predicate has run.**
The handler parses its params, then resolves the item, and only then reaches a
guard. Reversing the two turns every forbidden action into a test for whether
an id exists: a 403 on an item the caller may not see confirms that something
is there, which is exactly what the counting rule exists to prevent
(`conventions.md` § Errors).

`POST /api/items/visibility` is the one exception, and it is safe for a
different reason than ordering. It checks `assertMayEditItemContent` once for
the whole request, before resolving any of the ids in the body, because that
gate is a fact about the viewer alone (`isAdmin` or `role === "uploader"`) and
never about which items exist or are visible. A viewer who may not touch
anything gets the same 403 whichever ids the request names, so checking first
leaks nothing; the per-item ownership guard (`mayChangeItemAccess`) still runs
after the visibility-filtered read, exactly like everywhere else.

The 404 is byte-identical for an invisible item and for an id that never
existed, because it is the same `ApiError.notFound` either way and there is no
branch that could make them differ: same status, same code, same message, no
`details`. A route that takes a comment id passes `code: "comment_not_found"`,
so the code names the resource the caller addressed rather than the item
behind it, and the pair of codes is not itself an oracle.
`test/routes/__tests__/itemNotFoundParity.routes.test.ts` holds every route
that takes an item-derived id to that, three ways: an invisible item, an id
that never existed, and a viewer who may change nothing and must still get the 404. The table it runs lives beside it in
`itemNotFoundParityTestHelpers.ts`.

The row it returns is wider than any one caller needs, deliberately. It is
read once per request and handed to whichever guard, composer or transaction
the route runs, so no handler goes back to `items` for a column it forgot.

### Two guards, split by consequence

`itemPermissions.ts` is the only implementation of `conventions.md` § Who may
change an item, which is binding:

| Action                                             | Who                                                 |
| -------------------------------------------------- | --------------------------------------------------- |
| Delete, change visibility, change the capture date | **The item's** uploader, or an admin                |
| Tags, people, alt text                             | **Any** uploader or admin, on anything they can see |

The first group is destructive or changes who can see something, so it belongs
to whoever put it there. The second is additive and cheap to correct, and is
better for being collective: whoever recognises the face should be able to say
so. A `viewer` may do none of it, which is the one genuine role check on an
item and therefore the one genuine 403. Commenting and reacting are not on the
table at all: holding the payload is the permission, and a `viewer` who can
open an item can say something on it.

`makeItemCapabilitiesFromItem` computes `ItemCapabilities` from the same two
predicates the guards use. Computing them anywhere else is how a button and
the request it sends stop agreeing, which is invisible in the interface until
somebody presses it.

`removals/readRemovalGate.ts` reads the linked people-tag and this viewer's
open request together, only after item visibility has been checked. The tag
joins through `people.member_id`; an unlinked person is insufficient. Item
detail consumes this shared gate. Any tagged member, including the item's
uploader or an admin, may request removal when no open request of theirs
exists. Tags never grant visibility or access to an otherwise hidden item.

**The selection save is the one route that skips rather than refuses.**
`POST /api/items/visibility` checks the role once for the request, so a
`viewer` meets the same 403 as everywhere else, and then applies the
ownership half **per item**: a selection spanning two uploaders changes only
the caller's own and answers `200` with `skippedCount`. That is the one place
`mayChangeItemAccess` is used as a predicate rather than through its guard.
The two ways an id can fail there are different failure modes and are
answered differently: an id the viewer **cannot see** is still all or
nothing, failing the whole request with the bare 404, because a list of which
ids survived counts what the viewer cannot see, whereas a count of the ids
they can see and do not own reveals nothing, since `uploadedBy` is already on
every print they built the selection from.

`test/routes/__tests__/itemPermissionsMatrixTestHelpers.ts` is one table over
every mutating route and four kinds of viewer, in one file, so a route added
later without a row in it is conspicuous. `itemPermissionsMatrix.routes` runs
it, `itemPermissionsMatrix.batch` runs the selection route beside it, and
`itemPermissionsMatrix.demotedUploader` covers the persona the four columns
cannot express. The expected column is the table above. **If a row fails, fix
the route.**

### One composer

`readItemDetail` builds the whole `ItemDetail` payload, and **every route in
the slice returns it**, the read route and every mutation alike, so that
saving a description and re-opening the photograph cannot produce two
different pictures of the same item. A mutation hands it the row it already
resolved, patched with the columns it just wrote, rather than reading the item
again.

Nothing in it is per comment, per frame or per member.
`test/routes/__tests__/itemDetail.queryPlan.test.ts` pins that: the count is
flat in the thread's length, in the strip's size and in the number of people
who reacted, and a burst costs exactly four queries more than a plain print,
which are the strip's capped rows, the aggregate beside them, the stored
cover, and the batched seen latch. The strip is composed from the same signed renditions,
people map and timezone the item's own batch already holds, because
`items.md` § Performance queries 3 and 6 are each **one** batched read
covering the item and the strip.

**The cap bounds `burstFrames` and nothing else.**
`appConfig.items.burstStripMaxFrames` stops the strip at sixty thumbnails,
and everything measured
over the burst rather than over the strip is read beside those rows in one
aggregate: `visibleFrameCount`, the visible span's two endpoints,
`hasUnseenFrames`, and this item's own `burstPosition`. Taking any of them
from the capped rows is the same bug four times over. `visibleFrameCount` is
the figure that tells the client there are more frames than it was sent, so a
count that can never exceed sixty can never do its job, and it is also the
figure the pile publishes for the same burst, which read its siblings
uncapped: above sixty frames the two disagreed. A capped span is wrong the way
the stored one is, and a `burstPosition` numbered over the strip is null for
every frame past it, which is exactly the frame the frames route exists to
reach. `readItemSummariesByIds` pays for no aggregate: its `burst_id IN (...)`
read is already uncapped, so its totals come off its own rows.

**`GET /api/bursts/:burstId/frames` is where the rest of a long burst comes
from, and it pages for real.** Its cursor is opaque and encodes
`(burst_index, id)`, the sort key, which is one of only two cursors in the
contract that is not a bare uuidv7: `burst_index` is the order the strip is
read in and need not agree with arrival order, so a plain `id >` would drop
frames and repeat others. It is base64url over a small JSON object, the shape
`archive/timelineCursorHelpers.ts` already set, and a cursor that does not
decode is `400 invalid_request` with `details.fieldErrors.cursor`, as the
timeline's is. The page reads one row past its `limit`, which is how "is there
another page" is answered without a second count.

The cursor also carries how many frames the client has been handed, because
`BurstFrameRef.position` is dense over the frames actually drawn and a page
can drop one whose renditions have gone missing. Recomputing the offset from
row counts would reopen the gap that dense numbering exists to hide, and
restarting at 1 on page two would tell the viewer there are two frame 1s in
one burst. The 404 on that route is therefore decided on rows rather than on
drawn frames: a page whose frames were all lost to an ingest defect is not a
missing burst.

`readItemDetail` does not count the open. Only `GET /api/items/:itemId` does,
and it does it afterwards: saving a description is not opening a photograph.

### The delete transaction

`deleteItem` runs inside one `BEGIN IMMEDIATE`, in an order two steps of which
no foreign key expresses:

1. Read the renditions' **storage keys**, while the rows still exist.
2. Enqueue those keys into `pending_object_deletions`, in this same
   transaction. No transaction spans SQLite and Backblaze, so the rows commit
   first and `object-deletion-drain` takes it from there. Without this a B2
   failure leaves a family paying to store a photograph they were told was
   destroyed.
3. **`closeOpenRemovalRequests`**, while `removal_requests.item_id` still
   points at the item. That column is `SET NULL` on delete, the one exception
   to cascade in the whole schema, so the rows become unfindable by item the
   instant the item goes. It closes **every** open request rather than the one
   being answered: two cousins tagged in one photograph both asked, and one
   delete answers both.
4. The `item_deleted` activity row, composed while the item is still readable.
   It is the only record anywhere that the item existed, and its `subject_id`
   is a dangling id by design.
5. The delete itself, and the engine performs the cascade matrix
   (`data-models.md` § Deleting an item).
6. Drop the burst if that was its last frame. Application code, because no
   foreign key direction does it.

`closeOpenRemovalRequests` reads complete request snapshots, conditionally
settles open rows, and enqueues each deleted answer before deleting the item.
Requester answers bypass the removal preference; a non-actor uploader's copy
honors it. A SQL mail insertion error rolls back settlement, object-deletion
queues, the activity record, and item deletion together. B2 cleanup happens
later through the drain, outside the transaction.

**Nothing blocks a delete.** Not an open removal request, because deleting is
how you grant one, and not a burst with forty-four siblings, because deleting
one frame of forty-five is ordinary. There is no `409` in that route's table.

### The two latches on the read route

Both run after the payload is assembled, and outside the read work, so a page
of reads never holds SQLite's single writer and `isUnseen` reports the state
the viewer arrived in.

- **`latchItemOpened`** writes the open at full size: `first_opened_at`
  `COALESCE`d rather than overwritten, because the row may already exist from
  a sighting, plus `last_opened_at` and `open_count + 1`. It is deliberately
  **not** throttled, unlike the session slide: the table is bounded by content
  rather than by behaviour, one row per `(member, item)` forever, and
  `open_count` is a figure the admin area prints.
- **`latchItemsSeen`**, from the archive slice, clears the accent dot on every
  visible sibling when the item is in a burst, in one batched statement. A
  thumbnail in the strip has been in front of the viewer; it was not opened at
  full size, and the two are different columns.

A 404 writes neither. Both run only after the item has come back from the
predicate, so a probe against something the caller cannot see leaves no trace.

### `item_people` is not a key

Being in a photograph does not let you see it; only having uploaded it does
(`data-models.md` Decision 7). `item_people` appears in no visibility
expression anywhere in this slice, and the tag gate behind `canRequestRemoval`
only ever subtracts: it is evaluated on a row that has already come back from
`getVisibleItemOr404`. The test named for it is
`test/routes/__tests__/itemNotFoundParity.peopleTag.test.ts`: a photograph
restricted to admins, people-tagged for a viewer whose linked person is on it,
is a 404 to that viewer on every route and absent from their timeline and
their rail.

## The upload slice

Twelve routes take a batch from a draft to a settled session, and
`src/upload/` holds everything they share. The contract is
[`tech-specs/apis/upload.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/upload.md);
the decisions it left open, the places the build refined it, and the spike
that came before any of it are the step design,
[`2026-10-02-upload-design.md`](superpowers/specs/2026-10-02-upload-design.md).
The routes are in `src/routes/uploadSessionsRoutes/`, one file per route or small
family, registered by `uploadSessionsRoutes.ts`. Larger upload operations group
their database planning, storage calls and types in directory modules. The B2
client binds its operations to one SDK client and one validated key prefix;
individual storage operations live in the `b2/createB2Client/` directory.

| Module                                   | Owns                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `uploadSessionAccessHelpers.ts`          | The session for its uploader, or for an admin on the two read routes, or the 404           |
| `readUploadSessionDetailHelpers.ts`      | `UploadSessionDetail` behind `GET`, `current` and `commit`, from the `readUpload*` readers |
| `reconcileManifest/`                     | The hash negotiation, refusal, the ladder, one multi-row insert and one update             |
| `captureDateLadderHelpers/`              | The six rungs and the uploader's amendment, pure                                           |
| `uploadEditPlanHelpers.ts`               | The bulk actions' writes, and the check that the plan is still open                        |
| `commitUploadSession.ts`                 | Arm or close, by the request's `intent`                                                    |
| `presignUploadFile/`                     | Single or multipart, first presign or re-presign, by purpose; the keys; a duplicate        |
| `verifyUploadedObjects/`                 | Every Backblaze check `complete` makes, before its transaction opens                       |
| `completeUploadFile/`                    | `complete` either way: verify, then one transaction, then any multipart abort              |
| `ingestUploadFile/`                      | `items`, `item_renditions` and the edit fan-out, inside `complete`                         |
| `makeBurstsFromCandidates.ts`            | Partition by day, order, cut at the gap, pure                                              |
| `enqueueUploadSessionEmails/`            | The three-query recipient set and each recipient's own payload                             |
| `settleUploadSession.ts`                 | The latch, burst detection, the email and the notified columns                             |
| `enqueueOrphanedUploadObjectsHelpers.ts` | What a cancelled or abandoned row may have left in the bucket, queued for deletion         |
| `isStorageKeyInUse.ts`                   | The deletion drain's last check before it deletes a key                                    |
| `abortMultipartUploads/`                 | Multipart aborts after a commit, each id cleared only once Backblaze has let go            |

### 404 before 403

Every route that addresses a session resolves it for this member first, and
answers `404 upload_session_not_found` when it is not theirs, before it checks
the role and answers `403 upload_forbidden` to a viewer. An admin reads and
cancels another member's batch and writes into none: a draft holds no items
yet, so writing into one would attribute somebody else's uploads to them.
`POST /api/upload-sessions` addresses no row, so it checks the role alone.

### No Backblaze call inside a transaction

SQLite has one writer, and a network round trip inside a transaction holds the
write lock for the whole of it. So `complete` verifies first and writes
second: `verifyUploadedObjects` completes the multipart upload or heads the
original, and heads every derivative the browser reported, and only then does
one short transaction hold the file row, the ingest, the fan-out and the
latch. A call Backblaze cannot answer leaves the row `sending` and answers
`503 upload_storage_unavailable`. An object of the wrong size, or a multipart
upload Backblaze refuses for good (a part it does not hold, parts out of
order, a part too small), fails the file with `content_mismatch`. A multipart
complete that succeeds is headed afterwards like a single PUT, because
Backblaze assembles whatever parts it is handed and only the size says they
were the right ones. A failed
multipart complete with no object behind it stays a 503 whatever the error,
`NoSuchUpload` included, because a second `complete` can arrive while the
first is still assembling a large file, and failing the row then would abort
a file that is landing.

`test/helpers/failB2CallsInsideTransactions.ts` makes the test fake fail any
Backblaze call made while a transaction is open, which is how that rule is
kept. Every multipart abort has the same shape: presign, `complete`, `retry`,
the commit's close and the sweep each change their rows first and abort after
the commit.

### One settle function, four callers

`settleUploadSession` runs the latch `UPDATE` from `data-models.md` verbatim,
and only the caller whose update changed the row detects bursts and enqueues
the email, in the same transaction. `complete` calls it on both outcomes,
`commit` once on either intent, presign when it cancels a duplicate, and
`upload-abandon-sweep` once per batch it fails files in. That is the whole of
"exactly one email": SQLite serialises writers, so two callers cannot both see
`changes() = 1`. A file retried after its batch settled lands silently, and
the `retry` response says so with `isIncludedInEmail: false`.

**Bursts form only among items whose `capture_source` is `exif` or
`video_metadata`** (design decision 16), the two rungs whose clock is the
device that took the picture. Every other rung's time is a name, a save time,
a typed day or the declare time, which every undated file in a batch shares,
so ten undated forwards would otherwise become one stack of ten. The filter is
the caller's; `detectBursts` itself is unchanged, and each burst records
`appConfig.burst.detectorVersion`.

### Commit says what it means

`POST .../commit` takes `{ intent: "arm" | "close" }` (design decision 17).
Keyed on the session's state alone, a double click on "Put 264 up", or a
retried commit whose answer was lost, would arm the batch with the first
request and close it with the second, cancelling every file before a byte
moved. So arming a batch already armed or settled, and closing one already
settled, answer `200` and write nothing; closing a draft, and anything on a
cancelled batch, is `409 upload_session_conflict`.

### Keys, attempts and derivatives

Keys are deterministic, `uploads/<sessionId>/<fileId>/<purpose>.<ext>`, so
`complete` recomputes a derivative's key rather than storing it, and
`upload_files.storage_key` holds the original's alone. Only an `original`
presign counts as an attempt, and a derivative is always a single PUT. A file
is `done` only when every rendition it reported has been verified, which is
the contract's rule that a `done` file's `media` is never null. `complete` is
strict about what it is handed: a multipart file's parts are exactly the ones
presign signed, 1 up to the part count, ascending, each once and each with an
ETag, the dimensions come both together or not at all, and no derivative is
over `appConfig.upload.derivatives.maxBytes` (10 MiB), a `400` before any
Backblaze call: a derivative's PUT URL cannot limit what is sent to it, so
`complete` is where the cap holds.

### The capture-date ladder

The browser declares evidence and the server picks the rung, so
`capture_source` is the server's own record of how a day was decided. A wall
clock with no offset resolves in `shoebox.timezone`, never in the uploader's
zone, and leaves `capture_offset_minutes` null so a guess stays
distinguishable from a fact. Rung 6 is the moment a file was declared, not the
commit time, because the ladder runs at declaration and `original_captured_at`
freezes the first time it does (design decision 12). The files that fell to
rung 4 or 6 are served as `UploadSessionDetail.undated`, so the surface can say
which ones did not say when they were taken.

**A machine's timestamp is an instant** (design decision 14). Rung 2, the
QuickTime `creation_time`, is UTC by specification and says when, not where,
so `captured_at` keeps it exactly, `capture_offset_minutes` is null, and
`capture_date` is its day in `shoebox.timezone`. Recorded as offset 0, a video
shot at 00:30 in Madrid would land on the day before and show its clock in
UTC. A Pixel's `PXL_` filename is a UTC stamp too and is read the same way;
every other camera name is a local wall clock. Rungs 2 and 4 accept only a
strict ISO-8601 instant, with a `Z` or an offset.

**An amendment moves the day and nothing else** (rung 5, decision 16). It
keeps the clock and the offset the ladder had found, so a photograph taken at
-04:00 stays at -04:00, except where the ladder invented the clock
(`file_mtime`, `upload_time`), which becomes noon on the chosen day.

### A duplicate is cancelled at presign

The manifest collapses two picks of one file only when it already knows their
hashes. Two unhashed entries with one name and size stay two rows, because a
name is never identity and they may be two photographs from two folders. When
they are one file, the duplicate shows at presign, whose hash another row of
the batch already holds. Presign finds that before any Backblaze call and
cancels the row in one short transaction that also runs the latch, with a
`problem_detail` naming the file that holds the bytes, then answers
`409 upload_file_conflict` with that file's id and `state: "cancelled"`
(design decision 15). Cancelled rather than failed, because a failed row shows
as a casualty with a retry that can never succeed, and terminal rather than
left `waiting`, because a waiting row holds the latch open until the sweep. The
browser skips the file and sends nothing else for it.

The same `409` with `state: "sending"` means something else: two presigns of
one file raced and this one lost. The row is already the winner's, which is
what a presign needs, so the browser presigns again.

### What a closed or abandoned row leaves in the bucket

A row cancelled by the commit's close, failed as `abandoned` by the sweep, or
failed by `complete` (the browser's report, or a mismatch the server found),
may already have bytes in the bucket: a single PUT that landed just before the
tab closed, or the derivatives sent ahead of the original. Nothing points at
them, so `enqueueOrphanedUploadObjects` queues the original's key and every
derivative key into `pending_object_deletions`, in the same transaction as the
state change, for `object-deletion-drain` to delete (design decision 18). A
multipart original is aborted and its key queued as well, because Backblaze
may have assembled the object before `complete` ran.

A retry can bring such a row back, and writes the same deterministic keys
again. So `retry` takes the file's keys back out of the queue in its own
transaction. Retry restoration and the deletion drain share an asynchronous
gate on the root database handle. The drain holds it through the Backblaze
delete and reloads each queued row by id after acquiring it, so a retry cannot
reuse a key while an earlier delete is in flight. The gate never holds a
SQLite transaction across network work. The drain checks each key with
`isStorageKeyInUse` before deleting it: a key an `item_renditions` row holds, or that
belongs to an upload row now `waiting` or `sending`, only loses its queue row.
A `done` row protects only its item's renditions. So `complete`, landing a
file, also queues the derivative keys it did not report, in its own
transaction: a derivative PUT that landed and was then dropped, or never
reported, has no rendition and nothing would ever delete it.

### The email restates the visibility rule

`enqueueUploadSessionEmails` finds every recipient at once: the batch's rules,
the candidates, and which rules each candidate sees through, three queries
however many members there are (`notifications.md` § Recipient resolution).
The third is **`getVisibleRuleIdsFromMemberId`'s predicate restated**,
correlated over every candidate instead of bound to one, because asking that
function once per member would be a query per member. So the two must agree:
a change to who can see a rule changes both files, or the email tells somebody
about photographs they cannot open, or misses somebody who can.

## Serving the web app

`src/web/staticSpa.ts` registers `@fastify/static` over the built web app and
installs the not-found handler:

- A request under `/api/` that matches no route gets a JSON 404.
- Anything else falls back to `index.html`, so a hard refresh on a client-side
  route works.

When the build output does not exist the static handler is skipped entirely and
everything returns a JSON 404. That is the normal case in development, where
Vite serves the app and proxies `/api` here, and in tests.

See [architecture.md](architecture.md#one-origin-one-deployment) for why the
server serves the SPA at all.

## Configuration

`src/config.ts` parses the environment with Zod and returns a validated
`Config`. Two details matter:

- It takes the environment as an argument rather than reading `process.env`, so
  tests can exercise it directly. `getConfig()` is the process-wide accessor
  that reads `process.env` once and caches.
- A failure reports **every** offending variable at once. Someone setting up an
  instance for the first time should not discover their mistakes one restart at
  a time.

Every variable is listed in [configuration.md](configuration.md).

## The request context

`src/http/requestContextHelpers.ts` decorates every request with `viewer`:
either undefined or a `Viewer` carrying the member, the session, the role and
the ids of the visibility rules that member may see through. An `onRequest`
hook fills it in, which is early enough that the rate limiter can read it, and
`requireViewer(request)` is what a handler calls to get a viewer or a
`401 not_signed_in`.

**That hook and the rate limiter are registered inside the `/api` scope**, not
on the root instance. The built SPA is served from the same origin, so a
signed-in browser sends the session cookie with every script, stylesheet and
font it asks for; an authenticator on the root instance would answer each of
those with a `sessions` join and a `visibility.generation` read, on a request
that has no viewer to use. Fastify hooks belong to the instance they are added
to, which is what confines them to the routes under `/api`.

`Viewer`'s shape is frozen by
[`conventions.md` § The request context](prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md),
which also says "assume it exists; do not design it". The authenticator is an
injected `createApp` dependency, and `src/auth/createAuthenticator.ts` is what
fills it: it resolves the cookie to a live session row on every request, slides
`sessions.last_used_at`, `sessions.expires_at` and `members.last_seen_at` at
most once a day each, and attaches the member's expanded `visibleRuleIds`.
Why it looks the session up every time, and what the slide costs and buys, is
[auth.md](auth.md).

One route must never call `requireViewer`: `DELETE /api/auth/session`.
`conventions.md` exempts signing out because it is idempotent, and telling
somebody who pressed "sign out" that they are not signed in has failed them
rather than informed them.

## Errors

Every failing route answers in one envelope: a stable `snake_case` `error` code
the client branches on, an English `message` that is never the interface copy,
and an optional `details` carrying structured data where a contract needs it:
`fieldErrors`, `retryAfterSeconds` and `attemptsRemaining`, and the upload
slice's `sessionId`, `fileId`, `state` and `clientRefs` (step 6a design,
decision 11). `conventions.md` § Errors owns the status table, the code
registry and every `details` field. `ApiError.conflict(code, details)` is the
constructor the upload slice's `409`s go through.
`src/http/ApiError.ts` carries that table as named constructors, so a handler
picks a refusal rather than a number.

The line those constructors exist to hold is the one most easily blurred:
**404 means you may not see it, 403 means you can see it and may not do it.**
A 404 for something that is hidden and a 404 for something that does not exist
are byte-identical on the wire, which is what stops a 403 confirming that
something exists at an id.

`src/http/registerErrorHandler.ts` translates whatever was thrown, in this order:

- An `ApiError` is already the answer and is used as it stands.
- **A `ZodError` becomes `400 invalid_request`**, its issues grouped by the
  field they came from into `details.fieldErrors`. A schema rejecting a request
  is the contract refusing it, not the server failing, and the client can put
  each message beside the input that earned it. Fastify's own JSON Schema
  validation errors are grouped into the same shape, so a handler validating
  either way answers identically.
- A framework 4xx the contract has no row for (a 405, a 413, a 415) collapses
  onto `400 invalid_request`, carrying the framework's own status in the
  `message` the caller receives, so a collapsed 413 stays diagnosable from the
  response itself rather than only from a log.
- **An unexpected error's own message never reaches the client.** Everything
  left over becomes `500 internal_error` with a fixed message, because a
  database error's text is a description of the schema.

It logs at `error` only for a 5xx. A 404 or a 429 is the contract working, and
a log line per rate-limited request is how a log becomes unreadable on the day
it matters.

## Rate limits

**Applied in the middleware, never in a handler**
(`conventions.md` § Rate limits). A route names the rules that apply to it in
its Fastify route config, and an authenticated route that names none gets
`authenticatedDefault`: 600 a minute per session.
`src/http/rateLimit/rateLimit.constants.ts` holds every row of that document
as a named rule, so the two tables can be checked against each other.

**One rule is an addition to that table rather than a transcription of it.**
`publicReadPerIp` is 120 a minute per IP, and it exists because
`administration.md` says `GET /api/public-settings` "takes the per-IP bucket"
while the only per-IP row in `conventions.md` is twenty an hour, a cap aimed at
how much sign-in mail somebody can send to an inbox. That route renders the
sign-in page's top bar, so twenty an hour would lock out anybody who reloaded a
slow page. The document's intent, that the anonymous read is capped, is kept;
its number, which was chosen for a different route, is not. The rule's own
docstring records this, the way `auth.md` records the shared address bucket.

**The upload-session routes have a bucket of their own.**
`uploadSessionPerSession` is 3,000 a minute per session, named by all twelve
routes in `routes/uploadSessions/` in place of the default. A file costs about
four calls (its presign, two derivative presigns, and `complete`), so the
mockup's 264-file batch is about 1,056 calls, and two lanes against a real
deployment, bounded by seven round trips a file, top out near 32 calls a
second, about 1,920 a minute. The default 600 would have stopped a large batch
on a fast link; 3,000 clears the fastest plausible batch by half again while
still capping a runaway client at 50 writes a second. The engine waits out a
`429` for its `retryAfterSeconds` rather than failing the file (`docs/web.md`).

The hook is `preHandler` rather than `onRequest`, because two of the rules key
on the address in the request body and the body is not parsed until after
`onRequest`. It is still middleware: a handler neither knows about a limit nor
can forget one.

Counters are **fixed windows in memory**. Fixed rather than a token bucket,
because `details.retryAfterSeconds` is a number printed to somebody who is
waiting and a fixed window has an exact one. In memory rather than in SQLite,
because the deployment is one Fly machine and a counter row per request would
put write contention on the one part of the system with a single writer. The
cost is that a restart forgets every count, which is the right trade when the
longest window is an hour.

One rule is not a counter. `invitationResendPerInvitation` reads
`invitations.last_sent_at` and counts `outbound_emails` rows, because
`conventions.md` says it does and because a restart forgetting that an
invitation went out a moment ago would send a second one, which tells the
recipient something about our uptime rather than about the Shoebox.

**`request.ip` has to be the caller's, or the per-IP rule inverts.** `fly.toml`
puts Fly's proxy in front of the app, so `app.ts` sets `trustProxy` to exactly
one hop in production and to `false` everywhere else. Without it every request
carries the proxy's address and the twenty-an-hour sign-in limit stops being one
bucket per caller and becomes one bucket for the whole instance: twenty attempts
from anybody at all would lock the family out of their own archive. One hop
rather than `true`, because `true` believes an arbitrary `X-Forwarded-For` chain
from anywhere, and off in development because nothing fronts `pnpm dev:server`.

**The per-IP bucket is the only place in the product an address is touched.**
It is a `Map` key that dies with the process, it is never written to the
database, and it never reaches a log line: `app.ts` replaces Fastify's request
serializer for the same reason (`data-models.md` § Privacy).

## Background jobs

`src/jobs/createJobRunner.ts` is a plain interval scheduler owned by `createApp`, which
is enough for a single-machine deployment. `src/jobs/createJobRegistry.ts` builds the
seven jobs `conventions.md` § The job runner names, in that document's order so
the two read side by side. What each one does is there; this is the cadence it
runs at here:

| Job                     | Cadence |
| ----------------------- | ------- |
| `session-sweep`         | hourly  |
| `invitation-lapse`      | hourly  |
| `sign-in-code-sweep`    | hourly  |
| `upload-abandon-sweep`  | 15 min  |
| `removal-reminder`      | hourly  |
| `object-deletion-drain` | 5 min   |
| `visibility-rule-sweep` | daily   |

The mail queue runs on the same runner at ten seconds and is deliberately
**not** among them: the seven are a closed set a slice can cite, and a cadence
in seconds is not one of them. It shares the runner only because the runner
already owns what a polling loop needs. See [mail.md](mail.md).

Four properties every job relies on:

- **No overlap.** A run still going when the next tick arrives skips that tick.
  SQLite has one writer, and a slow sweep queueing behind itself is how a hung
  job becomes a hung database.
- **A failure is a log line, not a dead schedule.** Every job is idempotent, so
  the next tick simply tries again.
- **Nothing runs at `start()`.** The first run of each job is one interval
  later, which keeps boot fast and lets a test that advances a clock say
  exactly what it means.
- **It stops with the app.** `createApp`'s `onClose` hook stops the runner and
  waits for whatever is in flight, and `index.ts` closes the app on `SIGTERM`
  before it closes the database, so no sweep is left querying a handle that is
  closing underneath it.

`upload-abandon-sweep` has both of its halves. The committed half takes each
batch idle past `appConfig.upload.abandonGraceMinutes` in a transaction of its
own: it fails the batch's in-flight files as `abandoned`, queues what they may
have left in the bucket, and settles the batch through the same
`settleUploadSession` every other caller uses. One transaction per batch, so a
batch that cannot settle rolls back alone and is found again next run while
the others settle. A file retried after its batch settled is the one in-flight
row a settled batch can hold; it is failed as `abandoned` once its own
`updated_at` is past the same grace (the batch's activity no longer speaks for
it), with its leftovers queued in the same transaction, and the latch is never
run for it, so nobody is mailed twice. The draft half cancels drafts older than
`appConfig.upload.draftExpiryHours`. Only then, outside any transaction, does
it abort every multipart upload a `failed` or `cancelled` row still holds,
this run's and any earlier abort that failed, here or in a route, because the
row keeps its `multipart_upload_id` until Backblaze has let go. An abort
answered `NoSuchUpload`, or a 404 that carries no S3 code at all (the SDK
names it `NotFound`), counts as let go: the upload is already gone, which is
the goal. A 404 naming any other code, `NoSuchBucket` for one, is a failed
abort, because the upload may still be open and billed.

`object-deletion-drain` now has three sources rather than one: an item
delete, the commit's close and the abandon sweep. The last two can queue a key
a retry has since brought back, so the drain checks each key against the
catalog immediately before deleting it (§ The upload slice).

`removal-reminder` selects open requests and active current recipients in one
immediate transaction and enqueues the due messages. Local calendar days in
the Shoebox timezone determine `week_index`, including DST boundaries. Week
zero is excluded; blind unique-key conflict-noop inserts permit hourly retries
without another weekly copy. No last-reminded state or catch-up is stored.
Settling stops future enqueues and leaves already queued messages unchanged.

## Database

SQLite through [Kysely](https://kysely.dev), with `better-sqlite3` underneath.

`createDatabase(path)` opens the file (creating its parent directory if
needed), enables write-ahead logging and foreign key enforcement, and returns a
`Kysely<Database>`. Pass `":memory:"` in tests. It also registers `create_id()`
as a SQLite user-defined function, so a set-based insert can mint its own
uuids: the first-sign-in seed writes one `item_views` row per existing item in
a single statement, and minting each id in application code would make that
thousands of round trips.

`src/db/runInImmediateTransaction.ts` is how a route takes SQLite's write lock
at the start of a transaction rather than at its first write, which Kysely's
own deferred `BEGIN` would do. Redeeming a sign-in code is the case that needs
it, and [auth.md](auth.md) says why.

`src/db/types/db.types.ts` declares the `Database` type: one property per
table, mapping a table name to its row shape. The row shapes themselves live
in one sibling file per table group, split the way the migrations are. Kysely type-checks every query against it, so it
has to be updated alongside each migration.
[tech-specs/data-models.md](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md)
is the specification the migrations implement, and it is the place to look for
what a table's columns actually mean; this section only says where the schema
lives and how its pieces fit, not what it contains, because keeping the
columns in two documents is one document and one lie.

It also declares `DatabaseExecutor`, the type a helper takes when it does not
care whether it is inside a transaction. It is `Kysely<Database>`, because a
Kysely transaction already is one; the alias is there so `enqueueEmail` and
`bumpVisibilityGeneration` say that in one place rather than each writing out
a union of a handle and a transaction.

### Migrations

Migrations live in `src/db/migrations/` as `NNNN_description.ts`, each
exporting a `Migration`, and are registered by hand in
`src/db/migrations/migrations.ts`. They are registered rather than discovered
from disk on purpose: the server runs TypeScript directly, so a
filesystem-scanning provider would behave differently in development and
inside the production container, and `migrate.ts`'s `Migrator` would have no
stable way to enumerate them the same way twice.

There are nine. The first seven match the sections `data-models.md` is
grouped into; the last two are corrections, which is what the "never edit a
shipped migration" rule below turns a correction into:

| Migration                      | Holds                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `0001_identity_and_access`     | Members, sign-in codes, sessions, invitations, groups                                                         |
| `0002_visibility`              | Visibility rules and their subjects                                                                           |
| `0003_archive`                 | Items and everything hung off one: renditions, bursts, milestones, tags, people                               |
| `0004_comments_and_reactions`  | Comments and the two reaction tables                                                                          |
| `0005_moderation`              | Removal requests                                                                                              |
| `0006_upload`                  | Upload sessions, files, batch edits, pending object deletions                                                 |
| `0007_operations_and_audit`    | Settings, outbound email, item views, activity events                                                         |
| `0008_missing_child_indexes`   | Two indexes 0003 should have carried: `bursts.upload_session_id` and `item_capture_date_changes.milestone_id` |
| `0009_open_request_needs_item` | `CHECK (state <> 'open' OR item_id IS NOT NULL)` on `removal_requests`, added by rebuilding the table         |

Thirty-three tables in total. Column-level detail belongs in
[`data-models.md`](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md),
not here.

Rules:

- Keep the zero-padded numeric prefix. Kysely orders migrations by key, and
  the registry in `migrations.ts` keys on the same string.
- **Never edit or reorder a migration that has already shipped.** Deployed
  databases have recorded it as applied and will not run it again, so a change
  to its body would silently diverge from what is actually on disk out there.
  A correction becomes a new migration.
- Update `src/db/types/` in the same change.

Run them with `pnpm migrate` locally. In production they run automatically at
startup.

**Where the `everyone` rule's id lives.** Migration 0002 seeds the `everyone`
visibility rule at a constant id, and that constant,
`EVERYONE_VISIBILITY_RULE_ID`, is declared in
`src/visibility/everyoneRule.ts`. The migration imports it from there, rather
than exporting it, so that runtime code never has to reach into a historical
migration file for a value. `visibility-rule-sweep` is the first runtime reader
of it: the sweep deletes unreferenced rules and must never delete this one,
however many items reference it, which on a fresh Shoebox is none. The value
itself never changed, so no database that has already applied 0002 diverges
from one that applies it now.

### `createId()`

`src/db/createId.ts` mints every primary key with `createId()`, which wraps
`uuidv7` package. UUIDv7 rather than v4 is load-bearing, not a style choice:
the first 48 bits are a Unix millisecond timestamp, so ids sort by creation
time, an insert lands at the end of a `PRIMARY KEY` index instead of
scattering across it, and three route cursors (the timeline, the activity
feed, the upload file list) page directly on the id with no second column to
break ties. `uuidv7` carries a sub-millisecond counter, which matters because
an upload commit can write several thousand rows inside one millisecond; a
plain timestamp-prefixed id with no counter would leave their order random
within that millisecond, and a cursor that relies on it would silently skip
rows.

### The schema oracle

`src/db/schemaIntrospectionHelpers.ts`, `schemaManifest.ts`, `schemaExpectations.ts`, and
`test/schema/` exist to keep this document, the `Database` type, and
the actual database from drifting apart.

`schemaIntrospectionHelpers.ts` reads the schema from a live database, not from migration
source: `sqlite_master`, `pragma_table_info`, `pragma_foreign_key_list`, and
`pragma_index_list`/`pragma_index_xinfo`. That is deliberate, and the reason is
specific: a migration that silently failed to apply, or was skipped, looks
identical in source to one that ran, but the two produce different databases.
Reading the source would assert that the migration file says what it says.
Reading the live database asserts that the file actually did what it says,
against a database each file under `test/schema/` builds by running
`migrateToLatest` for real.

`schemaManifest.ts` is the runtime counterpart of `src/db/types/`: every
table, every column, and three facts about each one, which are whether SQLite
enforces it as `NOT NULL`, the type it was declared with, and its `DEFAULT`
expression. Nullability is tied to the `Database` type by a mapped type, so
the two cannot disagree without a compile error; type and default ride
alongside, because a Kysely row type says nothing about either (`INTEGER` and
`REAL` are both `number`, and a default is invisible) and both are asserted
against the live database instead. All three are read rather than assumed for
the same reason: SQLite's affinity rules let `items.byte_size` change from
`INTEGER` to `TEXT` without a single query failing. It is a directory
module too, `schemaManifest/`, on the same table groups; each leaf
`satisfies Pick<SchemaManifestShape, ...>` so a wrong column still fails at
the column rather than as one error at the composition.

`schemaExpectations.ts` holds what the document promises for every foreign
key's delete rule (sixty-one of them, across twenty-eight tables), every index
a migration declared (sixty-three of those, with the columns each covers, the
direction each column sorts in, and whether it is unique), and the four
table-level `UNIQUE` constraints that are
written inside a `CREATE TABLE` and so never appear as an index at all
(`members.email`, `groups.name_normalized`, `tags.name_normalized`, and
`group_members (group_id, member_id)`). It is transcribed from
`data-models.md` rather than from the migrations, so that a migration
disagreeing with the document is what fails, not the other way around, and the
seven indexes the document does not list say in a comment which migration
added them and why. All three records are keyed by `keyof Database`, so a stale or
typo'd table name is a compile error rather than a silently dead entry.
It is a directory module, `schemaExpectations/`, holding one file per table
group split the way the migrations are, plus the shared `indexColumns`
helper. Its entry point composes the three records, and the
`Record<keyof Database, ...>` annotation there is what makes a dropped group
a compile error naming the tables it took with it.

`test/schema/` asserts all of it against the live database, in four files
split along what they assert: the migrated schema, every relationship, every
declared index, and the constraints. Each builds its own database, which costs
a few extra `migrateToLatest` runs and buys four files vitest can run in
parallel. It includes the check that a
partial index's `WHERE` predicate survived: several are load-bearing precisely
because they are partial, and a full index on the same columns would
type-check and silently change behavior. Column **direction** is asserted too,
which is why `readIndexes` reads `pragma_index_xinfo` rather than
`pragma_index_info`: only `xinfo` carries a `desc` flag, and eight of these
indexes are descending, `items_captured_on_rule_id` being the timeline's
primary sort. `schemaIntrospectionHelpers.ts` records the two limitations that remain, which
are expression indexes and the partial predicates `indexes.test.ts` reads
separately.

## Backblaze B2

`src/b2/client/client.ts` exposes a small client over B2's S3-compatible API:
`listObjects`, `presignGet`, `presignPut`, `presignMultipart` with the
`completeMultipart` and `abortMultipart` that make it usable, `signParts` for
fresh part URLs on an upload that is already open, `headObject`,
`deleteObject`, `putObject`, and `getBucketCors` and `putBucketCors`, which only
the setup command below calls. It is a factory returning an object rather than
a class, and it exposes only the operations Memory Shoebox needs, which keeps
it easy to fake in a test: `test/helpers/createFakeB2Client.ts` records every
call in order, and can be made unavailable, which is how a route's `503` is
reached.

**Media bytes never pass through the server**
([architecture.md](architecture.md#where-data-lives)), which is what confines
this interface to signing URLs the browser uses and deleting objects the
browser cannot. `putObject` is the one exception, and exists for small derived
files.

**`deleteObject` names no version, so on B2 it only hides the file.** The
bytes are freed only because the bucket keeps only the last version (the
lifecycle rule `daysFromHidingToDeleting: 1`, a required step of
[deployment.md](deployment.md#1-create-a-backblaze-b2-bucket)); without it
every delete `object-deletion-drain` makes would leave the object billed for
good.

**Every key is prefixed in one place, and that place is this client.** Each
operation that takes a key (`presignGet`, `presignPut`, `presignMultipart`,
`signParts`, `completeMultipart`, `abortMultipart`, `headObject`,
`deleteObject`, `putObject`) sends `<keyPrefix>/<key>` to Backblaze, and
`listObjects` lists only under `<keyPrefix>/` and hands the keys back without
it, applying a caller's own `prefix` inside. The CORS operations address the
bucket itself and are not prefixed. So test and production objects share one
bucket without ever sharing a key (`B2_KEY_PREFIX`, default `production` or
`test` by `NODE_ENV`: [configuration.md](configuration.md#test-and-production-share-a-bucket)),
while every key the rest of the server holds stays unprefixed: the catalog
stores it that way, `item_renditions` and the drain's in-use check compare it
that way, and the fake client records it that way. Nothing in `apps/server`
talks to S3 except through `createB2Client`, which is what makes one boundary
enough.

`presignGet` signs for the seven-day S3 maximum by default and sets a matching
`Cache-Control`, so a browser that has already downloaded a photo does not
download it again. The tradeoff is spelled out in
[architecture.md](architecture.md#where-data-lives): a presigned URL is a
bearer link for as long as it lives. An upload URL gets an hour instead,
`appConfig.upload.presignTtlSeconds`: a read URL is a bearer link to bytes that
already exist, and a write URL is permission to put new bytes in somebody's
bucket.

One setting is load-bearing rather than incidental. The client asks the SDK for
`requestChecksumCalculation: "WHEN_REQUIRED"`, because **a signed URL must not
assert a checksum for bytes the server never saw.** The default computes one at
signing time, when the only body in hand is the empty one, and bakes the CRC32
of nothing into every presigned PUT and every multipart part URL.

**The bucket needs a CORS rule, and the API does not.** The browser puts bytes
straight to Backblaze, whose origin is not the app's, so the bucket has to
allow `PUT`, `GET` and `HEAD` from the instance's `public.base_url` (and from
the Vite origin outside production), allow the `content-type` request header,
and expose `ETag`, without which the browser cannot read a part's ETag and a
multipart upload cannot complete. `pnpm b2:cors`
(`scripts/configureBucketCors/configureBucketCors.ts`) prints the bucket's current rules beside the
one it needs, and `--apply` adds it, keeping every rule already there, because
`PutBucketCors` replaces the whole set. If Backblaze refuses the read or the
write, it prints Backblaze's own answer and the `b2` command-line command that
sets the rule instead: the web console's CORS presets cannot express it. See
[deployment.md](deployment.md).

## Tests

Vitest unit tests live beside their modules in `apps/server/src/`. API and
cross-module integration suites live in `apps/server/test/`; split suites and
their exclusive fixtures use a module directory with `__tests__/`. The API
end-to-end lifecycle lives in `test/step7aApiLifecycle/`. The pattern is to build
the real app through
`createApp` with an in-memory database and drive it with `app.inject()`. No
network, no fixture files, no test database to clean up.

```sh
pnpm --filter @memory-shoebox/server test
```

## Conventions specific to this package

- **Relative imports must include the `.ts` extension.** Node's type stripping
  resolves them literally. oxlint enforces this for `apps/server/**` and for
  `packages/shared/**`, and forbids an extension under `apps/web`. The shared
  package is on that list because the server loads its TypeScript source at
  runtime, which is the same reason and not an exception to it.
  `packages/emails/**` writes the real `.ts` or `.tsx` extension for a third
  reason, which is that it compiles: see [emails.md](emails.md).
- **Anything imported from `@memory-shoebox/shared` at runtime must be plain,
  erasable TypeScript**, because the server loads that package's source under
  type stripping. Importing a schema to validate a request is routine and
  expected. See [shared.md](shared.md).
- Everything else follows the repository-wide rules in
  [`AGENTS.md`](../AGENTS.md) and [rules/typescript.md](rules/typescript.md).

## Removal requests

The five removal routes are registered by `registerRemovalRoutes`. Item paths
first apply normal item visibility, then the people tag gate for asks. Request
IDs instead use requester, snapshot uploader, or admin scope. Creates, declines,
and withdrawals use immediate transactions containing state, outbound mail, and
response reads. See [removals.md](removals.md) for history and recipient rules.
