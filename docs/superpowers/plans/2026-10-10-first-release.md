# First Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship recoverable migrations, automatic versioned releases, admin version reporting and portable Fly deployment tooling.

**Architecture:** SQLite migration runner owns an immediate transaction and verified backups. Release tooling owns synchronized manifest versions. A local deployment script validates env files and generates Fly config, supplying runtime secrets and a build-time web env secret.

**Tech Stack:** TypeScript, better-sqlite3, Kysely, Vitest, React/Mantine, GitHub Actions, Fly CLI and Docker BuildKit.

**Spec:** `docs/superpowers/specs/2026-10-10-first-release-design.md`

## Global Constraints

- Initial automatic release is 1.0.0 unless the operator selects 0.1.0 before implementation.
- Tags are `vX.Y.Z`; synchronize root and all four product package versions.
- No real push, merge, release publication or Fly deployment in this session.
- No automatic down migrations or automatic restores.
- All private env files are ignored by Git and Docker; examples remain tracked.
- Required root files: `.env.server.production`, `.env.web.production`, `.env.deploy`.
- Server production env is the runtime source via staged Fly secrets, never a Docker layer.
- Use `--ha=false` and immediate deployment; never use release_command for SQLite.
- Read repository rules and relevant docs; red/green tests for behavior; do not edit generated skills.

## Review Focus

1. Killed migration after DDL but before history must reopen unchanged (Task 1).
2. Concurrent migrators and WAL backups must preserve the same pre-upgrade state (Task 1).
3. GitHub publication retry after atomic tag push must recover without a second bump (Task 2).
4. Old and new env files, quoted values and command substitutions must not leak or execute (Task 4).
5. Existing Fly machines/volumes must not accidentally create a second independent catalog (Task 4).

### Task 1: Harden migrations and recovery

**Files:** `apps/server/src/db/migrate.ts`, new focused runner/history/backup helpers under `apps/server/src/db/`, pre-release migration files 0002/0009/0011 as needed, `apps/server/src/index.ts`, `apps/server/scripts/backupDatabase.ts`, `apps/server/test/migrate.test.ts`, focused on-disk tests under `apps/server/test/db/`, relevant schema tests, `docs/migrations.md`, `docs/server.md`.

**Interfaces:** preserve `migrateToLatest(database: Kysely<Database>): Promise<MigrationResult[]>`, optionally accept test provider/options. Discover on-disk path through SQLite or explicit database metadata. Backup CLI runs with Node from production image and accepts source/destination paths. Root package script changes belong to Task 4; tell controller any requested additions.

- [ ] Read migration source, existing runner, SQLite driver and relevant schema docs.
- [ ] Write failing tests for partial DDL/data rollback, history-write failure, populated 0009 preservation, history/checksum rejection, FK validation/restoration and backup failure/no-op. Run focused Vitest and record expected failures.
- [ ] Implement immediate transaction runner, compatible ledger, source checksums and frozen dependencies; move 0009 transaction ownership to runner. Create verified WAL-safe backups before pending on-disk changes, abort on error. Keep test hooks narrow and internal.
- [ ] Add process tests for concurrent runs and killed migration rollback using temporary databases; exercise backup restore with committed WAL rows and populated upgrade data.
- [ ] Document exact recovery commands, legacy checksum adoption limits, append-only migration rules, off-volume backups and no automatic downgrade.
- [ ] Run focused tests, server lint/types, self-review and commit only Task 1 files. Report red/green evidence and backup interface.

### Task 2: Automatic semantic releases

**Files:** `.github/workflows/release.yml`, focused TypeScript release helpers/CLI/tests under `scripts/release/`, `docs/releases.md`; product manifests only if required for verified fixtures, do not actually bump version in this session merely to simulate publication.

**Interfaces:** release command runs with Node/tsx in workflow, consumes repository commit history and synchronized package.json versions. First automatic version 1.0.0; later breaking/feat/other = major/minor/patch. Release tag vX.Y.Z points at synchronized manifest commit. Use temporary local Git remotes and injectable GitHub boundary for tests.

- [ ] Write failing tests for first release, full multi-commit range, scoped feat and breaking footer/!, retry after tag publication and non-fast-forward main movement. Run and record red.
- [ ] Implement focused helpers for increment selection, manifest synchronization and release orchestration; handle partial publication idempotently and push branch/tag atomically without force.
- [ ] Add main-push workflow with serialized writes, complete source history, required verification before publication and contents:write only where needed. Ensure generated version commit does not recursively release. Provide explicit branch-protection guidance on failure.
- [ ] Run release tests with real temporary Git repos, verify formatting/lint/types for new code, document policy/recovery, self-review and commit Task 2 files.

### Task 3: Show deployed version in admin settings

**Files:** new `apps/server/src/version.ts`, `apps/server/src/routes/health.ts`, existing settings read/route, shared settings response schema, settings UI under `apps/web/src/surfaces/Settings/`, corresponding server and UI tests, `docs/administration.md` and `docs/architecture.md` relevant sections.

**Interfaces:** exported `SHOEBOX_VERSION: string` reads root package.json once; admin settings response includes `version: string`; settings UI renders read-only "Version" row using that value. Health retains current response shape using same version source.

- [ ] Read relevant settings contracts, authorization and UI conventions; load impeccable for the UI adjustment.
- [ ] Write failing admin endpoint tests comparing returned version to root manifest and 401/403 tests for other roles; add settings rendering test. Run and record red.
- [ ] Implement shared version source, additive admin contract and small accessible read-only settings row. Update fixtures that construct the response.
- [ ] Run focused server/UI tests and types, document, self-review and commit Task 3 files.

### Task 4: Portable production deployment

**Files:** `scripts/deploy/` new CLI/config/process helpers/tests, `.env.deploy.example`, server/web `.env.example` comments or required-key declarations, `Dockerfile`, `.dockerignore`, `.gitignore`, `fly.toml` replaced by generated-config approach, `.github/workflows/ci.yml`, root `package.json`, `docs/deployment.md`, `docs/configuration.md`, architecture deployment references as needed.

**Interfaces:** `pnpm run deploy` -> `tsx scripts/deploy/deploy.ts`; consumes three required env files and their examples, validates before any remote action, emits temporary Fly JSON config. Runtime env via stdin to staged secret import, web env via BuildKit secret with content digest cache invalidation. Backup CLI interface comes from Task 1; deploy does not run migrations separately.

- [ ] Read existing config parsing and env tooling. Write failing tests for all missing files/keys, blank required/optional keys, dotenv as data, production invariants, path containment, machine/volume refusal, command failure cleanup and secret-safe progress.
- [ ] Implement parser/validator and config generator. All operator Fly values come from .env.deploy; derive app port and DB path from server env. Generate errors listing names only. Preserve valid optional blanks and reject partial Redis/fake email.
- [ ] Implement sequential progress reporting and fake-CLI-tested orchestration: validate tool/app/volume/machine, stage secrets, deploy immediate/ha=false and clean temporary config. Keep Fly live progress, redact sensitive failure details as needed.
- [ ] Harden Docker ignore, build with explicit dev deps and mounted web env secret, add content digest, prune runtime, adjust CI Docker fixture. Add deploy package script and ignore env files.
- [ ] Rewrite stale deployment instructions with exact env setup, precreate app/volume, pnpm run deploy, backups/restore link and release upgrade guidance. Explain secrets are runtime, not image contents.
- [ ] Run focused tests, root checks and Docker build/smoke if available; report unavailable runtime honestly. Self-review and commit Task 4 files.

### Task 5: Integration verification and whole-branch review

**Files:** only prior task files needed to fix verified integration defects; spec/plan checkboxes and verification record.

- [ ] Run `pnpm check`, compare failures against baseline and fix only introduced issues through the responsible implementer.
- [ ] Run production image verification if Docker available; otherwise report that limitation and verify CI recipe structurally.
- [ ] Dispatch independent whole-branch reviewer with diff, spec, task reports and test evidence. Route real findings to one fix subagent, then scoped re-review.
- [ ] Record outcomes, retain reviewable worktree, and report remaining user actions. No merge/push/deploy without a later explicit request.
