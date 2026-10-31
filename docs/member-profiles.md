# Member names and catalog rollout

Member IDs are the stable identity. `members.display_name` holds the current
claimed spelling. `member_name_claims` permanently reserves each normalized name
to its member ID, including previous spellings after a rename and retained
removed accounts. Members may return to their own previous name. Ad-hoc people
are a separate namespace and are never merged with members by matching names.

`claimMemberName` validates with the shared account-name schema, checks ownership,
inserts an absent claim, updates profile state and calls `syncMemberPerson` in the
caller's immediate transaction. The member, claim and linked person commit or
roll back together. A conflict returns `name_taken` with field guidance and no
owner details. Profile completion keeps its original timestamp on later renames;
suggestions clear when a name is claimed. Profile updates, first-admin setup,
restoration with a replacement name and local member seeds all use this action.

Names retain accents, spaces and the 80-character limit. Display spelling uses
NFC, trimming and collapsed whitespace. Keys additionally use Unicode lowercase
without locale selection. `John`, `john` and `John` conflict; `Sofia` and `Sofía`
remain different. Names reject `@`, line breaks and invisible formatting controls.

## Profile completion and participation

`MeDto` exposes `profileComplete` from `profile_completed_at` and a private
`suggestedDisplayName`. A new invitation stores the offered name only as a
suggestion, allowing duplicate suggestions without reserving names. Restoring a
claimed identity preserves its name unless a replacement is supplied; replacements
must claim successfully and cannot clear the name. Restoring an unjoined legacy
claim preserves its incomplete state even when an admin replaces its claimed name;
verification and the member’s own name confirmation are still required. Unnamed public identities read
as “Member”. Public member references never derive names from email addresses.

`PATCH /api/me` accepts an optional valid nonempty account name and returns the
usual account/settings envelope. Null and empty names are rejected. Name conflicts
return `409 name_taken`: “That name is already taken. Try adding your last-name
initial, like John M.” The response carries no other identity details.

The authenticated viewer reads stored completion on every request, including for
admins. Incomplete identities can sign in, read, manage their profile/avatar and
sign out. Creating or editing comments and starting or modifying archive uploads
returns `403 profile_required` until completion. Item/comment visibility checks
still return their normal 404 before the completion error. Upload reads and
whole-session cancellation keep their existing role/ownership rules.

Local `pnpm seed:member <address> --display-name <name>` requires an explicit
account name, claims it atomically with creation and base-URL initialization, and
preserves the claimed identity on repeated calls. `-h` and `--help` explain options
without opening a database. Test account helpers create unique completed accounts
by default; incomplete cases are explicit, and historical migration fixtures keep
their original pre-0019 shape.

The web app routes incomplete signed-in accounts to `/complete-profile` before
opening the application shell. Its centered form uses the invitation suggestion,
never an email-derived placeholder. Continue validates the name and claims it via
`PATCH /api/me`; conflicts and failed requests preserve the editable draft and
focus the name field. Safe local destinations retain the full path, query and
fragment through sign-in and completion, including a comment deep link. External
and protocol-relative destinations fall back to `/`. Expired sessions discard the
draft and return to sign-in with an explanation and the original destination.

My account uses the same name validation and conflict wording. An empty claimed
name cannot be saved. Name and notification saves retain their independent
reconciliation; a held name response cannot overwrite a different account's
current cache. Pending edits remain in the input after a failed save. The optional profile-photo row saves independently of the name and notification fields.

## Photo-tag identity labels

Every `PersonRef` carries a required `isMember`, derived from its `member_id` link
and the linked member's active status. This is presentation metadata, not an
account ID or a permission grant. Ad-hoc people and retained identities linked to
inactive members display `Name (not a member)` in photo-tag options, selected
chips, the directory, and filters. The suffix is regular-weight secondary text
and part of the accessible label. Raw names remain unchanged in rename fields,
lookups and persisted requests.

A same-name account never suppresses the distinct ad-hoc create option. Explicit
person choices retain their IDs through item edits and upload/bulk forms; typed
ad-hoc names never bind an account by name. Upload ingestion continues to create
one null-member person per typed batch name and reuses that person across files.

## Legacy import

Migration `0019_member_name_claims` freezes its normalization and import helpers
inside the migration source. It imports every unique legacy effective name,
including the previous email-local fallback and names on invited or removed
accounts. It updates linked people without changing their IDs or associations.
An active account without a linked person receives one. No ad-hoc person changes.

Active or previously joined/signed-in legacy members become profile-complete.
Unjoined invited members remain incomplete, with their imported name also saved
as a suggestion. Reserving legacy invitation names is a one-time compatibility
exception; new invitations use unclaimed suggestions in the profile workflow.
Empty catalogs need no operator mapping.

Any collision or invalid effective name requires an explicit choice for every
flagged member. No account wins automatically and no name is numbered. Unique
legacy names must stay unchanged. Migration validates every final name and key
before altering schema. Invalid or stale staging, unresolved conflicts, or later
write failures roll back schema, data, staging consumption and migration history.

## Offline operator workflow

Use the release immediately before migration 0019 to bring the catalog through
0018 and initialize its checksum history first. The audit requires that legacy
schema, including linked people and migration checksums. These commands use plain
Node and explicit catalog paths; they never load environment files or send mail.

1. Stop every application process and keep it stopped through staging and upgrade.
   A preliminary audit may run read-only, but rerun it after stopping the app.
2. Run from the repository root:

   ```sh
   node apps/server/scripts/memberNames.ts audit --database /data/memory-shoebox.db > /data/member-name-audit.json
   ```

   JSON stdout contains `catalogFingerprint` and `rows`, each with `memberId`,
   `currentName`, `proposedName` and `issue` (`collision`, `invalid` or null).
   `currentName` includes the former email-local fallback for offline audit only.
   This report is never exposed by member APIs.

3. Write a JSON choices file using the exact reported fingerprint and member IDs:

   ```json
   {
     "catalogFingerprint": "COPY-FROM-THE-AUDIT",
     "assignments": [
       { "memberId": "FIRST-FLAGGED-MEMBER-ID", "displayName": "John M" },
       { "memberId": "SECOND-FLAGGED-MEMBER-ID", "displayName": "John R" }
     ]
   }
   ```

   Include every flagged row. Unflagged rows need no assignment and cannot be
   renamed through this import. Unknown IDs, duplicate mappings, invalid final
   names, duplicate final keys and stale snapshots are refused without staging.

4. Stage the choices while the application remains stopped:

   ```sh
   node apps/server/scripts/memberNames.ts stage --database /data/memory-shoebox.db --assignments /data/member-name-choices.json > /data/member-name-staged.json
   ```

   Explicit `stage` asserts the application is stopped. The action holds an
   immediate write lock, makes and verifies a backup under `backups/` beside the
   catalog, and prints its `backupPath` plus staged member count as JSON. Lock
   contention fails safely. A lock cannot prove all idle WAL readers are absent:
   stopping the processes remains the operator's responsibility. Copy the backup
   off-volume. Staging never renames members.

5. Run the new release's normal migration command against that same catalog:

   ```sh
   DATABASE_PATH=/data/memory-shoebox.db pnpm migrate
   ```

   The runner takes its own verified pre-migration backup. Migration revalidates
   the fingerprint and choices, imports claims and profile state, and drops
   `member_name_rollout_assignments` in the same transaction. The staging table is
   an ordinary durable table, not SQLite TEMP: it survives closing and reopening
   the CLI process. No operator file or environment value is read by migration.

The fingerprint hashes a deterministic, small-member snapshot: member IDs,
emails, stored names, status, join/sign-in/creation fields, linked person IDs and
names, and applied migration/checksum history. It excludes staging metadata,
ad-hoc people and archive/media/comment/mail rows. It is an identity rollout
freshness token, not a full-catalog checksum or backup. Name, status, linked
identity or migration changes require a new audit and choices file; staging
itself does not invalidate the token.

Bare invocation opens a full action wizard. Menus support arrows and j/k, paths
can be edited with Backspace, and stage asks whether the application is stopped.
Ctrl-C, EOF or Cancel exits without staging. Explicit flags work unattended,
including with piped stdin or redirected stdout. Prompts use the controlling
terminal; progress, backup paths and recovery advice use stderr. `-h`/`--help`
work before file access at the root and both subcommands.

For recovery, keep the application stopped and follow
[offline restore](migrations.md#offline-restore) with the printed verified backup
and its matching application release. The restore procedure preserves the failed
catalog and both sidecars, then restores through the verified backup tool. A failed
stage or migration can be retried after fixing the cause; a changed identity
snapshot requires a new audit. Backups are retained even when later staging fails.

## Private avatars

Every active member can reserve and remove their own chosen avatar, including a
viewer whose account name is still incomplete. This permission is independent of
archive upload and comment participation. `POST /api/me/avatar-uploads` accepts an
expected current avatar ID (nullable), JPEG/PNG/WebP content type, a positive byte
size up to 10 MiB, and orientation-relative crop center coordinates in [0, 1]
with zoom in [1, 8]. It returns an immutable avatar ID and a ten-minute deadline.
`PUT /api/me/avatar-uploads/:avatarId` accepts the reserved binary image with
its declared content type and exact byte length, processes it, and returns the
canonical account/settings envelope. Replaying the current publication performs
no further storage write. The route accepts only still JPEG, PNG, and WebP, rejects
MIME mismatches, animation (including APNG), corrupt input and images over 50MP,
and emits a metadata-free 256-square WebP after orientation and the chosen crop.
Oversized bodies return `413 avatar_too_large`: “Choose a photo smaller than
10 MB.” Three attempts per member per five-minute window return `429` with
`Retry-After` when exceeded. One pre-body admission slot returns `503 avatar_busy`
for concurrent work, without queuing buffered images.

Migration 0020 adds `member_avatar_uploads` and the nullable `members.avatar_id`
pointer. Reservation keys are `avatars/<memberId>/<avatarId>.webp`; B2 adds its
configured environment prefix. The reservation stores the expected pointer as a
snapshot, without a foreign key to older images. A processed `uploading` row can
publish only while its reservation is live and its expected pointer still matches.
Immediate transactions publish or remove the image and queue superseded keys in
`pending_object_deletions` together. Cleanup enqueue failure rolls the entire
mutation back. Stale versions return `409 avatar_changed`, and another owner's
upload ID is indistinguishable from a missing ID (404). Replaying a publication
already current succeeds without another storage write.

`DELETE /api/me/avatar` requires the expected current ID and returns the canonical
account response. `GET /api/members/:memberId/avatar` requires a session and returns
`{ avatar: null }` for unknown members or members without an image. Removed account
identities retain their historical image. Account access removal never queues that
image for deletion.

Every member reference, including the account response, carries required nullable
`avatar` metadata: immutable avatar ID, private signed URL, issuance, and expiry.
Central readers batch current ownership metadata and use a one-hour `presignGet`
signature at the explicit whole-second signing clock. The reported interval is the
one the signer uses. SQL never stores signed URLs. Directory, group, observation,
milestone creator, and settings provenance responses use the same batched reader.
Avatars have no archive item, rendition purpose, photo tag, upload count, or email.

Avatar reservation expiry runs hourly and on application startup through the
owned job runner. Expired `reserved` or `uploading` rows become irreversibly
`retired`, covering crashes before or after B2 PUT. Failed decode/PUT/publication
and rejected or aborted admitted bodies also retire their reservation and queue
its immutable key. Removing an avatar retires all owned pending reservations in
the same transaction, even when the current pointer is already empty; a stale
removal leaves the current image and pending work untouched.

The object-deletion drain protects every current pointer and unretired live
reservation. Retired avatar keys retain durable deletion tombstones using the
existing settling-window and daily recheck strategy. Repeated checks HEAD first,
so an absent object does not create repeated hide markers. A late writer also
re-arms its captured key for immediate deletion after failed publication, even
when an earlier delete saw 404. Tombstones survive a process crash between a
late PUT and its catch handler. Published pointers remain protected throughout;
account-access removal keeps the previous chosen historical avatar.

## Photo editing in the web app

My account places an 80px photo preview before the name field. Add/change opens
an explicit circular crop dialog with a keyboard-operable Photo zoom slider,
zoom buttons, named move arrows, Reset, and Choose another photo. Phones use a
full-height sheet. Backdrop clicks keep the crop open; Cancel/Escape discard
only that crop and return focus to the opener. Removing a photo confirms that
initials will appear instead, with Keep photo focused initially.

The browser uses decoded, orientation-aware image dimensions. Preview and server
processing share one pure integer floor/clamp extraction helper, including odd
dimensions and fractional zoom. Local file checks reject unsupported types and
the 10 MiB limit before decoding; the server remains the binary validation
boundary. Replacing, cancelling or unmounting a selection revokes its object URL.
Failed saves keep the current photo, selected file and crop for retry. A stale
version offers Use latest photo or Save this photo instead; replacement rereads
the pointer and reserves against exactly that version, so a further change still
conflicts rather than being silently overwritten.

Profile completion stages an optional crop locally. Continue claims the name
first and then saves the confirmed photo. A name conflict preserves the crop;
a photo failure preserves the successful name and offers Try again or Continue
without a photo. The mounted editor owns the draft throughout that handoff.
Initials reflect the typed name before publication.

Name, notification and avatar responses reconcile only the fields each write
owns. Private continuations capture the account query identity, member/role and
retirement generation; cache clear, account replacement and private retirement
invalidate them. An old upload cannot continue from reservation to PUT or
publish after retirement. Avatar writes cancel preceding account/bootstrap reads
and hold background account reads only for their live authority. Terminal writes
release that hold independently of another account's pending work.

`MemberAvatar` reserves its requested circular footprint, uses decorative images
with empty alt text and falls back to initials without a layout change. Existing
comment authors and reply/composer identities use 30px. Save/removal reconciles
matching member references throughout the current cache. Failed/expired signed
sources share one private renewal attempt per immutable avatar ID and lifetime;
a failed renewal does not loop. A held renewal can update only references still
pointing at the expected ID, so removing/replacing an image cannot restore it.
