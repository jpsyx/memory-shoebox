# Roll out member profiles and comment tagging

This is an operator how-to for migrations 0019 through 0021. It is not a record of
production execution. The companion [acceptance record](superpowers/verification/2026-10-31-comment-tagging.md)
contains the disposable rehearsal, measured limits, and outstanding release gates.
Do not enable the new release until those gates are satisfied.

## Prepare the stopped catalog

1. Retain the current release and its dependencies, media, and configuration.
   Bring the catalog through 0018 using its matching release first. The audit
   requires the pre-0019 schema and initialized checksum history. An older binary
   must never run against the upgraded catalog. There is no automatic downgrade.
2. Stop every HTTP process and background worker that owns the catalog. Keep them
   stopped throughout the final audit, staging, and upgrade. A preliminary online
   audit does not replace the stopped audit. A SQLite write lock cannot prove an
   idle application process has stopped.
3. Record the absolute catalog path, file owner/group/mode, matching old release,
   available disk space, and media retention. Use the existing verified backup
   tool before staging. The backup destination directory must already exist and
   the destination file must not exist. Retain an off-volume copy; a catalog
   backup does not contain B2 objects.

For a local rehearsal, use a newly generated disposable catalog, never a downloaded
production catalog. These variables deliberately use a user-owned absolute path:

```sh
REHEARSAL_ROOT="$HOME/Downloads/memory-shoebox-name-rehearsal"
mkdir -p "$REHEARSAL_ROOT"
REHEARSAL_DB="$REHEARSAL_ROOT/catalog.db"
REHEARSAL_BACKUP="$REHEARSAL_ROOT/before-stage.db"
NAME_ASSIGNMENTS="$REHEARSAL_ROOT/member-name-choices.json"
```

Generate a pre-0019 fixture at `REHEARSAL_DB` before running the following commands.
The acceptance evidence includes the executed fixture generator and its assertions.
For an actual operator upgrade, substitute the configured catalog and retained
backup paths. No Fly application name or deployed machine settings are assumed.
Run the tools from the **new release repository root**, while the old app stays
stopped:

```sh
node apps/server/scripts/backupDatabase.ts "$REHEARSAL_DB" "$REHEARSAL_BACKUP"
node apps/server/scripts/memberNames.ts audit --database "$REHEARSAL_DB" > "$REHEARSAL_ROOT/member-name-audit.json"
```

Both tools operate on explicit local paths and do not load provider configuration.
The backup tool includes committed WAL data, checks integrity and foreign keys,
and produces a standalone DELETE-journal file. It refuses to overwrite a backup.
Treat any nonzero exit as a stop, not a warning to ignore.

## Decide names and stage

4. Read every audit row. Unique valid effective names, including legacy email-local
   fallback names, must remain unchanged. Resolve every invalid or colliding row
   explicitly. Removed accounts and old invitation names participate too. No
   account wins automatically and no numeric suffix is assigned by the system.
   The target catalog has not been inspected by this rehearsal; it still needs
   its own audit. An empty collision report is the only basis for saying that
   catalog needs no name mapping.
5. If any rows are flagged, write `NAME_ASSIGNMENTS` using the audit's exact
   fingerprint and IDs. For example, replacing these illustrative values with
   actual audit values:

```json
{
  "catalogFingerprint": "COPY-THE-AUDIT-FINGERPRINT",
  "assignments": [
    { "memberId": "FIRST-FLAGGED-ID", "displayName": "John M" },
    { "memberId": "SECOND-FLAGGED-ID", "displayName": "John R" }
  ]
}
```

Unknown/duplicate IDs, invalid names, duplicate final names, unresolved rows,
changed unique names, or a stale fingerprint fail without changing identities.
A changed identity or migration history requires a fresh audit and choices file.
When there are no flagged rows, proceed to migration without staging.

```sh
node apps/server/scripts/memberNames.ts stage --database "$REHEARSAL_DB" --assignments "$NAME_ASSIGNMENTS" > "$REHEARSAL_ROOT/member-name-staged.json"
```

`stage` explicitly asserts the app is stopped. It holds an immediate write lock,
makes an **independent verified pre-stage backup**, and writes a durable staging
table without renaming accounts. Retain the returned `backupPath`, its verified
status, and an off-volume copy. Prefer this pre-stage backup for old-release
recovery. The migrator's later backup may contain the ordinary staging table,
which is not part of the old release's expected schema.

## Migrate and start

6. Run against the same absolute path:

```sh
DATABASE_PATH="$REHEARSAL_DB" node apps/server/src/db/migrate.ts
```

The runner verifies history and checksums, makes its own backup, then applies all
pending migrations and history entries in one transaction. 0019 revalidates the
staged identity fingerprint, imports permanent claims and completion state,
preserves IDs and person associations, and consumes staging. 0020 adds private
avatar reservations/pointers. 0021 adds explicit comment occurrences, the permanent
notification ledger, default-on tag preference, and the outbox kind. No migration
reads media, operator files, or sends mail. A later failure rolls back the whole
pending chain. Investigate before retrying; never edit history to bypass a refusal.

7. Start only the matching new release with the existing configuration. Verify
   health, an existing session, profile completion, account-photo publication,
   comment reads, and the ordinary job lifecycle. Repeated startup must not create
   duplicate name claims or tag mail. Production mail is not a test mechanism.
   Confirm the actual target's memory, swap, architecture, codecs, and isolation
   settings against the acceptance bound before enabling this feature.

## Restore while stopped

8. Stop HTTP and all job owners again. Verify the chosen pre-stage backup and
   select its matching old release before replacing anything. Record the original
   numeric owner, group and mode while the failed catalog still exists. These
   example commands run on Linux where the persistent catalog is mounted:

```sh
CATALOG_PATH="$REHEARSAL_DB"
VERIFIED_BACKUP="$REHEARSAL_BACKUP"
CATALOG_UID="$(stat -c %u "$CATALOG_PATH")"
CATALOG_GID="$(stat -c %g "$CATALOG_PATH")"
CATALOG_MODE="$(stat -c %a "$CATALOG_PATH")"
FAILED_CATALOG_DIR="$REHEARSAL_ROOT/failed-catalog-$(date +%Y%m%d-%H%M%S)"
mkdir "$FAILED_CATALOG_DIR"
mv "$CATALOG_PATH" "$FAILED_CATALOG_DIR/"
if [ -f "$CATALOG_PATH-wal" ]; then mv "$CATALOG_PATH-wal" "$FAILED_CATALOG_DIR/"; fi
if [ -f "$CATALOG_PATH-shm" ]; then mv "$CATALOG_PATH-shm" "$FAILED_CATALOG_DIR/"; fi
node apps/server/scripts/backupDatabase.ts "$VERIFIED_BACKUP" "$CATALOG_PATH"
chown "$CATALOG_UID:$CATALOG_GID" "$CATALOG_PATH"
chmod "$CATALOG_MODE" "$CATALOG_PATH"
```

On macOS, use `stat -f %u`, `stat -f %g`, and `stat -f %Lp` for the three metadata
reads. Choose the actual printed pre-stage `backupPath` as `VERIFIED_BACKUP` when
recovering from staging. The manually verified before-stage snapshot is also
suitable. Do not execute later commands if any earlier command fails. Run `chown`
with the required local privileges, verify the restored metadata, and retain the
failed main file and any WAL/SHM together for diagnosis. Never copy only a main
file over a live catalog or leave stale sidecars beside the restored file.

9. Restart the retained **old release** with the restored catalog. Check that its
   migrator is up to date through 0018 and its HTTP health/session reads work. Keep
   media referenced by that backup available. A successful catalog restore cannot
   recreate deleted objects. See [offline restore](migrations.md#offline-restore).

## Compatibility to retain

Legacy comment creates omit `commentTags` and remain plain text. A legacy edit
that omits tags on an already-tagged comment fails with
`comment_tags_reload_required`; it cannot silently erase identity links. Explicit
`[]` removes references. Old four-switch notification updates preserve the stored
new preference. Public names never expose email-derived fallbacks.

`comment_tag_notifications` is the permanent per-comment/per-recipient scheduling
ledger. Removing/re-adding a tag, failed configuration, and outbox scrubbing do not
reset it. Deleting the comment deletes its ledger. Delivery rechecks eligibility
and access immediately before provider handoff; a message already handed to the
provider cannot be recalled. These semantics require no backfill mail.

The final local acceptance run used Linux ARM64, Node 22.23.3 and an explicit
512 MiB no-swap, one-CPU container. All 34 cases passed after selecting a 12 MP
intermediate WebP budget: 409.1 MiB kernel peak, 463.5 MiB sampled API RSS, at most
one active decoder. Originals still support 50 MP/10 MiB and zoom 8. The exact
original crop is preserved; extreme-zoom sampling may reconstruct a smaller
intermediate crop to 256 pixels. Confirm actual target settings and headroom;
this rehearsal does not establish them. See the acceptance record for codec
versions, full-size parity, background interaction and native-device limitations.
