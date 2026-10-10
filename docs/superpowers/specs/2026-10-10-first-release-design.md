# First release safety and distribution

## Intent and scope

Prepare Memory Shoebox for its first production catalog and public self-hosting.
Schema upgrades must preserve data on failure and provide a recovery point for
mistakes that successfully commit. Every push to main must produce a traceable
SemVer release. Admin settings must show the deployed package version. Operators
configure deployment in three ignored env files, with actionable progress and
preflight errors. This work implements the machinery; it does not deploy, push,
merge, or publish from this development session.

## Adversarial findings

| Severity | Existing behavior                                                                                              | Required correction                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Critical | Kysely SQLite migrator does not wrap DDL; injected CREATE, INSERT, throw leaves committed data without history | Atomic migration work and history                                   |
| High     | Migration 0009 commits before the runner records it                                                            | Runner owns the transaction, including history                      |
| High     | SQLite adapter migration lock is a no-op across processes                                                      | Acquire an immediate write transaction before reading history       |
| High     | No pre-upgrade backup                                                                                          | Consistent verified SQLite backup, fail closed on failure           |
| Medium   | Names alone cannot detect modified historical migrations; 0002 and 0011 import mutable application code        | Freeze dependencies and record checksums                            |
| Medium   | Integrity checks only occur in 0009                                                                            | Preflight and precommit integrity and foreign-key validation        |
| High     | Docker context includes .env.server.local and proposed production files                                        | Exclude all private env files; use explicit build/runtime injection |
| High     | Fly configuration embeds app, region and volume; defaults may create multiple independent catalogs             | Operator-owned configuration and single-machine validation          |
| Medium   | Documented backup needs sqlite3 absent from image                                                              | Ship a tested Node backup command and offline restore instructions  |

## Migration contract

Keep `migrateToLatest(database)` compatible for callers. Use a connection-bound
`BEGIN IMMEDIATE` transaction for the whole pending batch and ledger updates.
Inspect and validate ordered applied names while holding that reservation.
Unknown names, non-prefix history, or changed recorded checksums fail closed.
Use existing `kysely_migration` rows so current development catalogs can upgrade.
Legacy rows without checksums are adopted once after validation; explicitly
explain that a first checksum baseline cannot prove their historical source.

Disable foreign keys before beginning only for the runner-controlled rebuild
contract, validate all foreign keys before commit, and restore enforcement in
`finally`. Adapt pre-release 0009 to this contract without changing its schema.
Freeze mutable application dependencies used by historical migrations. Future
migration files are append-only and cannot manage their own transactions or
perform external effects. No automatic down migrations or automatic restores.

Before any pending changes to an on-disk catalog, take a consistent SQLite
backup that includes committed WAL data, verify its integrity, retain it beside
the catalog in a backups directory, and report its path. Backup failure aborts
without migration changes. The backup and transaction must be coordinated so
it represents the pre-upgrade state while competing migration processes cannot
race it. In-memory test catalogs need no file backup. No pending migrations
means no redundant backup. SQLite locking protects concurrent migration runs;
normal application processes must be stopped during deployment upgrades.

Check database integrity and foreign keys before changing it and before commit.
Any failure leaves data, schema, and ledger unchanged; reopening after a killed
migration has the same guarantee. Startup opens HTTP and jobs only after success.
Provide a Node backup CLI and documented offline restore that preserves the
failed database and removes stale WAL/SHM from the restored catalog path.
Backups on the same volume protect against upgrades, not volume loss; operators
must also retain off-volume copies. Never promise arbitrary future migrations
cannot delete data: populated upgrade tests and retained backups remain required.

## Release and version contract

Initial automatic release is 1.0.0 unless the operator selects 0.1.0 before
implementation. Later releases inspect all commits since the last release:
Conventional Commit `!` or BREAKING CHANGE footer means major; `feat` means minor;
every other push means patch. Highest increment wins. Synchronize root and all
four product package versions. Tags are `vX.Y.Z`; GitHub Releases contain notes
covering the released range and target the exact version commit.

The main-push workflow runs checks before publishing. Serialize releases,
handle main moving without overwriting commits, and make retry safe after any
partial completion (especially tag pushed but GitHub Release not yet created).
Use atomic branch/tag push, no force push. The workflow's own GITHUB_TOKEN push
does not recursively trigger Actions. Document required contents:write and
branch rules; fail with clear guidance if repository policy blocks the push.
Use GitHub CLI/API in the workflow, not a local publication during this task.

Read the deployed root package.json as the authoritative version, synchronize
package manifests through release tooling, and return that version in the
admin-authorized settings read. Render a small read-only version row on Shoebox
settings using existing components. Other roles cannot obtain it through the
admin settings endpoint; public health's existing version field may remain.

## Deployment contract

Required root files: `.env.server.production`, `.env.web.production`, `.env.deploy`.
Compare active keys against `apps/server/.env.example`, `apps/web/.env.example`,
and `.env.deploy.example`. Report all missing files before network calls; report
missing keys and invalid/required blank values by name without printing values.
Preserve documented optional blank mail/Redis/local-testing values, reject fake
email enabled in production and half-configured Redis. A web example with zero
keys still requires its production file. Parse dotenv as data, never execute it.

Server production env is the runtime source via staged Fly secrets, never a
Docker layer. Docker accepts the production web env as a BuildKit secret at
Vite's `.env.production` path, with a content digest to invalidate build cache.
All private env files are ignored by Git and Docker, including nested files;
examples remain tracked. Docker installs dev dependencies for build explicitly,
then prunes for runtime. CI builds with a non-secret empty web env fixture.

All operator-specific Fly settings live in `.env.deploy`: app, region, volume
name/size/mount path, machine size/memory, lifecycle/check settings and optional
API token. Generate a temporary Fly config, never interpolate dotenv through a
shell. No personal app name, URL, region or credentials in committed runtime
configuration. The example may contain documented generic suggested settings.
Require an existing app and persistent volume (document exact create commands),
validate the volume/region and at most one application machine before changes,
and refuse unsupported multi-machine layouts. Validate DATABASE_PATH is absolute
and within the persistent mount, NODE_ENV=production, HOST=0.0.0.0 and matching
PORT. Use `--ha=false` and immediate deployment to stop old code before migration.
Never use Fly release_command for SQLite (it has no mounted volume).

`pnpm deploy` runs a script under `scripts/deploy/`: colored emoji progress for
preflight, Fly validation, secret staging, build/deploy, and completion; preserve
live Fly output; exit nonzero on failure and identify the failed step. Do not
print tokens or server values. Clean temporary files on success or failure.
Document initial setup, upgrade, backups/restore, release policy and settings.

## Verification

Migration: populated upgrade including 0009, exception after DDL/data, failed
history write, killed process, concurrent processes, checksum/history drift,
WAL-inclusive backup/restore, backup failure, integrity failure and FK restoration.
Release: mixed commits, breaking footers, first release, retry after tag, main
advance and manifest consistency using temporary local Git repositories.
Deployment: missing files/keys, optional blanks, invalid mount/runtime config,
unsafe dotenv syntax, fake CLI argv/stdin and failure propagation, zero remote
mutation before preflight success, multi-machine rejection, env exclusion.
Version: admin success, unauthenticated and non-admin rejection, settings rendering.
Run workspace formatting, lint, types, build and tests; Docker smoke test when
local Docker is available. Do not make any real Fly or GitHub changes to test.
