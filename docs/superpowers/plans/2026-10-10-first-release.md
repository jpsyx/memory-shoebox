# First Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [x]`) syntax for tracking.

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

- [x] Read migration source, existing runner, SQLite driver and relevant schema docs.
- [x] Write failing tests for partial DDL/data rollback, history-write failure, populated 0009 preservation, history/checksum rejection, FK validation/restoration and backup failure/no-op. Run focused Vitest and record expected failures.
- [x] Implement immediate transaction runner, compatible ledger, source checksums and frozen dependencies; move 0009 transaction ownership to runner. Create verified WAL-safe backups before pending on-disk changes, abort on error. Keep test hooks narrow and internal.
- [x] Add process tests for concurrent runs and killed migration rollback using temporary databases; exercise backup restore with committed WAL rows and populated upgrade data.
- [x] Document exact recovery commands, legacy checksum adoption limits, append-only migration rules, off-volume backups and no automatic downgrade.
- [x] Run focused tests, server lint/types, self-review and commit only Task 1 files. Report red/green evidence and backup interface.

### Task 2: Automatic semantic releases

**Files:** `.github/workflows/release.yml`, focused TypeScript release helpers/CLI/tests under `scripts/release/`, `docs/releases.md`; product manifests only if required for verified fixtures, do not actually bump version in this session merely to simulate publication.

**Interfaces:** release command runs with Node/tsx in workflow, consumes repository commit history and synchronized package.json versions. First automatic version 1.0.0; later breaking/feat/other = major/minor/patch. Release tag vX.Y.Z points at synchronized manifest commit. Use temporary local Git remotes and injectable GitHub boundary for tests.

- [x] Write failing tests for first release, full multi-commit range, scoped feat and breaking footer/!, retry after tag publication and non-fast-forward main movement. Run and record red.
- [x] Implement focused helpers for increment selection, manifest synchronization and release orchestration; handle partial publication idempotently and push branch/tag atomically without force.
- [x] Add main-push workflow with serialized writes, complete source history, required verification before publication and contents:write only where needed. Ensure generated version commit does not recursively release. Provide explicit branch-protection guidance on failure.
- [x] Run release tests with real temporary Git repos, verify formatting/lint/types for new code, document policy/recovery, self-review and commit Task 2 files.

### Task 3: Show deployed version in admin settings

**Files:** new `apps/server/src/version.ts`, `apps/server/src/routes/health.ts`, existing settings read/route, shared settings response schema, settings UI under `apps/web/src/surfaces/Settings/`, corresponding server and UI tests, `docs/administration.md` and `docs/architecture.md` relevant sections.

**Interfaces:** exported `SHOEBOX_VERSION: string` reads root package.json once; admin settings response includes `version: string`; settings UI renders read-only "Version" row using that value. Health retains current response shape using same version source.

- [x] Read relevant settings contracts, authorization and UI conventions; load impeccable for the UI adjustment.
- [x] Write failing admin endpoint tests comparing returned version to root manifest and 401/403 tests for other roles; add settings rendering test. Run and record red.
- [x] Implement shared version source, additive admin contract and small accessible read-only settings row. Update fixtures that construct the response.
- [x] Run focused server/UI tests and types, document, self-review and commit Task 3 files.

### Task 4: Portable production deployment

**Files:** `scripts/deploy/` new CLI/config/process helpers/tests, `.env.deploy.example`, server/web `.env.example` comments or required-key declarations, `Dockerfile`, `.dockerignore`, `.gitignore`, `fly.toml` replaced by generated-config approach, `.github/workflows/ci.yml`, root `package.json`, `docs/deployment.md`, `docs/configuration.md`, architecture deployment references as needed.

**Interfaces:** `pnpm run deploy` -> `tsx scripts/deploy/deploy.ts`; consumes three required env files and their examples, validates before any remote action, emits temporary Fly JSON config. Runtime env via stdin to staged secret import, web env via BuildKit secret with content digest cache invalidation. Backup CLI interface comes from Task 1; deploy does not run migrations separately.

- [x] Read existing config parsing and env tooling. Write failing tests for all missing files/keys, blank required/optional keys, dotenv as data, production invariants, path containment, machine/volume refusal, command failure cleanup and secret-safe progress.
- [x] Implement parser/validator and config generator. All operator Fly values come from .env.deploy; derive app port and DB path from server env. Generate errors listing names only. Preserve valid optional blanks and reject partial Redis/fake email.
- [x] Implement sequential progress reporting and fake-CLI-tested orchestration: validate tool/app/volume/machine, stage secrets, deploy immediate/ha=false and clean temporary config. Keep Fly live progress, redact sensitive failure details as needed.
- [x] Harden Docker ignore, build with explicit dev deps and mounted web env secret, add content digest, prune runtime, adjust CI Docker fixture. Add deploy package script and ignore env files.
- [x] Rewrite stale deployment instructions with exact env setup, precreate app/volume, pnpm run deploy, backups/restore link and release upgrade guidance. Explain secrets are runtime, not image contents.
- [x] Run focused tests, root checks and Docker build/smoke if available; report unavailable runtime honestly. Self-review and commit Task 4 files.

### Task 5: Integration verification and whole-branch review

**Files:** only prior task files needed to fix verified integration defects; spec/plan checkboxes and verification record.

- [x] Run `pnpm check`, compare failures against baseline and fix only introduced issues through the responsible implementer.
- [x] Run production image verification if Docker available; otherwise report that limitation and verify CI recipe structurally.
- [x] Dispatch independent whole-branch reviewer with diff, spec, task reports and test evidence. Route real findings to one fix subagent, then scoped re-review.
- [x] Record outcomes, retain reviewable worktree, and report remaining user actions. No merge/push/deploy without a later explicit request.

## Verification record

- Tasks 1 through 4 passed independent task reviews. Task 4's operator-capacity, health-timing and file-layout findings were corrected and approved in a scoped follow-up.
- Full `pnpm check` passed at `49e1517b`: 610 test files, 3,905 tests, no skips. Chromium was installed so PDF tests ran. Existing Vite build and jsdom scroll warnings match the baseline.
- Task 4 corrections at `df50c4d5` passed 89 focused deployment/environment tests, root TypeScript, lint and formatting checks.
- The production Docker image built for `linux/amd64`. An isolated container served health and the SPA, reported the root package version, applied all 11 migrations with checksums, passed integrity checks, restarted without another migration backup, and created a verified backup using the shipped Node command. Private env files were absent.
- The image rebuilt successfully after deployment helper paths changed. No real Fly deployment, GitHub publication, push or merge was performed.

## Final review and verification

The whole-branch adversarial review identified and verified three additional
production issues: checkout line endings caused false migration checksum drift,
an inherited Fly access-token alias overrode the selected credential, and remote
preflight accepted unmanaged machines that Fly deployment could not update.
Commit `881df024` fixes all three and adds regression coverage. It also strengthens
the admin version test with actual DOM-order assertions. The independent scoped
review approved all four fixes with no new production breakage.

Final `pnpm check` passed on that commit: **613 test files, 3,920 tests, no skips**,
along with formatting, lint, types and build. The final `linux/amd64` Docker build
and isolated container smoke passed: version matched root package.json, the SPA
loaded, all 11 migration/checksum rows were present with valid integrity, restart
created no additional migration backup, and the shipped Node backup command
produced a verified copy. Private env files were absent. Temporary smoke data and
containers were removed.

One nonblocking convention observation remains: the two tests alongside
`scripts/deploy/deploy/deploy.ts` can be grouped under `__tests__/`. This is a
mechanical layout follow-up, with no known behavior or coverage defect.

### Decisions and limits

- First automatic release is 1.0.0. Closely spaced pushes may be covered by one
  checked release. Change that policy before activation if a different initial
  version or one-to-one push/tag cadence is required.
- Invoke the package script as `pnpm run deploy`; bare `pnpm deploy` invokes
  pnpm's built-in packaging command.
- Canonical checksums are established before the first release. Fingerprints
  from intermediate unreleased CRLF builds are not silently rewritten; those
  development catalogs would require matching code or deliberate recovery.
  Existing pre-branch catalogs retain the tested legacy adoption path.
- The test-directory convention observation is deferred. Its cost is a later
  file move and import-path update, with no known runtime effect.
- Actual GitHub publication, repository policy, and Fly rollout were not exercised.
  No push, merge, release publication or real deployment occurred. Arbitrary
  future migration logic still needs populated tests and retained backups;
  concurrent external deployment or administration is not covered by this
  verification.
