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
suggestions clear when a name is claimed. Route and invitation integration uses
this action in the subsequent profile-completion slice.

Names retain accents, spaces and the 80-character limit. Display spelling uses
NFC, trimming and collapsed whitespace. Keys additionally use Unicode lowercase
without locale selection. `John`, `john` and `John` conflict; `Sofia` and `Sofía`
remain different. Names reject `@`, line breaks and invisible formatting controls.

## Legacy import

Migration `0019_member_name_claims` freezes its normalization and import helpers
inside the migration source. It imports every unique legacy effective name,
including the previous email-local fallback and names on invited or removed
accounts. It updates linked people without changing their IDs or associations.
An active account without a linked person receives one. No ad-hoc person changes.

Active or previously joined/signed-in legacy members become profile-complete.
Unjoined invited members remain incomplete, with their imported name also saved
as a suggestion. Reserving legacy invitation names is a one-time compatibility
exception; new invitations will use unclaimed suggestions in the profile workflow.
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
