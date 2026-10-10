# Catalog upgrades and recovery

Startup runs migrations before opening HTTP or starting background jobs. A
failure prevents startup. Stop normal application processes during upgrades;
SQLite serializes competing migration runners, but cannot make old application
code compatible with a new schema.

## Atomic upgrades

The runner reserves SQLite's write lock with `BEGIN IMMEDIATE` before reading
history. It pins all work to that connection. Every pending migration and its
ledger entry commit together; an exception, failed history write, failed
validation, or killed process leaves the previous schema, data, and history.
Foreign keys are disabled before the transaction for table rebuilds, checked
before writes and before commit, and re-enabled in `finally`. Physical integrity
is checked at both boundaries too. Migration 0009 relies on this runner-owned
contract, including for populated catalogs with dependent rows.

Before the first write to an on-disk catalog, the runner makes a backup under
`backups/` beside the catalog and prints its path. A separate read-only SQLite
connection uses the online backup API while the runner holds the write lock,
so the backup contains committed WAL rows and competing migration runners
cannot advance the schema between snapshot and upgrade. The backup is converted
to a single-file DELETE-journal database and validated for integrity and foreign
keys. Failure aborts the upgrade. In-memory catalogs skip file backups, and an
up-to-date catalog produces no redundant backup. Backups are retained without
automatic pruning. Ensure free disk space and copy them off the volume: a backup
on the same volume protects against upgrade mistakes, not volume loss.

## Migration history

The existing `kysely_migration` ledger remains authoritative. Applied names must
be an exact prefix of the sorted registry. A companion
`kysely_migration_checksums` table stores SHA-256 hashes of UTF-8 migration source
with CRLF line endings canonicalized to LF. All other content, including whitespace
and lone carriage returns, remains significant. Git also checks out migration
files with LF through `.gitattributes`; runtime normalization covers existing
CRLF files too. Missing, reordered, or changed history fails closed. Restore the matching
release files instead of editing the ledger to bypass the check.

Legacy development catalogs with no checksum table receive a one-time checksum
baseline after integrity/history validation and a backup. This cannot prove
which source originally ran: verify their provenance before adopting them. Once
that table exists, missing rows or different checksums are errors. Source hashes
are drift detection, not tamper-proof audit records.

Migration files are append-only after release. Add a new numbered file and
register it in `src/db/migrations/migrations.ts`; keep its key equal to its
filename without `.ts`. Freeze runtime constants and data transformation helpers
inside the migration, rather than importing mutable application code. Type-only
imports are safe. Migrations must not start/commit transactions, change connection
pragmas, or perform network/filesystem side effects. The runner owns those
boundaries. Update the schema types and add populated upgrade tests. Atomicity
cannot prevent a logically wrong migration that successfully commits from
deleting data; backups and review remain necessary. There is no automatic
downgrade or automatic restore.

## Manual backup

Run from the application root, locally or inside the production container:

```sh
node apps/server/scripts/backupDatabase.ts /data/memory-shoebox.db /data/catalog-before-upgrade.db
```

Both paths are explicit; the destination directory must exist and the destination
file must not exist. This command runs with plain Node and production dependencies,
includes committed WAL data, verifies the result, and exits nonzero on failure.
A live catalog is supported for snapshots. Stop the application when the backup
must be the exact final state before maintenance. Retain an off-volume copy too.

## Offline restore

Stop every application process and keep it stopped until restoration is complete.
Choose the known-good backup and the matching application release. The following
commands run where the persistent catalog is mounted; replace the example backup
path with the actual retained path. Preserve the failed database and its sidecars
for diagnosis, then restore via the verified backup tool:

```sh
catalog=/data/memory-shoebox.db
backup=/data/backups/SELECT-THE-VERIFIED-BACKUP.db
archive=/data/failed-catalog-$(date +%Y%m%d-%H%M%S)
mkdir "$archive"
mv "$catalog" "$archive/"
if [ -f "$catalog-wal" ]; then mv "$catalog-wal" "$archive/"; fi
if [ -f "$catalog-shm" ]; then mv "$catalog-shm" "$archive/"; fi
node apps/server/scripts/backupDatabase.ts "$backup" "$catalog"
```

Check that the command succeeded before restarting the matching release. Moving
both sidecars prevents a stale WAL from being replayed into the restored file.
Do not restore only the main file while a process still has it open. A catalog
backup does not include B2 media: restoring an older catalog may reference media
that has since been deleted, so coordinate media retention and catalog recovery.
