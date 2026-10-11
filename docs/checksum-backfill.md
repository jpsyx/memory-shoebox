# Backfill original checksums

Older catalog items can have a null `items.checksum`. The maintenance command
downloads those items' originals from B2, computes SHA-256 incrementally, and
stores the lowercase hexadecimal digest. It never uses an ETag or B2 SHA-1 as
SHA-256, and never overwrites a populated checksum. Existing duplicate items,
their metadata, and every stored object are preserved.

Stop normal application processes and background jobs during maintenance.
Use the intended catalog and its usual server environment, especially
`DATABASE_PATH`, `NODE_ENV`, and `B2_KEY_PREFIX`. The command uses the standard
server configuration, including `SESSION_SECRET`, but starts no HTTP server,
jobs, or email delivery. B2 credentials need read access to the originals.

From a development checkout, synchronize `.env.server.local` first, then run:

```sh
pnpm env:sync server
pnpm backfill:checksums
```

Inside the production container, with its existing environment and catalog
mounted, the same command runs with plain Node and production dependencies:

```sh
node /app/apps/server/scripts/backfillChecksums.ts
```

Pending schema migrations run first through the normal verified migration
runner. Before any checksum writes, the command makes a separate verified,
WAL-aware catalog backup in `backups/` beside the database and prints its path.
Backup failure aborts the run. Keep enough free disk space and retain an
off-volume copy; [migrations.md](migrations.md) documents backup and recovery.
A run with no null checksums makes no checksum backup or media requests.

Downloads are sequential and streamed; only 100 catalog candidates and one
download's chunks are in flight. Each download has a 15-minute time limit.
Received bytes must exactly match both the item and original rendition sizes.
A missing original row, missing object, partial response, failed download,
or size disagreement leaves the checksum null and reports a failure. Database
writes happen after downloading, with an atomic check that the item still has
no checksum and its original rendition identity, key, and sizes are unchanged.
No network request holds a database transaction open. B2 keys are assumed to
remain immutable, as in normal uploads; do not replace objects out of band
during maintenance.

The command reports each item and a final `updated`/`failed` count. Any failure
exits nonzero; details identify items and safe reason codes without printing
signed URLs or credentials. Correct the reported storage or catalog problem
and run the same command again. Completed rows are durable and skipped on
every rerun, including after the process is interrupted. There is no automatic
retry within one run, deletion, duplicate consolidation, or rollback of saved
hashes. Every run with remaining null checksums retains another backup.

This is an explicit maintenance exception to the application's normal direct
browser-to-B2 media path. Download time and B2 transfer costs scale with the
combined original size of items whose checksums are missing.
