# Comment Tagging Integrated Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the complete approved flows locally and leave an actionable, reversible rollout handoff.

**Architecture:** Use an isolated real Fastify/SQLite application with fake B2 and recorded email delivery, driven by Playwright. Keep migration/resource rehearsal separate from interaction proof so passing UI tests cannot hide unsafe data conversion or image processing.

**Tech Stack:** TypeScript, React, Mantine, TanStack Router/Query, Fastify 5, Kysely/SQLite, Backblaze B2, Zod, Vitest, and Playwright. Use the installed pnpm workspace versions; no framework migration.

**Spec:** [Approved scope](../specs/2026-10-31-comment-tagging-design.md) and [approved UI/UX shape](../specs/2026-10-31-comment-tagging-ux-shape.md). Read both before execution.

**Status:** Prepared for implementation review on 2026-10-31. No implementation or passing feature tests are claimed.

## Global Constraints

- Apply the shared execution rules in the [plan index](2026-10-31-comment-tagging-plan.md#execution-rules).
- Browser verification uses local disposable catalogs, fake B2, and recording/no-mail services only.
- Inspect desktop 1440, intermediate 1024, phone 390, narrow 320, and short landscape/fullscreen states.
- Check Day, Porcelain, Slate, and Night renditions, keyboard access, and reduced motion.
- Real email sending, deployment, production mutation, and publication are outside this plan's execution scope.
- Keep all accepted design behavior from surfaces A-J; no new notification center, public profile, or photo-tag email.

## Review Focus

- The narrow mobile keyboard obscures the picker or save action: V1 exercises focused phone layouts and touch selection.
- Fullscreen swallows a portal/Escape or closes the dock: V1 checks nested overlay ownership and native fallback.
- Cross-account state leaks after sign-out: V1 uses separate contexts and changes accounts during pending work.
- A legacy catalog has unresolved collisions or a stale operator mapping: V2 rehearses refusal and restore on a copy.
- Maximum accepted avatars exceed runtime memory: V2 measures real codec concurrency and peak memory before release.

---

## File responsibilities

Browser fixtures and test-only email recording live under `e2e/comment-tagging/`.
The production server gains no test-only endpoints. Existing email/B2 injection
seams supply the stand-ins. Rollout documentation belongs in `docs/`, and actual
verification evidence in `docs/superpowers/verification/` after it exists.

### Task V1: Local multi-user flow and visual/interaction acceptance

**Files:** Create `playwright.comment-tagging.config.ts`,
`e2e/comment-tagging/commentTagging.spec.ts`,
`e2e/comment-tagging/memberIdentity.spec.ts`,
`e2e/comment-tagging/avatarLifecycle.spec.ts`,
`e2e/comment-tagging/collectionJourney.spec.ts`,
`e2e/comment-tagging/support/runCommentTaggingServer.ts`, and
`e2e/comment-tagging/support/commentTaggingFixtures.ts`.
Reuse `e2e/support/createFakeS3Server/createFakeS3Server.ts`,
`e2e/support/e2eEnvironment.constants.ts`, and the local catalog lifecycle
pattern without sharing a live catalog or port pair with another suite.
Modify `package.json` only to add `test:e2e:comment-tagging` for this config.

**Interfaces:** The fixture starts one guarded local application with Ana
(author), Jorge (target), an uploader, an incomplete member, and a removed
historical member. Include a distinct ad-hoc Jorge, uploaded-only/tagged-only/
overlap photos, video with reply/moment, and inaccessible media. Unique claimed
names are required even in fixtures. Supply a recording `EmailService` that
returns deterministic success and exposes captured messages only to the test
process. Do not add a product API for reading recorded mail or minting sessions.

The new config has one worker and explicit Chromium desktop, Chromium phone,
and WebKit phone projects with isolated catalogs per run/project or sequential
fresh fixture resets. Reuse loopback/fake-endpoint path guards before opening
resources. Set API runtime development/fake email and inject the recorder;
never read ignored production environment files. Compile the app using the
existing browser test pattern. Use semantic role/label locators and event-based
waits, not sleeps or screenshots as the only assertions.

- [ ] **Red:** Add end-to-end assertions before fixing missing integration behavior. When plans 1-4 already satisfy a scenario, record it as a passing integration check instead of manufacturing a failure. For actual gaps, demonstrate the failing user behavior before fixing it in the owning task. Minimum flow assertions:

```ts
await expect(
  page.getByRole("option", { name: "Jorge", exact: true }),
).toBeVisible();
await expect(
  page.getByRole("option", { name: "Jorge (not a member)" }),
).toHaveCount(0);
await expect(
  postedComment.getByRole("link", { name: "Jorge, view photos and videos" }),
).toHaveAttribute("href", `/?member=${jorgeId}`);
expect(recordedTagEmailsForJorge).toHaveLength(1);
await expect(
  page.getByText("Photos and videos uploaded by or photo-tagged with Jorge"),
).toBeVisible();
```

Exercise profile collision -> John M, crop/save/remove, author/avatar fallback,
plain typed/pasted `@Jorge` causing no tag email, selected tags, repeats/self,
reply/edit, notification off with generic fallback, stale-name correction,
removed target, and email-link entry through sign-in/completion. Use captured
message hrefs rather than inventing a different test link.

Exercise a main/reply/edit draft -> member collection -> back round trip; new-tab
link behavior; no hidden rows/counts; member filter changes while paging; avatar
replacement conflict; sign-out/access loss during pending saves; and updated
photo-tag suffixes in item, upload, bulk, filters, and directory.

- [ ] **Run:** `pnpm exec playwright test -c playwright.comment-tagging.config.ts`. Expected PASS after integration; any unsupported native feature is documented explicitly and receives a separate manual check, not silently skipped coverage.
- [ ] **Implement corrections:** Fix only demonstrated gaps in their owning modules with the same targeted red/green cycle. Keep the browser harness independent of production configuration. Load `playwright-best-practices` before adding the tests.
- [ ] **Verify visual/interaction acceptance:** Capture desktop and phone together, use real long names, 4,000-character text, avatar failures, empty/error states, and every rendition. Inspect one batch, fix the findings, and confirm once through Impeccable. Test 200% zoom, touch scrolling with keyboard open, all crop controls without dragging, focus announcements, no-motion settings, and real native fullscreen where supported. IME and screen-reader behavior need actual browser/assistive checks; unit tests alone do not establish them. Save verified captures in the feature's Downloads folder and evidence in `docs/superpowers/verification/2026-10-31-comment-tagging.md`.
- [ ] **Commit:** `test: cover comment tagging and member identity journeys`.

### Task V2: Migration recovery, resource rehearsal, and release evidence

**Files:** Create `docs/comment-tagging-rollout.md` and
`docs/superpowers/verification/2026-10-31-comment-tagging.md` if V1 has not already.
Update `docs/migrations.md`, `docs/member-profiles.md`, `docs/comment-tagging.md`,
`docs/archive.md`, `docs/mail.md`, `docs/emails.md`, `docs/theater.md`,
`docs/video-conversations.md`, `docs/architecture.md`, `docs/shared.md`, and
`docs/e2e.md` to match the implemented contracts. Create only missing behavioral
regression tests in the owning plan's named test files. Do not add tests that
merely assert prose or configuration literals.

**Interfaces:** Consume N2's audit/stage command and the existing backup CLI,
plus plans 1-4's migration chain. Produce a rollout document with a local rehearsal,
preflight/collision decision, operator execution order, backup verification,
restore order, compatibility limits, and actual resource observations. Production
commands are instructions for the eventual operator, not actions in this task.
Read `docs/migrations.md#offline-restore` before writing those instructions.

- [ ] **Prepare rehearsal:** Create disposable pre-0019 fixtures containing valid accounts, duplicate normalized/fallback names, invalid names, removed accounts, invited names, existing comments/replies and queued mail. Add a late migration failure to prove whole-transaction rollback. Use fake B2 with a deliberately abandoned avatar key. These are generated fixtures, not a production catalog download.
- [ ] **Run and assert:** Audit must make zero writes. An unresolved or stale mapping must stop without changing members, people, comments, mail, or migration history. A valid explicit mapping must preserve identity IDs and references, then complete all migrations. Repeat startup to prove no duplicate claims or mail. Verify the backup with integrity/foreign-key checks and restore it while the rehearsal app is stopped. The restored catalog runs with its matching old release, not new schema with old code.
- [ ] **Write exact rehearsal commands:** From repository root, document the implemented command syntax and a user-owned absolute disposable path. For example, after the tools exist:

```sh
node apps/server/scripts/backupDatabase.ts "$REHEARSAL_DB" "$REHEARSAL_BACKUP"
node apps/server/scripts/memberNames.ts audit --database "$REHEARSAL_DB"
node apps/server/scripts/memberNames.ts stage --database "$REHEARSAL_DB" --assignments "$NAME_ASSIGNMENTS"
DATABASE_PATH="$REHEARSAL_DB" node apps/server/src/db/migrate.ts
```

Define all three variables in the runbook, never repurpose HOME/CODEX_HOME, and
explain stage's independent backup. Restore instructions must stop HTTP/jobs,
retain the failed DB and WAL/SHM sidecars together, copy the verified backup to
the configured path, set original ownership/mode, and restart the matching
release. Include the existing backup tool's refusal to overwrite destinations.
Do not invent Fly app names or run deployments. No name mapping is needed until
an actual collision report exists; no production collision-free claim is made.

- [ ] **Measure avatar resources:** In an equivalent disposable runtime, send maximum accepted JPEG/PNG/WebP dimensions/bytes, rejected animation/corruption,
      and concurrent requests through the actual route. Record peak resident memory,
      response time, active decoder count, rejection behavior, and background-job
      interaction. Require the deployed memory envelope to remain viable. If it does
      not, bound processing using the existing media-runtime isolation patterns before
      release and rerun the relevant tests; do not silently lower the approved 50 MP
      input support or claim a Promise timeout stops native decoding.
- [ ] **Final verification:** Run `pnpm check` and
      `pnpm exec playwright test -c playwright.comment-tagging.config.ts`. Expect all
      required checks passing, with no actual provider calls. Record commands and
      results, replay compatibility (legacy creates, omitted tags on tagged edits,
      old notification preferences), and the permanent notification-ledger behavior.
      Update all affected docs and copy Markdown/PDF artifacts to Downloads. Do not
      rerun the complete suite absent a new change or unresolved failure.
- [ ] **Commit:** `docs: record comment tagging acceptance and rollout`.

## Release handoff

Plans are complete when their tasks and evidence pass. Shipping is a separate
operator action. The handoff must identify any unresolved measured runtime or
assistive-technology limitation, require an actual preflight on the target
catalog before enabling new code, and give exact backup/restore steps. There is
no automatic push, merge, production migration, email test, or deployment.
