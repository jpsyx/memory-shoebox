# Visual Duplicates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Skip and explain duplicate exports before upload, including against old photos automatically fingerprinted after an upgrade.

**Architecture:** Shared deterministic fingerprints connect the browser media worker, indexed manifest matching and a resumable server backfill. Migration 0015 installs and seeds the data migration without downloading media under the schema lock.

**Tech Stack:** TypeScript, Vitest, browser canvas, sharp, Fastify, Kysely/SQLite.

**Spec:** `docs/superpowers/specs/2026-10-12-visual-duplicates-design.md`

## Global Constraints

- Originals are uploaded and stored byte-for-byte; fingerprinting only reads them.
- Filename is never photo identity.
- No production uploads or emails during testing.
- No network operation runs inside a schema migration.
- Private photos remain temporary local verification artifacts.
- Work only in the existing fix/upload-duplicates worktree; preserve the exact-duplicate fix.

## Review Focus

- Neighboring burst frames must not be skipped merely for similar composition (task 1).
- Flat images and corrupt decodes must remain eligible (tasks 1 and 3).
- Interrupted downloads and deleted/replaced media must not leave stale fingerprints (task 2).
- Same-batch duplicates and draft replays must keep durable, non-leaking notices (tasks 3 and 4).
- Old clients without fingerprint evidence must continue working and enqueue backfill (task 2).

### Task 1: Shared fingerprint and conservative matcher

**Files:** New `packages/shared/src/photos/visualFingerprint*.ts`, server fingerprint tests, server package dependency.

**Interfaces:** `makeVisualFingerprintFromRgba(pixels: Uint8Array | Uint8ClampedArray): string | undefined` consumes oriented 32x32 RGBA; `areVisualFingerprintsMatching(options: { first: string; second: string }): boolean`; `getVisualFingerprintBandsFromFingerprint(fingerprint: string): string[]`; Zod fingerprint schema. Fingerprint includes version, DCT hash, gradients and color evidence.

- [ ] Write tests for resized/re-encoded synthetic photos, orientation, different photos, featureless input and malformed signatures; observe expected red.
- [ ] Implement deterministic shared algorithm and sharp decoder `makeVisualFingerprintFromImage(bytes: Uint8Array): Promise<string | undefined>`; generate shared exports.
- [ ] Run focused shared/server tests, expected PASS. Benchmark all three actual pairs and cross-pairs; tighten thresholds if any adjacent frame matches.

### Task 2: Automatic upgrade and background migration

**Files:** Migration `0015_visual_duplicates.ts`, registry, DB types and schema expectations; `apps/server/src/maintenance/visualFingerprintBackfill/*`; createApp background registration; ingest support helpers; populated upgrade/backfill tests.

**Interfaces:** Nullable `visual_fingerprint` on items/upload_files; `photo_fingerprint_backfill` keyed by item_id with attempts/next_attempt_at/last_error; `createVisualFingerprintBackfillJob({database,b2,clock})` returns Job. Ingest copies a supplied fingerprint or queues missing photo evidence.

- [ ] Add populated upgrade and worker tests for queue seeding, bytes preservation, bounded progress, retries/restart, rendition preference and deletion/source-change races. Run focused tests, expected FAIL before implementation.
- [ ] Append schema/index migration, implement bounded automatic worker using task 1 decoder and atomic conditional writes, and register it with app lifecycle.
- [ ] Run migration/backfill/ingest suites, expected PASS.

### Task 3: Draft matching and browser fingerprinting

**Files:** Shared manifest schema; media worker protocol/client/answer and new browser decoder; readPendingUploadPicks; reconcileManifest helpers; relevant route/controller tests.

**Interfaces:** Optional `ManifestEntry.visualFingerprint`; media worker `fingerprint` request and `fingerprinted` response. Save the supplied fingerprint on new upload rows, match indexed archive candidates and prior batch files, and cancel duplicate rows using existing durable reasons.

- [ ] Add failing tests for fingerprint-before-manifest, decode failure, archive visual matches, batch copies, renamed originals, date amendments and replay. Run, expected FAIL.
- [ ] Implement worker normalization, index-backed archive probes, batch matching and persisted evidence without changing original transfer bodies.
- [ ] Run worker/controller/manifest/ingest suites, expected PASS.

### Task 4: Visible feedback and final verification

**Files:** UploadDuplicateFiles/UploadFileDescription and tests; docs/PRODUCT.md, web.md, server.md, migrations.md, visual-duplicates.md.

- [ ] Assert draft and completion copy explicitly identifies duplicates and skipping for both reasons, then implement copy and run tests, expected PASS.
- [ ] Verify actual sample pairs through browser and server decoders, original-byte transfer regression, and a local upgrade with fake B2/email.
- [ ] Update feature/upgrade documentation with measured costs and failure behavior.
- [ ] Run pnpm test, pnpm type-check, pnpm lint, format check, pnpm build; expected all PASS.
- [ ] Obtain a fresh whole-branch review, fix important findings with red/green evidence, and leave worktree ready for user review without merging or deploying.
