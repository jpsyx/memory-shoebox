# Upload

Surface 8 and every server-side thing behind it: opening a batch, declaring the
manifest, presigning bytes straight to Backblaze, the persisted edit plan, the
capture-date ladder, resume, commit, ingest and settling. **Not here**: the
upload notification email's payload, copy or recipient resolution (agent H, and
its idempotency recipe is `upload:<session_id>:<member_id>`,
`data-models.md` § `outbound_emails`); milestone create, edit and delete
(agent G's `/api/milestones`, called by this surface but never redefined here);
any edit to an item after it exists, including `POST /api/items/:itemId/capture-date`
and per-item visibility (agent C); reading the timeline the upload lands in,
the pile, or a burst's siblings (agent B); the tag and people directories that
fill the bulk pickers' option lists with their counts (the slice that owns
`/api/tags` and `/api/people`).

## Routes

| Method   | Path                                                     | Auth    | Role                         | Purpose                                                      |
| -------- | -------------------------------------------------------- | ------- | ---------------------------- | ------------------------------------------------------------ |
| `POST`   | `/api/upload-sessions`                                   | session | uploader                     | Open a draft. One open batch per member.                     |
| `GET`    | `/api/upload-sessions/current`                           | session | uploader                     | The non-terminal session to pick up (Decision 15).           |
| `GET`    | `/api/upload-sessions/:sessionId`                        | session | uploader-of-session-or-admin | Progress, the day grouping, the edit plan, the done figures. |
| `PATCH`  | `/api/upload-sessions/:sessionId/manifest`               | session | uploader-of-session          | Declare or re-declare the files; the hash negotiation.       |
| `POST`   | `/api/upload-sessions/:sessionId/files/:fileId/presign`  | session | uploader-of-session          | Mint the URL the browser PUTs to Backblaze.                  |
| `POST`   | `/api/upload-sessions/:sessionId/files/:fileId/complete` | session | uploader-of-session          | End one file's transfer, either way; ingest; run the latch.  |
| `POST`   | `/api/upload-sessions/:sessionId/files/:fileId/retry`    | session | uploader-of-session          | Put one failed file back to `waiting`.                       |
| `PATCH`  | `/api/upload-sessions/:sessionId/visibility`             | session | uploader-of-session          | One rule for the whole batch.                                |
| `POST`   | `/api/upload-sessions/:sessionId/edits`                  | session | uploader-of-session          | One bulk action, as one row.                                 |
| `DELETE` | `/api/upload-sessions/:sessionId/edits/:editId`          | session | uploader-of-session          | Undo one bulk action.                                        |
| `POST`   | `/api/upload-sessions/:sessionId/commit`                 | session | uploader-of-session          | Arm the batch, or close it with what arrived.                |
| `DELETE` | `/api/upload-sessions/:sessionId`                        | session | uploader-of-session-or-admin | Cancel a draft.                                              |

`uploader-of-session` is the session's own `uploaded_by` and nobody else. An
admin reads and cancels (the two routes marked `-or-admin`) but does not write
another member's draft: the admin's absolute visibility is over the archive,
and a draft holds no items yet, so writing into one would attribute somebody
else's uploads to them. A non-owner on a write route gets the same 404 as a
nonexistent id.

## Upload sessions

#### `POST /api/upload-sessions`

**Surface** 8 `upload`, state `select`
**Auth** session required · **Role** uploader
**Request**

```ts
/** POST /api/upload-sessions */
type OpenUploadSessionRequest = {
  /**
   * Body. The browser's IANA zone. Recorded on
   * `upload_sessions.client_timezone` for diagnosis only: capture dates resolve
   * in `shoebox.timezone` (Decision 10), never in this. See Rulings.
   */
  clientTimezone: string;
};
```

**Response** `201` `UploadSessionDetail`
**Errors**

| Status | Code                      | When                                                                                                                                 |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`         | `clientTimezone` is not a resolvable IANA zone. `details.fieldErrors`.                                                               |
| 401    | `not_signed_in`           | No session, or an expired one.                                                                                                       |
| 403    | `upload_forbidden`        | Role is `viewer`. Uploading is an uploader capability (`PRODUCT.md` § Roles). Role only, and nothing here addresses an existing row. |
| 409    | `upload_session_conflict` | This member already has a `draft` or `uploading` session. `details.sessionId` names it and the client calls `GET /current`.          |

**Transformations** Inserts `state = 'draft'`, `visibility_rule_id` = the
`everyone` rule seeded at migration time with a constant id, so the default
costs no lookup (`data-models.md` § What that costs), `file_count = 0`,
`total_bytes = 0`, `last_activity_at = created_at`. No Backblaze call, no
object key reserved, no `items` row: **nothing in this route can leave a byte
in the bucket.**
**Performance** One insert plus one index probe for the conflict check on
`(uploaded_by, state)`, which `data-models.md` § Upload now declares and
migration 0006 builds.

#### `GET /api/upload-sessions/current`

**Surface** 8 `upload`, states `select`, `resume`
**Auth** session required · **Role** uploader
**Request** No path params, no query, no body.
**Response** `200` `UploadSessionDetail`, or `204` with no body when this
member has no open batch.
**Errors**

| Status | Code               | When              |
| ------ | ------------------ | ----------------- |
| 401    | `not_signed_in`    |                   |
| 403    | `upload_forbidden` | Role is `viewer`. |

**Transformations** `WHERE uploaded_by = :viewerMemberId AND state IN ('draft','uploading') ORDER BY created_at DESC LIMIT 1`.
Terminal is `settled` or `cancelled`; everything else is resumable
(Decision 15). Never another member's session, not even for an admin: resume is
per person and per browser. The body is byte-identical to
`GET /api/upload-sessions/:sessionId`, so one request gives the surface the
surviving edit plan, the visibility rule, the landed count and
`pendingFiles`, which is what lets it say "200 of your 264 are up. These 64 are
still to come" and list the filenames. The `204` is deliberate: "no batch in
flight" is the ordinary answer on every load of this surface and must not read
as an error, and 404 stays reserved for an addressed row.
**Performance** The same `(uploaded_by, state)` index. One row out.

#### `GET /api/upload-sessions/:sessionId`

**Surface** 8 `upload`, states `days`, `selection`, `tagged`, `people-tagged`,
`milestone-assigned`, `milestone-fix`, `resume`, `sending`, `partial`, `done`
**Auth** session required · **Role** uploader-of-session-or-admin
**Request**

```ts
/** GET /api/upload-sessions/:sessionId */
type UploadSessionDetailRequest = {
  /** Path */
  sessionId: string;
  /** Query. Page of the embedded file list. Default 100, server cap 500. */
  limit?: number;
  /** Query. Opaque; encodes `upload_files.position`, not the uuidv7 id. */
  cursor?: string;
  /**
   * Query. Comma-separated `UploadFileState` values, so the `partial` state can
   * fetch the two casualties without paging 264 rows. Omitted means every
   * state.
   */
  states?: string;
};
```

**Response** `200` `UploadSessionDetail`
**Errors**

| Status | Code                       | When                                                                                                                                                         |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`          | Unparseable `cursor`, `limit` over the cap, unknown value in `states`.                                                                                       |
| 401    | `not_signed_in`            |                                                                                                                                                              |
| 403    | `upload_forbidden`         | Role is `viewer`.                                                                                                                                            |
| 404    | `upload_session_not_found` | No such id, **or the session belongs to another member and the viewer is not an admin**. Byte-identical in both cases: same status, same code, same message. |

**Transformations**

- `progress` is a `GROUP BY state` over at most a few hundred rows on
  `(upload_session_id, state)`. There are no `done_count`, `failed_count` or
  `bytes_transferred` columns and none may be added
  (`data-models.md` § `upload_sessions`).
- `progress.doneBytes` is `SUM(declared_bytes) WHERE state = 'done'`. It is not
  the bytes on the wire: the server never sees a partial transfer, so the
  in-flight percentage the `sending` state draws per row is a browser-local
  upload-progress event and is never posted back. The figure the server serves
  is "1.4 GB of 5.2 GB", whole files only.
- `days` groups the manifest by `upload_files.capture_date`, which is where each
  file will land in the archive. Before ingest a day's milestones come from the
  **edit plan** (kind `milestone` edits whose targets fall on that day); after
  ingest they come from `item_milestones`. The list is returned whole; picking
  one band per day is Decision 14 and belongs to the timeline, not here.
- `edits` excludes rows with `undone_at` set. Each carries `targetCount`, which
  is the "on 12 of 264" figure.
- `mismatches` is the `milestone-fix` state: for every kind `milestone` edit,
  the target files whose `capture_date` falls outside the milestone's
  `[starts_on, ends_on]`. Pre-ingest there is no `item_milestones` row yet, so
  there is nothing to acknowledge and `span_mismatch_acknowledged_at` is not
  involved.
- `undated` is the group of files the ladder dated by `file_mtime` or
  `upload_time`, and `null` when there are none. Proposed under Additions
  requested, and served since step 6a (its design's decision 9).
- `summary` is non-null once `settled_at` is set, and is the whole of the `done`
  state: `itemCount` = `COUNT(*) WHERE state = 'done'`; `dayCount` =
  `COUNT(DISTINCT captured_on)` over this session's items; `milestoneCount` =
  `COUNT(DISTINCT milestone_id)` over `item_milestones` joined to them;
  `burstCount` and `burstFrameCount` over `bursts WHERE upload_session_id = ?`;
  `notifiedMemberCount` read from the session's stored column. **Every one of
  those is a `GROUP BY` over a few hundred rows, computed on read.**
- `media` on a file row is `null` until ingest produces renditions, which is
  also the honest answer on resume: the browser no longer holds the `File`, so a
  landed file has no thumbnail of its own to draw until it is an item.
- Counts in this slice are over the session's own rows, and a session is only
  ever read by its uploader or an admin, both of whom see all of it, so the
  viewer filter is a no-op here. `notifiedMemberCount` is a record of what was
  sent, not an item count, which is why it may be a stored column at all.

**Performance** `(upload_session_id, state)` for the progress aggregate and the
`states` filter; `UNIQUE (upload_session_id, position)` for the page and the
cursor. Renditions for the page's items are **one batched query keyed by the
page's item ids**, never one join per file (`data-models.md` § `item_renditions`),
and the signed URLs are minted in that one pass. The day grouping is one
aggregate, not a loop over days. The edit plan is two queries (edits, then
target counts grouped by edit id), never one per edit.

#### `POST /api/upload-sessions/:sessionId/commit`

**Surface** 8 `upload`, states `days`, `selection`, `visibility`, `resume`
**Auth** session required · **Role** uploader-of-session
**Request**

```ts
/** POST /api/upload-sessions/:sessionId/commit */
type CommitUploadSessionRequest = {
  /** Path */
  sessionId: string;
  /**
   * Body. What the caller means: "arm" is "Put 264 up", and "close" is "Send
   * what did arrive". Added in step 6a (its design's decision 17).
   */
  intent: "arm" | "close";
};
```

**Response** `200` `UploadSessionDetail`
**Errors**

| Status | Code                       | When                                                                                                                         |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`          | No `intent`, or one that is neither `arm` nor `close`. `details.fieldErrors`.                                                |
| 401    | `not_signed_in`            |                                                                                                                              |
| 403    | `upload_forbidden`         | Role is `viewer`.                                                                                                            |
| 404    | `upload_session_not_found` | No such id, **or not this member's session** (an admin included, since this is a write). Byte-identical.                     |
| 400    | `upload_session_empty`     | On `arm`, every manifest row is `refused`, or the manifest is empty. Committing would latch at once and email about nothing. |
| 409    | `upload_session_conflict`  | `close` on a `draft`, which has nothing in flight to close, or either intent on a `cancelled` session.                       |

**Transformations** One route, two meanings, **keyed on the body's `intent`**
(step 6a design, decision 17). This first said "keyed on state", and that is
unsafe: a double click on "Put 264 up", or a client retrying a commit whose
answer was lost, would find an `uploading` batch and close it, cancelling every
file before a byte had moved. **A repeat of what already happened answers
`200` with the detail and writes nothing**: `arm` on an `uploading` or
`settled` batch, and `close` on a `settled` one.

- **`arm` on a `draft`** ("Put 264 up"), in one transaction: `committed_at = now`,
  `state = 'uploading'`, `file_count` = the manifest's row count,
  `total_bytes` = `SUM(declared_bytes)` over the rows that are not `refused`.
  This is the moment the edit plan and the visibility rule freeze: `POST /edits`,
  `DELETE /edits/:editId` and `PATCH /visibility` all refuse afterwards, so file
  1 and file 264 cannot ingest under two different plans. It is also the moment
  `presign` starts working, which is the whole point of `committed_at IS NOT NULL`
  in the latch: a draft can never settle and can never send an email.
- **`close` on an `uploading` session** ("Send what did arrive", the quieter
  of the two buttons on the `resume` state): every `waiting` and `sending` row
  becomes `cancelled` with `problem_code = 'cancelled_by_uploader'`, then the
  latch runs once. That closes the batch at 200 and sends one email about
  those, and the remaining 64 would be a second session and a second email.
- **What those rows may have left in the bucket is queued for deletion**, in
  the same transaction (step 6a design, decision 18): a single PUT that landed
  just before the tab closed, or derivatives sent ahead of the original.
  Nothing else would ever point at them. Every such row holding a
  `storage_key` and no item has its original key and each derivative key
  enqueued into `pending_object_deletions`, and its multipart upload, if any,
  is aborted after the commit. Deleting a key that never landed is harmless.

**Performance** Three statements plus the latch. The cancel is one
`UPDATE ... WHERE upload_session_id = ? AND state IN ('waiting','sending')` on
`(upload_session_id, state)`, never a loop over files, and the deletion queue
is one multi-row insert.

#### `DELETE /api/upload-sessions/:sessionId`

**Surface** 8 `upload`, states `select`, `days`, `selection` (the Cancel button)
**Auth** session required · **Role** uploader-of-session-or-admin
**Request** Path `sessionId`. No body.
**Response** `204`, no body: there is genuinely nothing to return.
**Errors**

| Status | Code                       | When                                                                                                                                                                                                                                                                                                              |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`            |                                                                                                                                                                                                                                                                                                                   |
| 403    | `upload_forbidden`         | Role is `viewer`.                                                                                                                                                                                                                                                                                                 |
| 404    | `upload_session_not_found` | No such id, or another member's session and the viewer is not an admin. Byte-identical.                                                                                                                                                                                                                           |
| 409    | `upload_session_conflict`  | `committed_at IS NOT NULL`. A committed batch has live items already, and deleting the session would `SET NULL` on `items.upload_session_id` and orphan them while the email never fires. `details.sessionId` and the advice: `POST /commit` to close it, then agent C's item delete for anything that should go. |

**Transformations** Sets `state = 'cancelled'` on the session and `cancelled` on
every non-terminal file. The rows stay: they are the record that the attempt
happened, and `upload_files` is where the original filename and the transfer
outcome live. Nothing is enqueued into `pending_object_deletions`, because a
draft cannot have a `storage_key`: presign refuses before commit, so **cancelling
a draft costs nothing in Backblaze.** A milestone created during the draft
survives, by design: its row was written the moment it was named, and an empty
milestone is a designed state (`data-models.md` § `upload_batch_edits`). No tag
and no person survives, because neither was ever written.
Cancelling a draft that is already cancelled changes nothing and still answers
`204`.
**Performance** Two updates. `GET /current` stops returning it because
`cancelled` is terminal.

## The manifest

### Why a file is not an item

`upload_files` is separate from `items` on purpose and this slice depends on it
absolutely. A refused PDF and a file that never arrived are never items. **Do
not propose an `items.state` column**: it would put `AND state = 'ready'` into
every read query in the product, where one missed predicate leaks a
half-uploaded photograph into a timeline whose entire job is to hide things
reliably (`data-models.md` § `upload_files`). An item exists only after its bytes
are in the bucket, and until then the only row is a manifest row.

### The hash negotiation

- `contentHash` is the lowercase hex SHA-256 of the file's bytes, computed in
  the browser (WebCrypto over a stream, in a worker, so 5.2 GB does not block
  the page).
- It is **optional at manifest and required at presign.** That is the whole
  trick: the only rows resume needs to match are the ones that landed, and
  landing requires a presign, so every landed row has a hash whether or not the
  first manifest carried one.
- Matching, per entry, in order: by `content_hash` against this session, which
  is one probe on `UNIQUE (upload_session_id, content_hash) WHERE content_hash IS NOT NULL`.
  A hit on a `done` row is `already_done` and the client skips it rather than
  re-sending. A hit on a non-terminal row is `matched`.
- Only then, for an entry with no hash match, by `original_filename` plus
  `declared_bytes` against a non-terminal row that has no hash. That is safe
  precisely because such a row has never sent a byte, so the worst case is a
  duplicate row that then gets its own hash. Each entry claims at most one
  row, so a body sent again matches the rows it made.
- **A `refused` row matches by name and size too**, when the declared type is
  also the same, because the type is what it was refused for (step 6a). It
  reports `refused`, with the row's state and problem code, and is never
  changed and never a conflict, so a resume that re-declares the refused PDF
  succeeds rather than failing the whole request after commit.
- **Names are never identity.** The mockup's promise, "we know the 200 that
  landed by what is in them rather than by their names, so choosing all 264
  sends only the ones that are actually missing", is exactly this order.
- The same file selected twice in one batch (once by drag, once by the picker)
  collapses to one row and reports `matched` **when the entries carry its
  hash**. Two entries with no hash and one name and size stay two rows (step
  6a): they may be two photographs from two folders, and a name is never
  identity. When they are one file, presign finds it once the hashes are known
  and cancels the copy (§ `POST .../presign`).

#### `PATCH /api/upload-sessions/:sessionId/manifest`

**Surface** 8 `upload`, states `days`, `milestone-fix`, `resume`
**Auth** session required · **Role** uploader-of-session
**Request**

```ts
/** PATCH /api/upload-sessions/:sessionId/manifest */
type PutUploadManifestRequest = {
  /** Path */
  sessionId: string;
  /**
   * Body. At most 500 entries per call; the manifest is additive, so a 2,000
   * file selection arrives in four calls.
   */
  files: ManifestEntry[];
};
```

**Response** `200` `PutUploadManifestResponse`
**Errors**

| Status | Code                       | When                                                                                                                                                         |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`          | Over 500 entries, a negative `declaredBytes`, a malformed hash, a `capturedAt` that is not ISO-8601, two entries naming one `fileId`. `details.fieldErrors`. |
| 401    | `not_signed_in`            |                                                                                                                                                              |
| 403    | `upload_forbidden`         | Role is `viewer`.                                                                                                                                            |
| 404    | `upload_session_not_found` | No such id, or not this member's session (an admin included). Byte-identical.                                                                                |
| 404    | `upload_file_not_found`    | An entry names a `fileId` that is not in this session. Byte-identical to a nonexistent id.                                                                   |
| 409    | `upload_manifest_conflict` | After commit: an entry that matches nothing (a new file), or an amended capture date on a row that is not `waiting`. `details.clientRefs` lists them.        |
| 409    | `upload_session_conflict`  | The session is `settled` or `cancelled`.                                                                                                                     |

**Transformations**

- **Idempotent, additive and never destructive.** A request naming four of the
  session's 264 files leaves the other 260 exactly as they are. It is `PATCH`
  rather than `PUT` for exactly that reason: it is a reconciliation of what the
  batch contains, not a replacement, because the rows a replacement would drop
  may have bytes in the bucket behind them. Sending the same body repeatedly
  has the same effect, so it is idempotent without being a `PUT`.
- Entries are matched by the order in "The hash negotiation" above, or directly
  by `fileId` when the client is amending a row it already knows.
- A new row gets `position` = the next free ordinal, counting from 1
  (`UNIQUE (upload_session_id, position)`), `state = 'waiting'`,
  `attempt_count = 0`.
- **Refusal happens here, before any byte moves.** A `declaredContentType`
  outside `appConfig.upload.acceptedContentTypes`, a zero-byte file, or one over
  `appConfig.upload.maxFileBytes` produces a row in state `refused` with
  `problem_code = 'unsupported_type'`, `'empty_file'` or `'too_large'`. The PDF in
  the mockup is refused at this point, which is why it never gets a presign and
  never occupies a byte of anybody's bucket. `refused` is terminal, so it counts
  toward the settle latch and a batch carrying one still settles and still sends.
- **The `milestone-fix` state writes through this route**, addressing its four
  entries by `fileId` and carrying `capturedAt`. It sets `capture_date`,
  `captured_at` and `capture_source = 'uploader_set'` on `upload_files` **and
  nothing else**. It is pre-ingest, so there is no item, no
  `item_capture_date_changes` row and nothing destroyed: the file's declared date
  has never been committed to the archive. **It is not the same operation as
  agent C's `POST /api/items/:itemId/capture-date`** (which audits a real item's
  date and can eject it from its burst) **and it is not agent G's milestone
  reconcile.** The other branch of that state, "Widen the occasion to cover
  them", is one `PATCH /api/milestones/:milestoneId` (agent G) and touches no
  file row at all.
- **Preserve the clock time and change only the date** when amending, so a 06:41
  photograph becomes 06:41 on the new day and no fact is invented
  (`data-models.md` § `item_capture_date_changes`). A multi-day occasion asks per
  file which of its days, which is why each entry carries its own `capturedAt`
  rather than the batch carrying one date. Step 6a refines it: the offset the
  ladder found is kept with the clock, so a photograph taken at -04:00 stays
  at -04:00, and a clock the ladder invented (`file_mtime`, `upload_time`) is
  not kept, because no photograph was taken then; that file gets noon on the
  chosen day (its design's decision 16).
- After commit the manifest is closed to new files: extra files re-selected on
  resume that match nothing belong to a new session, because `file_count` and
  `total_bytes` are the figures the batch already committed to.
- `totalBytes` in the response excludes `refused` rows.

**Performance** One probe per entry on the hash index and one on the filename
fallback, then **one multi-row insert and one multi-row update**, never a
statement per file. 500 entries is one transaction; SQLite has a single writer,
so the batching matters more than the probe count.

### The capture-date ladder

Run by the server over the evidence each entry declares, because
`capture_source` has to be the server's own record of how a day was decided
(`data-models.md` § `items`: "Which day a photograph lands on is user-visible, so
how it was decided has to be recoverable"). The browser supplies evidence, never
the verdict.

| Rung | Evidence                                                                          | `capture_source` | Offset                   |
| ---- | --------------------------------------------------------------------------------- | ---------------- | ------------------------ |
| 1    | EXIF `DateTimeOriginal` with `OffsetTimeOriginal`                                 | `exif`           | The one the file carried |
| 2    | QuickTime/MP4 `creation_time`, which is UTC by specification                      | `video_metadata` | **null**                 |
| 3    | A filename pattern (`IMG_20260914_064132`, `PXL_`, `VID_`, `IMG-20260914-WA0001`) | `filename`       | **null**                 |
| 4    | The File API's `lastModified`                                                     | `file_mtime`     | **null**                 |
| 5    | The uploader saying so                                                            | `uploader_set`   | Kept, or **null**        |
| 6    | The moment the file was declared                                                  | `upload_time`    | **null**                 |

- EXIF `DateTimeOriginal` **without** an offset is a wall clock with no zone. It
  stays rung 1 for provenance, and the instant is resolved the same way rungs 3
  to 6 are.
- **With no offset available, resolve in `shoebox.timezone`** (Decision 10), not
  in UTC and not in `upload_sessions.client_timezone`, and leave
  `capture_offset_minutes` **null** so the guess stays distinguishable from a
  fact. The alternative makes the day a file lands on depend on where the
  uploader was standing, so the same file uploaded by two people could land on
  two different days.
- Rung 2 rejects implausible values: the QuickTime 1904 epoch, a Unix zero, and
  anything beyond a small skew into the future. A rejected value falls through
  to rung 3. Rungs 2 and 4 accept only a strict ISO-8601 instant, with a `Z` or
  an offset.

What step 6a built differs from the table as first written in four places,
each recorded in its design:

- **Rung 2 is an instant, not a local time** (decision 14). `creation_time`
  says when and not where, so `captured_at` keeps it exactly,
  `capture_offset_minutes` is **null**, and `capture_date` is its day in
  `shoebox.timezone`. Recorded as offset 0, as this table first had it, a
  video shot at 00:30 in Madrid would land on the day before.
- **A Pixel's `PXL_` name is a UTC stamp** (decision 16), so rung 3 reads it
  as an instant the way rung 2 reads a video, with its day in
  `shoebox.timezone`. `IMG_` and `VID_` names are the camera's local wall
  clock, and a WhatsApp name, which carries a day and no time, gets noon.
- **Rung 5 keeps the offset it found** (decision 16): an amendment moves the
  day and keeps the clock and the offset of the result it amends, or null
  where that had none. See the `milestone-fix` amendment above.
- **Rung 6 is the moment the file was declared**, not the commit time
  (decision 12). The ladder runs at declaration, which is before commit, and
  `original_captured_at` freezes the first time it runs, so the commit time is
  not yet known when it is needed.
- `capture_date` (the local `YYYY-MM-DD`) is derived at write, never computed at
  read: `date(captured_at)` in UTC puts a 23:30 local photograph on the wrong day
  and therefore under the wrong milestone.
- **The gap the data model flags**: there is no rung-5 affordance on the surface.
  The days list groups by capture date and has no group for "these did not say
  when they were taken", so a WhatsApp forward with no EXIF, no usable filename
  and a `lastModified` of the moment it was saved is silently filed under today
  and nobody will ever notice. The proposed contract for it is in Additions
  requested; the DTO is `UploadUndatedGroup` and it needs no new table. Step 6a
  serves it, and step 7b's surface draws it.

## The transfer

### The sequence, which the mockup does not show

**The browser PUTs the bytes straight to Backblaze. The server never proxies a
file** (`architecture.md` § Where data lives). What follows is the whole of it.

1. `POST /commit` with `intent: "arm"`. Before this, `presign` refuses, so a
   draft can leave nothing in the bucket.
2. The client picks the next file, computes its hash if it has not already, and
   calls `POST .../presign` with the hash and the byte size. It runs
   `appConfig.upload.maxParallelTransfers` of these at a time (a client-side
   cap, 2 by default: step 6a's spike measured 4 buying a phone nothing),
   because 264 concurrent completes would serialise on SQLite's single writer for
   no gain.
3. The server writes `content_hash` and `storage_key`, chooses single PUT or
   multipart by `declared_bytes` against `upload.multipart_threshold_bytes`, mints
   the URL or the part URLs through Backblaze's S3-compatible API, writes
   `presigned_until` and `multipart_upload_id`, increments `attempt_count` for an
   original (a derivative rides the original's attempt), sets
   `state = 'sending'` and bumps `last_activity_at`.
4. The browser PUTs to Backblaze. Per-file progress is an upload-progress event
   in the browser and is **never posted back**, which is why there is no
   `bytes_transferred` column and why the server's `sending` figure counts whole
   files.
5. On success the client calls `POST .../complete` with `outcome: "done"`, the
   part ETags when multipart, and the intrinsic facts it read from the file
   (post-orientation width and height, duration). The server finalises with
   Backblaze, sets `state = 'done'`, **ingests the item**, and runs the latch.
6. On failure the client calls the same route with `outcome: "failed"` and a
   problem code. The server sets `state = 'failed'` and runs the latch. A batch
   that half-worked must never read as a batch that failed, and a failure is a
   terminal state, so the other 262 settle and send.
7. A client that vanishes calls neither. That case is `upload-abandon-sweep`,
   below, and it is the single most important piece of upload plumbing the mockup
   does not show.

**Rate limits.** Every route in this slice draws on one bucket of its own,
3,000 calls a minute per session, in place of the blanket 600
(`conventions.md` § Rate limits): a file costs about four calls, so a large
batch on a fast link would outrun the blanket figure. The client waits out a
`429` for its `details.retryAfterSeconds` and spends no retry on it.

**When a presigned URL expires mid-transfer.** Backblaze answers `403` with
`Request has expired` and nothing is written server-side, so the row is still
`sending` with a stale `presigned_until`.

- The client calls `POST .../presign` again for the same `fileId`. This is not a
  retry: `retry` is only for a row that has already reached `failed`.
- For a **single** PUT the whole transfer restarts, which is why
  `upload.multipart_threshold_bytes` is set low enough that the mockup's 184 MB
  video is multipart.
- For **multipart** the server returns the same `multipartUploadId` and fresh
  URLs only for the part numbers the client asks for, so an expiry costs one
  part, not 184 MB.
- `presignedUntil` is advisory and the client should re-presign when the
  remaining lifetime is shorter than the time its current part needs, rather than
  waiting for the 403. `upload.presign_ttl_seconds` (default 3600) is chosen so
  one part at a plausible floor rate fits inside it.

`docs/server.md`'s B2 client exposes the operations this slice needs, under its
own names: `presignPut` for the single PUT, and `presignMultipart`, which opens
the upload and signs its parts in one call, with the `completeMultipart` and
`abortMultipart` that finish it either way. Step 6a added `headObject`, and
`signParts`, because a re-presign must keep its `multipartUploadId` and
`presignMultipart` always opens a new upload (its design's decision 6). All of
them are control-plane calls: none of them moves a byte through the server.

#### `POST /api/upload-sessions/:sessionId/files/:fileId/presign`

**Surface** 8 `upload`, state `sending`
**Auth** session required · **Role** uploader-of-session
**Request**

```ts
/** POST /api/upload-sessions/:sessionId/files/:fileId/presign */
type PresignUploadFileRequest = {
  /** Path */
  sessionId: string;
  /** Path */
  fileId: string;
  /** Body. Required here even when the manifest omitted it. */
  contentHash: string;
  /** Body. Must equal the row's `declared_bytes`. */
  byteSize: number;
  /**
   * Body. Default "original". See Rulings on who makes the derivatives.
   */
  purpose?: RenditionPurpose;
  /**
   * Body. Multipart only: the parts still wanted. Omitted means all of them.
   */
  partNumbers?: number[];
};
```

**Response** `200` `PresignUploadFileResponse`
**Errors**

| Status | Code                         | When                                                                                                                                                                                                               |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`            | `byteSize` disagrees with `declared_bytes`, malformed hash, a part number outside the range.                                                                                                                       |
| 401    | `not_signed_in`              |                                                                                                                                                                                                                    |
| 403    | `upload_forbidden`           | Role is `viewer`.                                                                                                                                                                                                  |
| 404    | `upload_session_not_found`   | No such session, or not this member's. Byte-identical to a nonexistent id.                                                                                                                                         |
| 404    | `upload_file_not_found`      | No such file, or it belongs to another session. Byte-identical.                                                                                                                                                    |
| 409    | `upload_session_conflict`    | `committed_at IS NULL`. **No byte may move before commit.** Also when the session is `cancelled`.                                                                                                                  |
| 409    | `upload_file_conflict`       | The row is `done`, `failed`, `refused` or `cancelled`. `details.state` says which. A `failed` row is retried first.                                                                                                |
| 409    | `upload_file_conflict`       | The hash collides with a different row in this session (`UNIQUE (upload_session_id, content_hash)`). **This row is cancelled**: see below. `details.fileId` names the holder and `details.state` is `"cancelled"`. |
| 409    | `upload_file_conflict`       | Another presign of the same file won a race, and `details.state` is `"sending"`. The row is the winner's, which is what a presign needs, so the client presigns again rather than skipping or failing the file.    |
| 503    | `upload_storage_unavailable` | Backblaze refused or timed out. Nothing is written; the client backs off and calls again.                                                                                                                          |

**A duplicate is cancelled, not failed** (step 6a design, decision 15). The
manifest can only collapse two picks of one file when it knows their hashes,
so a duplicate declared without one shows here. Presign finds the holder
before any Backblaze call and cancels this row in one short transaction that
also runs the latch, with a `problem_detail` naming the file that holds the
bytes and `problem_code` left null. A `failed` row would show as a casualty
with a retry that can never succeed, and a row left `waiting` would hold the
latch open until the sweep. The client sends nothing else for the file.

**Transformations** Writes `content_hash` when the row lacks one. Mints
`storage_key` on first presign as `uploads/<sessionId>/<fileId>/<purpose>` with
the extension the declared type implies, and keeps it: `UNIQUE (storage_key)`
holds on `upload_files`, and the same object becomes the `original`
`item_renditions` row at ingest, so a double upload cannot point two rows at one
object and make deletion ambiguous. **The key is never in a payload**
(conventions § Forbidden). The presigned URL necessarily embeds the object path
and that is the one unavoidable exposure; there is no separate field for it.
`attempt_count` increments on every `original` presign and never on a
derivative's, so a file with three derivatives does not read as four attempts
(step 6a design, decision 3). `presigned_until` is written, and
`state` becomes `sending`. A derivative's presign writes nothing on the row,
needs the original presigned first, and is always a single PUT at its
deterministic key, `uploads/<sessionId>/<fileId>/<purpose>.jpg`. A multipart
upload this call opened and then could not record, because the row lost a race
or turned out a duplicate, is aborted after the write.
**Performance** One row read, one row update, one or `partCount` Backblaze
signing operations, which are local HMAC work and touch no network for the
single case. `createMultipartUpload` is one API call, made once per file and
reused by every re-presign.

#### `POST /api/upload-sessions/:sessionId/files/:fileId/complete`

**Surface** 8 `upload`, states `sending`, `partial`, `done`
**Auth** session required · **Role** uploader-of-session
**Request**

```ts
/** POST /api/upload-sessions/:sessionId/files/:fileId/complete */
/**
 * One derivative the client produced and transferred alongside the original.
 *
 * Named rather than inline because both halves of the build import it:
 * `docs/rules/typescript.md` extracts any object of four properties or more,
 * and an anonymous shape here becomes two differently named copies in
 * `packages/shared`.
 */
type UploadedRendition = {
  purpose: RenditionPurpose;
  byteSize: number;
  /** Post-orientation, like the parent's. */
  width: number | null;
  height: number | null;
};

type CompleteUploadFileRequest = {
  /** Path */
  sessionId: string;
  /** Path */
  fileId: string;
  /**
   * Body. The transfer is over either way; the client is the only party that
   * can know it dropped.
   */
  outcome: "done" | "failed";
  /** Body, `done` only. Must match the row. */
  contentHash?: string;
  byteSize?: number;
  /** Body, `done` and multipart only, in part order. */
  parts?: { partNumber: number; etag: string }[];
  /**
   * Body, `done` only. Post-orientation, which is the whole point: raw EXIF
   * dimensions on a portrait phone photograph give the pile a landscape box
   * with a rotated image in it.
   */
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  /**
   * Body, `done` only. Every rendition that landed, when the client made
   * derivatives.
   */
  renditions?: UploadedRendition[];
  /** Body, `failed` only. */
  problemCode?: UploadProblemCode | null;
  problemDetail?: string | null;
};
```

**Response** `200` `CompleteUploadFileResponse`
**Errors**

| Status | Code                         | When                                                                                                                                                                                                   |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`            | `outcome: "done"` with no `contentHash`; a multipart file whose `parts` are not exactly the ones presign signed; only one of `width` and `height`; a `problemCode` the browser may not report (below). |
| 401    | `not_signed_in`              |                                                                                                                                                                                                        |
| 403    | `upload_forbidden`           | Role is `viewer`.                                                                                                                                                                                      |
| 404    | `upload_session_not_found`   | No such session, or not this member's. Byte-identical.                                                                                                                                                 |
| 404    | `upload_file_not_found`      | No such file, or another session's. Byte-identical.                                                                                                                                                    |
| 409    | `upload_file_conflict`       | The row is already terminal. A repeat of a `done` call with the same hash is **idempotent** and returns `200`; anything else conflicts. Also `outcome: "done"` on a `waiting` row, never presigned.    |
| 409    | `upload_file_conflict`       | `contentHash` or `byteSize` disagrees with what was presigned; the row goes `failed` with `problem_code = 'checksum_mismatch'`.                                                                        |
| 409    | `upload_file_conflict`       | The bucket disagrees with the report, for good: the row goes `failed` with `problem_code = 'content_mismatch'`, and `details.state` is `"failed"`. See below.                                          |
| 503    | `upload_storage_unavailable` | `completeMultipartUpload` or `headObject` failed. The row stays `sending` and the client calls again.                                                                                                  |

**What step 6a made strict, and why** (its design's decisions 2 and 3, and the
review of `complete` that followed):

- **The parts are exactly the ones presign signed**: 1 up to the file's part
  count, ascending, each once, each with a non-empty ETag. Anything else could
  only make Backblaze assemble a different object from the one declared.
- **The dimensions come both together or not at all**, from the call or else
  from the manifest. A width measured one way beside a height measured another
  is a size nothing has.
- **`content_mismatch` is anything the bucket says that no retry can change**:
  an original or a reported derivative missing or at the wrong size, a
  multipart upload Backblaze refuses for good (`InvalidPart`,
  `InvalidPartOrder`, `EntityTooSmall`), or one whose complete failed but
  whose object is there at the wrong size. A derivative the browser reported
  and Backblaze does not hold fails the whole file, because the browser said
  it was there.
- **A failed multipart complete with no object behind it stays a `503`**,
  whatever the error, `NoSuchUpload` included. A second `complete` can arrive
  while the first is still assembling a large file, after Backblaze has
  consumed the upload id and before the object exists, and failing the row
  then would abort a file that is landing. One whose object is whole was
  finished by an earlier call whose answer was lost, and counts as done.
- **No Backblaze call happens inside the transaction.** Every check above runs
  first; the file row, the ingest, the fan-out and the latch are one short
  transaction after; a multipart abort comes after the commit.

**Transformations**

- Multipart finalises with `completeMultipartUpload` from inside the handler,
  using the client's ETags. Single PUTs are verified with `headObject` against
  `byteSize`. Both are control-plane calls; neither streams bytes.
- `outcome: "done"` sets `state = 'done'` and **ingests** (below) in the same
  transaction, so a file is an item the instant it lands. That is what lets the
  `partial` state say "The 262 that arrived are on their days already".
- `outcome: "failed"` sets `state = 'failed'` with the problem code, and leaves
  the object (if any) to `abortMultipartUpload` or to the sweeper. Backblaze bills
  unfinished multipart parts, so aborting is not optional. Whatever the row may
  have left in the bucket (a single PUT that landed, the derivatives, an
  assembled original) is queued into `pending_object_deletions` in the same
  transaction (step 6a), whether the browser reported the failure or the
  server found a mismatch; a later retry takes the keys back out.
- **The browser may report four problem codes**: `connection_lost`, the default
  when it sends none, `checksum_mismatch`, `content_mismatch` and
  `storage_rejected`. The other five are the server's verdicts (`abandoned`,
  `cancelled_by_uploader`, and the manifest's three refusals), and a `failed`
  call naming one is a `400`. A `waiting` row takes `outcome: "failed"` too,
  which is how a file the browser could not read before its first presign
  ends, so the batch still settles.
- **The latch runs at the end of every one of these calls**, whichever outcome.
- The response carries `progress` and `didSettle` so the surface can move its bar
  and flip to `done` or `partial` without a `GET` after each of 264 completes.

**Performance** One transaction of roughly ten writes: the file row, the item,
its renditions, the edit fan-out (three to five rows), `last_activity_at`, and
the latch. Multiplied by 264 and spread across the minutes a 5.2 GB transfer
takes, that is comfortable; fired 264-wide at once it is not, which is why the
client caps parallelism. Keep the transaction short and rely on `busy_timeout`.
The latch's `NOT EXISTS` is an index seek on `(upload_session_id, state)` that
stops at the first non-terminal row.

#### `POST /api/upload-sessions/:sessionId/files/:fileId/retry`

**Surface** 8 `upload`, state `partial` ("Try the one that dropped")
**Auth** session required · **Role** uploader-of-session
**Request** Path `sessionId`, `fileId`. No body.
**Response** `200` `RetryUploadFileResponse`
**Errors**

| Status | Code                       | When                                                                                                                                               |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`            |                                                                                                                                                    |
| 403    | `upload_forbidden`         | Role is `viewer`.                                                                                                                                  |
| 404    | `upload_session_not_found` | No such session, or not this member's. Byte-identical.                                                                                             |
| 404    | `upload_file_not_found`    | No such file, or another session's. Byte-identical.                                                                                                |
| 409    | `upload_file_conflict`     | The row is not `failed`. **A `refused` row is never retryable**: a PDF is refused by kind, and the mockup offers only "Leave it, the rest are up". |

**Transformations** Sets `state = 'waiting'`, clears `problem_code`,
`problem_detail`, `presigned_until` and `multipart_upload_id`, and leaves
`attempt_count` alone. The client then presigns and transfers as normal. In
the same transaction it takes the file's original and derivative keys back out
of `pending_object_deletions` (step 6a): a row the sweep abandoned had them
queued, and the retry is about to write the same deterministic keys again. A
multipart upload the row still named is aborted after the commit.
`isIncludedInEmail` in the response is `settled_at IS NULL`, and it exists
because of the latch's third consequence: after a batch has settled, **"try the
one that dropped" sends nothing.** The retry flips the row back to `waiting`, but
`settled_at` is already set, so the latch refuses to fire again and the recovered
photograph appears silently. The surface must not promise a second email, and
this boolean is how it knows.
One further consequence, worth stating because it is not obvious: burst detection
has already run by then, so a file recovered after settling lands as a plain
print on its day and does not join an existing burst. Re-running detection would
renumber `burst_index` on items somebody may already be looking at.
**Performance** One update, plus the presign and complete that follow.

### Settling: exactly one email when the last file lands

Run after **every** terminal file transition (`done`, `failed`, `refused`,
`cancelled`), and once at commit in case the manifest is already terminal, from
`data-models.md` § "Exactly one email when the last file lands", verbatim:

```sql
UPDATE upload_sessions
   SET state = 'settled', settled_at = :now
 WHERE id = :session_id
   AND committed_at IS NOT NULL
   AND settled_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM upload_files
                    WHERE upload_session_id = :session_id
                      AND state IN ('waiting','sending'));
```

If `changes() = 1`, this caller and only this caller enqueues the email, in the
same transaction. SQLite serialises writers, so no other locking is needed, and
the `NOT EXISTS` is an index seek that stops at the first non-terminal row.

Four consequences, all of which this contract depends on:

- **Latch on `settled_at`, not `notified_at`.** Mail is the spec's named single
  point of failure, so a batch must be able to finish while mail is down, with a
  retryable outbox row waiting. `notified_at` and `notified_member_count` are
  written by the settling transaction itself, beside the enqueue: the number of
  recipient rows written, 0 for an "only me" batch, and the settle time (step
  6a design, decision 4). They record that the fan-out ran; whether each
  message arrived is its outbox row's to say.
- **A partial batch still sends.** Failures and refusals are terminal states, so
  262 of 264 settles and notifies, and the two casualties are a list on the
  surface rather than a reason to hold the email.
- **"Try the one that dropped" sends nothing**, per `POST .../retry` above.
- **An abandoned batch needs a sweeper.** A closed browser otherwise leaves files
  `waiting` forever and nobody is told about the 200 that did arrive.

### `upload-abandon-sweep`

`conventions.md` § The job runner, every 15 minutes. **The single most important
piece of upload plumbing the mockup does not show.** It is the only thing that
finishes a batch whose browser is gone, and without it the product's most
visible promise (one email when the last one lands) silently never fires for
exactly the uploader most likely to close the tab: a parent with a newborn.

For each session with `committed_at IS NOT NULL`, `settled_at IS NULL` and
`last_activity_at` older than `upload.abandon_grace_minutes`: mark every
non-terminal `upload_files` row `failed` with `problem_code = 'abandoned'`, call
`abortMultipartUpload` for any row holding a `multipart_upload_id` so Backblaze
stops billing the parts, then run the same latch once. The grace period has to
exceed the longest plausible single-part transfer, or it will fail a file that is
merely slow, which is why `last_activity_at` is bumped by presign and complete
rather than only at commit.

How step 6a built it (its design's decisions 2 and 18):

- **Each batch has a transaction of its own**, holding the failed rows, the
  deletion queue below and the latch, so a batch whose settle fails rolls back
  alone and is found again next run while the others settle.
- **What an abandoned row may have left in the bucket is queued for
  deletion** in that transaction: every such row holding a `storage_key` and
  no item has its original key and each derivative key enqueued into
  `pending_object_deletions`, a multipart original included, because
  Backblaze may have assembled it before the browser went quiet.
- **The aborts come after**, outside any transaction, and cover every
  `failed` or `cancelled` row still holding a `multipart_upload_id`, not only
  this run's: a row keeps its id until Backblaze lets go of the upload, so an
  abort that failed here or in a route is tried again on the next run.
- **`object-deletion-drain` checks each key again just before it deletes
  it.** A retry can bring an abandoned row back and write the same keys, so a
  key an `item_renditions` row holds, or that belongs to an upload row now
  `waiting`, `sending`, or `done` under an item, only loses its queue row.
- **A file retried after its batch settled is swept too**, by its own
  `updated_at` rather than the batch's activity, which another retried file
  can keep fresh. Past the same grace it is failed as `abandoned` and its
  leftovers are queued in one transaction, and the latch is never run: the
  batch has already settled and sent its email, which a retry after settling
  is never part of. Its multipart upload is aborted with the others, after.

The latch does **not** touch drafts: a draft has no `committed_at`, so the
latch skips it by construction. The sweep's other half cancels a draft idle past
`appConfig.upload.draftExpiryHours`, per Ruling 5.

### Ingest, per file, inside `complete`

One transaction, on `outcome: "done"`:

1. **`items`**: `kind` from the verified content type; `captured_at`,
   `captured_on`, `captured_at_offset_minutes` and `capture_source` copied from
   the file row's ladder result; `original_captured_at = captured_at`, frozen
   and never written again; `seq` assigned in this transaction; `uploaded_by`
   from the session; `upload_session_id`; `width` and `height`
   post-orientation; `byte_size`; `content_type`; `checksum = content_hash`
   (within-upload dedupe); `original_filename`; `alt_text = NULL`, because alt
   text is composed at render from the people tags and the capture date
   (Decision 9).
2. **`visibility_rule_id` is COPIED from `upload_sessions` onto the item.** The
   item never references the session's rule. Editing one photograph's visibility
   a month later must not silently change the other 263
   (`data-models.md` § `upload_sessions`).
3. **`item_renditions`**, one row per purpose that landed, `original` at minimum,
   holding keys and never URLs.
4. `upload_files.item_id` is set. It is `SET NULL` on item delete, so the transfer
   record outlives the photograph: the upload history is the only place the
   original filename and the outcome live.
5. **The edit fan-out**, which is the whole reason the plan is persisted. For
   every `upload_batch_edits` row with `undone_at IS NULL` that targets this file
   (driving from `upload_batch_edit_targets`, which is indexed on the file
   precisely because ingest runs that way round):
   - `tag`: resolve `tag_id`. On first use, create the `tags` row from
     `label_snapshot` with `name` as typed and `name_normalized` trimmed,
     lowercased, whitespace-collapsed and NFC, as
     `INSERT ... ON CONFLICT (name_normalized) DO NOTHING` then select, so
     "Hospital" cannot become a second tag. Write the resolved id and
     `applied_at` back onto the edit row, then insert `item_tags`.
   - `person`: the same shape against `people`. There is no unique on
     `display_name`, so writing the resolved `person_id` back onto the edit row is
     not an optimisation, it is what stops the other 263 files each creating
     another Mateo.
   - `milestone`: `milestone_id` is already on the row. Insert `item_milestones`.
6. Run the latch.

Because the plan froze at commit, every file ingests under the same plan and file
1 cannot disagree with file 264.

### The asymmetry: when a new tag, person or milestone gets its row

- **A new tag or person typed into the bulk modal gets its row at INGEST, not
  when Enter is pressed.** `label_snapshot` carries the typed name in the
  meantime. An abandoned batch must not pollute the vocabulary the whole product
  filters by, especially since the picker's design leans on those counts to tell
  a real tag from last week's typo of one: a tag created on Enter and then
  abandoned would sit in every picker forever, counting zero.
- **A new milestone is the opposite: its row is written immediately**, because
  the create form promises "It appears in the timeline on those dates straight
  away", and an abandoned batch therefore leaves an empty milestone. That is
  fine: an empty milestone is already a designed state, and a milestone has no
  visibility of its own (Decision 5), so nothing leaks.
- That row is created by **agent G's `POST /api/milestones`**, called by the
  `milestone-new` state before it posts the edit. This slice does not redefine
  it, does not proxy it, and never accepts a milestone `labelSnapshot`.

### Burst detection, once, at settle

Scoped to the session (`bursts.upload_session_id`), over the items the session
produced, after the latch fires and before the email is enqueued so the `done`
state's "45 frames collapsed into one stack" is true when it is read.

**The candidates are the items whose `capture_source` is `exif` or
`video_metadata`** (step 6a design, decision 16), the two rungs whose clock is
the device that took the picture. Every other rung's time is a name, a save
time, a typed day or the declare time, which every undated file in a batch
shares, so ten undated forwards would otherwise become one stack of ten; they
land as plain prints.
An amendment rewrites `capture_source` to `uploader_set`, so a real burst whose
day was corrected before commit lands as plain prints too, which
`detector_version` lets a later detector regroup.

Partition by `captured_on`, order by `captured_at`, and start a new run when the
gap to the previous frame exceeds `appConfig.burst.maxGapSeconds`. A run of at
least `appConfig.burst.minimumFrameCount` becomes a `bursts` row carrying `captured_on`,
`starts_at`, `ends_at`, `detected_at`, `is_manual = 0`, `cover_item_id = NULL`
(set only when a person picks one), and **`threshold_seconds` and
`detector_version` recorded on the row**, so a better algorithm can re-derive the
automatic groupings later without touching anybody's manual one. Members get
`burst_id` and a 1-based `burst_index` in capture order.

**The threshold is the one genuinely open question in the product**
(`data-models.md` § Still genuinely undecided, `PRODUCT.md` § The archive). This
contract takes it as a config value and does not choose it: the mockup's 45
frames spanning 06:41 to 06:44 average roughly four seconds apart, which already
rules out the one-second guess. `appConfig.burst.minimumFrameCount` is config
for the same reason, and a run of one is never a stack.

No `frame_count` is written, ever. Visibility is per item, a burst can be
partially visible, and a stored count would leak restricted frames through a
denominator in exactly the way the counting rule forbids for a day total.

## The edit plan

**One row per bulk action, not one per file per action.** Twelve prints ticked
and three actions applied is three `upload_batch_edits` rows and 36
`upload_batch_edit_targets` rows, and the fan-out to `item_tags`,
`item_people` and `item_milestones` happens at ingest, server-side. **Never
accept a 264 x 3 payload replayed from a browser** that may have been reloaded
since it computed it: the plan is server-authoritative, which is what makes it
survive a closed tab and what makes the batch settle once.

Ticking prints is browser-local and costs no request at all. The `selection`
state is a client selection; only the bulk action that follows it is a write.

#### `POST /api/upload-sessions/:sessionId/edits`

**Surface** 8 `upload`, states `selection`, `tag`, `tagged`, `person`,
`people-tagged`, `milestone`, `milestone-new`, `milestone-assigned`
**Auth** session required · **Role** uploader-of-session
**Request**

```ts
/** POST /api/upload-sessions/:sessionId/edits */
type CreateUploadEditRequest = {
  /** Path */
  sessionId: string;
  /** Body */
  kind: "tag" | "person" | "milestone";
  /** Body. Every id must belong to this session. Hard cap 1,000. */
  targetFileIds: string[];
  /** Body. An existing tag chosen from the picker. */
  tagId?: string | null;
  /** Body. An existing person chosen from the picker. */
  personId?: string | null;
  /**
   * Body. Required for kind "milestone", from agent G's POST /api/milestones.
   */
  milestoneId?: string | null;
  /**
   * Body. The name as typed, for a tag or a person the archive has never heard
   * of. Carries it until ingest; never accepted for a milestone.
   */
  labelSnapshot?: string | null;
};
```

**Response** `201` `UploadBatchEditDto`
**Errors**

| Status | Code                       | When                                                                                                                                                                                                                                                                                                           |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`          | Not exactly one of `tagId` / `labelSnapshot` for `tag`, or of `personId` / `labelSnapshot` for `person`; a `labelSnapshot` with `kind: "milestone"`; a missing `milestoneId`; an empty or over-cap `targetFileIds`; a blank `labelSnapshot`; a `tagId` or `personId` that names no row. `details.fieldErrors`. |
| 401    | `not_signed_in`            |                                                                                                                                                                                                                                                                                                                |
| 403    | `upload_forbidden`         | Role is `viewer`. Adding tags, people tags and milestones is an uploader capability (`PRODUCT.md` § Roles).                                                                                                                                                                                                    |
| 404    | `upload_session_not_found` | No such session, or not this member's (an admin included). Byte-identical to a nonexistent id.                                                                                                                                                                                                                 |
| 404    | `upload_file_not_found`    | A target id is not in this session, including one from somebody else's session. Byte-identical, and `details.fileIds` is omitted for the same reason.                                                                                                                                                          |
| 404    | `milestone_not_found`      | `milestoneId` does not exist (agent G's code).                                                                                                                                                                                                                                                                 |
| 409    | `upload_session_conflict`  | `committed_at IS NOT NULL`. The plan froze at commit; after that, per-item edits are agent C's.                                                                                                                                                                                                                |

**Transformations** One `upload_batch_edits` row plus N
`upload_batch_edit_targets` rows in one transaction. Nothing is written to
`tags` or `people` here, deliberately: see the asymmetry above. `label` in the
response reads from the resolved row when there is one and from
`label_snapshot` otherwise, so the "What you have added" list reads the same
either way. `targetCount` is the count of target rows, which is the "on 12 of
264" figure. Two identical actions are allowed and harmless: the fan-out is
idempotent through `UNIQUE (item_id, tag_id)` and its two siblings.
**Performance** One insert plus **one multi-row insert** of the targets, never N
statements. `UNIQUE (upload_batch_edit_id, upload_file_id)` dedupes a
double-submitted selection. The targets table is indexed on the file because
ingest drives from the file, not from the edit.

#### `DELETE /api/upload-sessions/:sessionId/edits/:editId`

**Surface** 8 `upload`, states `tagged`, `people-tagged`, `milestone-assigned`
(the Undo button on each row of "What you have added")
**Auth** session required · **Role** uploader-of-session
**Request** Path `sessionId`, `editId`. No body.
**Response** `200` `UploadBatchEditDto`, with `undoneAt` set and `canUndo`
false: the row still exists, so the post-mutation read shape is the edit itself.
**Errors**

| Status | Code                       | When                                                                                                                        |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`            |                                                                                                                             |
| 403    | `upload_forbidden`         | Role is `viewer`.                                                                                                           |
| 404    | `upload_session_not_found` | No such session, or not this member's. Byte-identical.                                                                      |
| 404    | `upload_edit_not_found`    | No such edit, or it belongs to another session. Byte-identical.                                                             |
| 409    | `upload_edit_conflict`     | Already undone, or `applied_at IS NOT NULL`.                                                                                |
| 409    | `upload_session_conflict`  | `committed_at IS NOT NULL`. "Nothing here has gone up yet, so all of it can still be taken off" stops being true at commit. |

**Transformations** Sets `undone_at`. The target rows stay, so the record of what
was undone survives; ingest skips any edit with `undone_at` set. Nothing is
deleted from `tags` or `people`, because nothing was ever created there.
**Performance** One update.

## Visibility

#### `PATCH /api/upload-sessions/:sessionId/visibility`

**Surface** 8 `upload`, states `select`, `visibility`
**Auth** session required · **Role** uploader-of-session
**Request**

```ts
/** PATCH /api/upload-sessions/:sessionId/visibility */
type SetUploadVisibilityRequest = {
  /** Path */
  sessionId: string;
  /** Body */
  mode: "everyone" | "only" | "except";
  /** Body. Empty for "everyone". Members and groups in one list. */
  subjects: VisibilitySubjectInput[];
};
```

**Response** `200` `VisibilitySummary`
**Errors**

| Status | Code                       | When                                                                                                                                                                                                                                                            |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`          | `mode` is `only` or `except` with no subjects (the control's "Nobody yet" state is pre-submit and must not be sent); a subject id that is not a member who is active or invited, or an existing group; subjects with `mode: "everyone"`. `details.fieldErrors`. |
| 401    | `not_signed_in`            |                                                                                                                                                                                                                                                                 |
| 403    | `upload_forbidden`         | Role is `viewer`. Setting item visibility is an uploader capability.                                                                                                                                                                                            |
| 404    | `upload_session_not_found` | No such session, or not this member's (an admin included). Byte-identical.                                                                                                                                                                                      |
| 409    | `upload_session_conflict`  | `committed_at IS NOT NULL`. Changing the rule mid-batch would split 264 photographs across two rules; afterwards it is agent C's per-item edit.                                                                                                                 |

**Transformations** Step 5a's `getVisibilityRuleFromSubjects`, as the item
slice uses it, which is why an invited member is a valid subject as well as an
active one: only a removed member is refused. Canonicalises and sorts the
subject list, computes `subject_digest`, finds an existing `visibility_rules`
row with that `(mode, subject_digest)` or inserts one, and sets
`upload_sessions.visibility_rule_id`. **Rules are never edited in place**: they
are massively shared, and editing one would change the other 263 photographs
that point at it (`data-models.md` § What that costs). The digest index is not
unique, so an equivalent duplicate is tolerated rather than merged. One column on
the session, no per-session subject table, and ingest copies the id onto each
item.
The step arrives pre-filled to `everyone` and applies to the whole batch, which
is why it sits on the session rather than on a file. `VisibilitySummary.label`
("Just us two") is composed from the rule's subjects at read time and never
stored: the rule is shared and deduped, and a stored label goes stale the moment
a group is renamed.
An admin sees every item always, and the surface says so wherever visibility is
set; nothing in this route changes that.
**Performance** One digest computation over tens of subjects, one indexed lookup
on `(mode, subject_digest)`, at most one insert, one update. No fan-out: the
items do not exist yet, and when they do they copy the id.

## Shared types in this slice

Schema names follow `packages/shared`: `uploadSessionDetailSchema` /
`UploadSessionDetail` for the shared DTOs, `<routeName>RequestSchema` and
`<routeName>ResponseSchema` for the per-route shapes above. TypeScript only;
one Zod dialect is generated from these after the merge.

```ts
type UploadSessionState = "draft" | "uploading" | "settled" | "cancelled";

type UploadFileState =
  | "waiting"
  | "sending"
  | "done"
  | "failed"
  | "refused"
  | "cancelled";

/** Why a file is not up. Enum values in a payload, not HTTP error codes. */
type UploadProblemCode =
  | "unsupported_type"
  | "too_large"
  | "empty_file"
  | "connection_lost"
  | "checksum_mismatch"
  | "content_mismatch"
  | "storage_rejected"
  | "abandoned"
  | "cancelled_by_uploader";

/** Matches `item_renditions.purpose`. */
type RenditionPurpose =
  | "original"
  | "display"
  | "thumb"
  | "poster"
  | "video_webm"
  | "video_mp4";

/** Matches `items.capture_source`. */
type CaptureSource =
  | "exif"
  | "video_metadata"
  | "filename"
  | "file_mtime"
  | "uploader_set"
  | "upload_time";

type UploadSessionSummary = {
  sessionId: string;
  state: UploadSessionState;
  uploadedBy: MemberRef;
  visibility: VisibilitySummary;
  /** Diagnostic only. Capture dates resolve in `shoebox.timezone`. */
  clientTimezone: string;
  /** Snapshotted at commit; 0 on a draft with no manifest yet. */
  fileCount: number;
  /** Excludes refused rows. A number, never "5.2 GB": the browser formats. */
  totalBytes: number;
  createdAt: string;
  committedAt: string | null;
  settledAt: string | null;
  lastActivityAt: string;
  /** Written by the settling transaction, beside the enqueue; null until then. */
  notifiedAt: string | null;
  notifiedMemberCount: number | null;
};

/**
 * Every figure here is a GROUP BY over a few hundred rows. None is a column.
 */
type UploadProgress = {
  waitingCount: number;
  sendingCount: number;
  doneCount: number;
  failedCount: number;
  refusedCount: number;
  cancelledCount: number;
  /** Sum of declared bytes over done files. Whole files only. */
  doneBytes: number;
};

type UploadFileDto = {
  fileId: string;
  position: number;
  originalFilename: string;
  declaredContentType: string;
  declaredBytes: number;
  contentHash: string | null;
  state: UploadFileState;
  attemptCount: number;
  problemCode: UploadProblemCode | null;
  /** English, for the admin's eye. Never the primary UI copy. */
  problemDetail: string | null;
  capturedAt: string | null;
  capturedOn: string | null;
  captureOffsetMinutes: number | null;
  captureSource: CaptureSource | null;
  itemId: string | null;
  /** Null until ingest makes the renditions. */
  media: MediaRef | null;
};

type UploadDayGroup = {
  capturedOn: string;
  fileCount: number;
  /** From the edit plan before ingest, from item_milestones after. */
  milestones: MilestoneRef[];
};

type UploadBatchEditDto = {
  editId: string;
  kind: "tag" | "person" | "milestone";
  /** The resolved name when there is a row, else label_snapshot. */
  label: string;
  /** Null while the tag exists only as a label_snapshot. */
  tag: TagRef | null;
  person: PersonRef | null;
  milestone: MilestoneRef | null;
  /** The "on 12 of 264" figure. */
  targetCount: number;
  createdAt: string;
  undoneAt: string | null;
  appliedAt: string | null;
  canUndo: boolean;
};

/** The milestone-fix state: attached, but captured outside the span. */
type UploadMismatchGroup = {
  milestone: MilestoneRef;
  files: { fileId: string; originalFilename: string; capturedOn: string }[];
};

/** Proposed. See Additions requested. */
type UploadUndatedGroup = {
  fileCount: number;
  /** The rung the server fell back to for every one of them. */
  captureSource: CaptureSource;
  files: { fileId: string; originalFilename: string; capturedOn: string }[];
};

type PendingFileRef = {
  fileId: string;
  originalFilename: string;
  declaredBytes: number;
};

/**
 * The whole of the done state. Nothing here is stored except
 * notifiedMemberCount.
 */
type UploadOutcomeSummary = {
  itemCount: number;
  dayCount: number;
  milestoneCount: number;
  burstCount: number;
  burstFrameCount: number;
  notifiedMemberCount: number | null;
};

type UploadSessionDetail = UploadSessionSummary & {
  progress: UploadProgress;
  days: UploadDayGroup[];
  edits: UploadBatchEditDto[];
  mismatches: UploadMismatchGroup[];
  undated: UploadUndatedGroup | null;
  /** Resume: what is still to come. First 100; page `files` for the rest. */
  pendingFiles: PendingFileRef[];
  /** Non-null once settled. */
  summary: UploadOutcomeSummary | null;
  files: UploadFileDto[];
  /** Encodes `upload_files.position`. Null means the end. */
  nextCursor: string | null;
};

type ManifestCaptureEvidence = {
  /**
   * EXIF DateTimeOriginal as the file carried it, with no zone applied:
   * "2026-09-14T06:41:32".
   */
  exifCapturedAtLocal?: string | null;
  /** EXIF OffsetTimeOriginal, in minutes. */
  exifOffsetMinutes?: number | null;
  /** QuickTime/MP4 creation_time, UTC by specification. */
  videoCreationTime?: string | null;
  /** The File API's lastModified, as an ISO-8601 UTC timestamp. */
  lastModifiedAt?: string | null;
};

type ManifestEntry = {
  /**
   * The browser's own handle for this File, echoed back so it can pair the
   * outcome.
   */
  clientRef: string;
  /**
   * Present when amending a row that already exists (the milestone-fix flow).
   */
  fileId?: string | null;
  originalFilename: string;
  declaredContentType: string;
  declaredBytes: number;
  /** Optional here, required at presign. */
  contentHash?: string | null;
  /**
   * The browser supplies evidence; the server picks the rung and records
   * capture_source.
   */
  capture?: ManifestCaptureEvidence;
  /**
   * An amendment: the uploader saying so. Becomes capture_source
   * "uploader_set".
   */
  capturedAt?: string | null;
  /** Post-orientation, when the browser can read them cheaply. */
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

type ManifestOutcome = {
  clientRef: string;
  fileId: string;
  disposition: "created" | "matched" | "amended" | "already_done" | "refused";
  state: UploadFileState;
  capturedOn: string | null;
  captureSource: CaptureSource | null;
  problemCode: UploadProblemCode | null;
};

type PutUploadManifestResponse = {
  sessionId: string;
  fileCount: number;
  totalBytes: number;
  outcomes: ManifestOutcome[];
};

type PresignSingle = {
  mode: "single";
  fileId: string;
  method: "PUT";
  url: string;
  /** Exactly what the browser must send, Content-Type included. */
  headers: Record<string, string>;
  expiresAt: string;
};

type PresignMultipart = {
  mode: "multipart";
  fileId: string;
  multipartUploadId: string;
  partSizeBytes: number;
  partCount: number;
  parts: { partNumber: number; url: string; expiresAt: string }[];
  method: "PUT";
  headers: Record<string, string>;
  /** The earliest of the parts, so the client has one number to watch. */
  expiresAt: string;
};

type PresignUploadFileResponse = PresignSingle | PresignMultipart;

type CompleteUploadFileResponse = {
  file: UploadFileDto;
  /** So 264 completes do not become 264 completes plus 264 GETs. */
  progress: UploadProgress;
  sessionState: UploadSessionState;
  /** True only for the one caller whose latch UPDATE reported changes() = 1. */
  didSettle: boolean;
};

type RetryUploadFileResponse = {
  file: UploadFileDto;
  /**
   * False once the batch has settled: the latch will not fire twice, so the
   * recovered photograph appears silently and the surface must not promise
   * mail.
   */
  isIncludedInEmail: boolean;
};

/** The write shape for a visibility rule. See Additions requested. */
type VisibilitySubjectInput = {
  kind: "member" | "group";
  id: string;
};

type VisibilityInput = {
  mode: "everyone" | "only" | "except";
  subjects: VisibilitySubjectInput[];
};
```

### Configuration this slice reads

None of these is in `SETTING_DEFINITIONS` but `shoebox.timezone`, a settings
key listed for completeness. **The rest are `appConfig` values in
`app.config.ts`** (`docs/configuration.md`): this document first named them as
`upload.*` settings keys, and step 6a made them deployment constants by the
reasoning of Ruling 4, with the step design's decision 7 giving each default.
An `upload.*` name elsewhere in this document means the value on its row here.

| Value                                          | Default          | Why                                                                                          |
| ---------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `shoebox.timezone`                             | admin's zone     | The zone every offset-less capture date resolves in (Decision 10).                           |
| `appConfig.upload.acceptedContentTypes`        | images and video | What is refused at manifest, before a byte moves.                                            |
| `appConfig.upload.maxFileBytes`                | 8 GiB            | Refusal, not failure.                                                                        |
| `appConfig.upload.presignTtlSeconds`           | 3600             | Must exceed one part at the floor rate.                                                      |
| `appConfig.upload.multipartThresholdBytes`     | 32 MiB           | Below it a file is one PUT with no server contact, which must land inside the abandon grace. |
| `appConfig.upload.transferFloorBytesPerSecond` | 16 KiB/s         | The slowest link the three timing relations survive; the browser's re-presign reads it too.  |
| `appConfig.upload.multipartPartSizeBytes`      | 16 MiB           | Backblaze's S3 minimum is 5 MB.                                                              |
| `appConfig.upload.maxParallelTransfers`        | 2                | Client-side. SQLite has one writer, and the spike measured 4 buying nothing.                 |
| `appConfig.upload.offlineWaitCeilingMinutes`   | 20               | Client-side. An offline browser is waited for, not retried, but never past the grace.        |
| `appConfig.upload.abandonGraceMinutes`         | 60               | `upload-abandon-sweep`. Too short fails a slow file; too long delays the email.              |
| `appConfig.burst.maxGapSeconds`                | 10               | Ruling 4. The largest gap between frames of one burst.                                       |
| `appConfig.burst.minimumFrameCount`            | 3                | A run of one is a plain print, never a stack of one.                                         |
| `appConfig.burst.detectorVersion`              | 1                | Recorded per burst so a better algorithm can re-derive the automatic ones.                   |

### Error codes this slice appends to the registry

| Code                         | Status |
| ---------------------------- | ------ |
| `upload_forbidden`           | 403    |
| `upload_session_not_found`   | 404    |
| `upload_session_conflict`    | 409    |
| `upload_session_empty`       | 400    |
| `upload_file_not_found`      | 404    |
| `upload_file_conflict`       | 409    |
| `upload_manifest_conflict`   | 409    |
| `upload_edit_not_found`      | 404    |
| `upload_edit_conflict`       | 409    |
| `upload_storage_unavailable` | 503    |

`milestone_not_found` is agent G's and is used unchanged.

## Additions requested to the frozen DTOs

1. **`VisibilityInput` and `VisibilitySubjectInput` should be hoisted into the
   frozen set.** `VisibilitySummary` is a read shape and there is no write shape
   for a rule, yet `PATCH /api/upload-sessions/:sessionId/visibility` and agent
   C's per-item visibility edit need the identical body. Two slices inventing it
   in parallel is exactly what the frozen list exists to prevent. Defined above
   in "Shared types in this slice" pending the coordinator's decision.
2. **No widening of `TagRef` or `PersonRef` is requested, deliberately.** The
   edit plan needs to represent a tag or a person that has no row yet, and the
   tempting fix is a nullable `tagId`. That would put "an id that might not
   exist" into every payload in the product to serve one pre-ingest state.
   `UploadBatchEditDto` carries `label` plus a nullable `TagRef` / `PersonRef`
   instead, which keeps the frozen shapes meaning what they say.
3. **The "these did not say when they were taken" group.** Not a frozen-DTO
   change, and flagged here because it is the one addition to the surface this
   slice proposes rather than documents. The data model names the gap
   (§ Capture dates): the days list has no group for files that reached rung 4 or
   6, so a WhatsApp forward is silently filed under today and nobody notices. The
   contract is already in this document and needs no new table:
   - `UploadSessionDetail.undated` carries the files whose `capture_source` is
     `file_mtime` or `upload_time`, with their count, as a group the surface can
     render at the top of the days list.
   - One date picker on that group writes through
     `PATCH /api/upload-sessions/:sessionId/manifest`, one entry per file, each
     addressed by `fileId` and carrying `capturedAt`, which is rung 5
     (`capture_source = 'uploader_set'`).
   - It is the same route and the same rung as the `milestone-fix` amendment, so
     the only new thing is the grouping in the response and a picker on the
     surface.
   - Step 6a serves the group (its design's decision 9), and the picker is
     step 7b's.
4. **`ApiError.details` gains four optional fields**, additively, in step 6a
   (design decision 11): `sessionId` on `409 upload_session_conflict`,
   `fileId` on the hash collision, `state` on `upload_file_conflict`, and
   `clientRefs` on `409 upload_manifest_conflict`. `conventions.md` § Errors
   lists every `details` field, and no existing response changes.

## Rulings

1. **The browser makes the derivatives, and v1 transcodes no video.** The
   constraint decides this rather than a preference: `architecture.md` § Where
   data lives says media bytes "never pass through the server", which rules out
   a worker pulling originals back from Backblaze to make thumbnails. The
   browser already holds the full-resolution file, so it produces `display`,
   `thumb` and, for a video, `poster`, and uploads each alongside the original
   through the same presign and complete pair.

   **`video_webm` and `video_mp4` are not produced.** No browser transcodes
   video at a quality or a speed worth having, and a phone's own recording is
   already H.264 in an MP4 container. The `item_renditions` `CHECK` keeps both
   values for the day a worker exists; nothing writes them now, and the player
   plays the original.

   **Step 6a's spike found the premise wrong, and the ruling stands.** A
   phone records HEVC, not H.264: twenty-nine of the spike's thirty-two
   videos. Nothing is transcoded all the same, so the
   original is HEVC, which Safari and hardware-backed Chrome play and Firefox
   and older Android may not. That is step 6b's to handle in the player.

   Two consequences the question asked for:

   - **A file is `done` only when its original and its derivatives have all
     landed**, so `UploadFileDto.media` is never null on a `done` file and the
     pile never draws a gap where a thumbnail is still being made.
   - **A derivative the browser could not make is not a failure.** A codec it
     cannot decode means `complete` reports `done` with a shorter `renditions`
     list, and `MediaRef` resolves the missing purpose to `original` at read
     time. `item_renditions` always holds `original`, so that fallback always
     exists. A 4 MB thumbnail is a bad thumbnail and a visible photograph; a
     null one is neither.

2. **Decision 10 wins: `shoebox.timezone`, not `client_timezone`.** Confirmed,
   and the earlier `data-models.md` § Capture dates paragraph is corrected. The
   reason is the one Decision 10 gives and it is decisive: the same file
   uploaded by two people must not land on two different days.
   `upload_sessions.client_timezone` stays as a diagnostic column, which is
   worth keeping precisely because it is the thing you want when a date looks
   wrong.

3. **The pre-ingest date amendment: closed on merge.** `README.md` § Holes the
   slices found in the schema, fourth bullet: `upload_files` now carries its own
   `original_captured_at` holding the ladder's result, and ingest copies that,
   so "revert to what the file said" survives a `milestone-fix` amendment.

4. **The burst threshold: settled.** Frames no more than **10 seconds** apart,
   at least **three** of them. Both live in
   [`app.config.ts`](../../../../../app.config.ts) as
   `appConfig.burst.maxGapSeconds` and `appConfig.burst.minimumFrameCount`,
   with the reasoning beside them, rather than as the
   `upload.burst_threshold_seconds` setting this document assumed. Cite the
   config, not a settings key: this is not something an admin edits in the app.
   The fixture run the `done` state describes, 45 frames between 06:41 and
   06:44, holds together at 10 and fragments at 3.

5. **Abandoned drafts: the same job takes them.** `upload-abandon-sweep` now
   also cancels pre-commit drafts idle longer than
   `appConfig.upload.draftExpiryHours`, which is **one week**. The alternative,
   letting a new `POST` adopt or supersede the stale draft, silently discards
   somebody's twenty minutes of tagging, and the failure modes here are
   lopsided: expiring too late costs one row, expiring too early costs the work
   the whole upload flow exists to make painless.

6. **The index is declared.** `upload_sessions (uploaded_by, state)` is added
   to `data-models.md`, for `GET /api/upload-sessions/current` and the conflict
   check on `POST /api/upload-sessions`.

7. **The embedded file list: confirmed as an exception, and written down.**
   `conventions.md` § The three documented exceptions carries it, cursor and
   all. The surface always wants progress and files together, and the
   manifest's order is the order it draws, so a `position` cursor is the
   honest one.

8. **`PUT .../manifest` becomes `PATCH .../manifest`.** The verb matches the
   semantics rather than the other way round, because a strict `PUT` makes a
   partial body destructive and the omitted rows have bytes in the bucket
   behind them. The milestones slice hit the identical problem and the merge
   already renamed its route for the identical reason (`README.md` § What the
   merge changed, first item); this is the same rename applied to the one place
   it was missed. `README.md` § Every route, by path is updated.

9. **`503` is in the status table.** `conventions.md` § Errors gains the row
   and the registry gains `upload_storage_unavailable`, because presign and
   complete depend on a third party that can be down while the database is
   fine, and that is a different sentence from any 4xx or a 500.

10. **`progress` and `didSettle` on `complete`: confirmed as an exception.**
    Also in `conventions.md` § The three documented exceptions. The alternative
    is a `GET` after each of 264 completes, which is 264 extra round trips to
    learn a number the write already computed.
