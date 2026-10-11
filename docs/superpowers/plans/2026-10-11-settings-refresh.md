# Workspace Settings Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Fix the seven audited settings-propagation defects with red-green TDD, merge locally into main, and remove the merged branch and worktree.

**Architecture:** Keep SQLite authoritative and preserve existing HTTP contracts except an optional fresh mail-health query. Refresh browser settings through bounded polling, focus/reconnect reads, and same-origin tab notifications. Repair derived upload dates transactionally and prevent superseded invitation retries without rewriting delivered history.

**Tech Stack:** TypeScript, Fastify, Kysely/SQLite, React, TanStack Query/Router, Vitest.

**Spec:** The approved conversation audit and the behavior requirements in each task below. All flows already exist; no new service or dependency is needed.

## Global Constraints

- Red-green TDD for every behavior change: record the failing command and assertion before implementation, then the passing result.
- Never send real email or call real storage providers in tests. Use in-memory catalogs and recording/fake adapters.
- Follow AGENTS.md, docs/rules/, and the naming checklist. Never edit generated skill directories.
- Update relevant docs with each task. Keep changes limited to these seven findings.
- Preserve custom sender names, historical sent email records, explicit capture offsets, user draft input, and upload byte-transfer state.
- Work only in the fix/settings-refresh worktree. Commit task changes; do not push, deploy, or merge from an implementation agent.
- Read docs/architecture.md before changing an HTTP boundary.

## Review Focus

- An old invitation retry that becomes eligible after a new resend must not deliver; an already-started provider request cannot be recalled.
- Cross-tab refresh must not replay writes, overwrite dirty form fields, leak private settings, or leave unhandled errors after sign-out.
- A timezone change overlapping manifest declaration or upload completion must produce the current local day while preserving capture evidence and explicit offsets.
- Explicit custom sender names must survive Shoebox renames; default sender identity must track them.
- A forced domain-health read bypasses completed cache entries and shares an active same-domain request; late results must not poison another domain's settings.

## Task 1: Mail settings and superseded invitations

**Files:** Modify the relevant modules under apps/server/src/mail/, apps/server/src/administration/resendMemberInvitation.ts, apps/server/src/settings/updateAdminSettings.ts, apps/server/src/setup/initializeShoebox.ts, apps/server/src/routes/ (mail health), their tests, and docs/mail.md, docs/administration.md, docs/configuration.md, docs/setup.md as applicable. Add focused helpers beside their owning modules if needed.

**Interfaces:** Preserve Members resend and settings response shapes. Add optional GET /api/mail/health?refresh=true; ordinary reads retain bounded caching. MailDomainReader and readMailHealth may accept an optional refresh flag. No new dependency is required. Final review identified that provider retries need a durable sender snapshot; a backwards-compatible nullable column is allowed.

- [x] Write and run failing tests for: old invitation queued/backing off, settings URL change, Members resend, new delivery followed by old retry deadline. Assert only the fresh invitation sends, URLs use the new origin, and unrelated/sent rows remain intact. Cover a previously selected or in-flight older row without claiming a provider request can be recalled.
- [x] Suppress superseded pending invitation deliveries atomically and ensure the worker cannot later resurrect/deliver them. Preserve provider idempotency and historical message bodies. Keep existing message snapshots for actual retries; do not rewrite previously attempted payloads under the same idempotency key.
- [x] Write and run failing tests that default sender names follow Shoebox renames and explicit custom names remain intact, including explicit fromName in the same PATCH. Store new setup defaults as inheritance (null), use the current Shoebox name when sending with an unset sender name, and convert a legacy sender name equal to the previous Shoebox name to inheritance when renaming. Preserve distinct custom names.
- [x] Write and run failing tests for cached domain result versus refresh=true, including overlapping normal/forced requests and domain changes. Add the optional refresh route flag and bypass the completed cache for explicit checks, retaining ordinary caching and safe concurrent-request behavior.
- [x] Update docs, run focused mail/settings/setup tests and server type-check, self-review, and commit. Report red/green evidence and the exact client interface for task 3.

## Task 2: Timezone changes and pending uploads

**Files:** Modify apps/server/src/settings/applyTimezoneChange.ts and helpers, apps/server/src/routes/uploadSessionsRoutes/patchUploadManifest.ts, apps/server/src/upload/ingestUploadFile/ and relevant readers if required, their tests, and docs/administration.md plus docs/media.md as applicable.

**Interfaces:** Keep existing timezone preview and upload DTO shapes. Saving timezone and deriving capture dates must use the same transactional setting value. No new dependency.

- [x] Write failing integration tests for a file declared in UTC near midnight, timezone changed to America/New_York before ingest, then completion: captured_on must equal the new zone's date. Include pending file DTO/day groups and a mixture of already-ingested/pending files.
- [x] Write failing tests protecting explicit offsets, original_captured_at, captured_at, uploader-chosen date semantics, and a manifest/completion overlapping settings save. Use fake storage only.
- [x] Update offset-less derived upload dates transactionally with timezone changes, preserving source evidence. At ingest read the current timezone inside its write transaction so delayed arrivals cannot reintroduce a stale day. Move manifest timezone reads inside the write transaction. Keep functions focused and batches bounded.
- [x] Refresh related upload-derived views without restarting byte transfers. If browser changes are required, report the exact controller integration to task 3 instead of editing web files.
- [x] Update docs, run focused timezone/upload tests and server type-check, self-review, and commit with red/green evidence.

## Task 3: Browser settings propagation and arrangement

**Files:** Modify apps/web/src/api/me/me.ts, api/publicSettings/publicSettings.ts, routes/\_\_root.tsx, routes/\_app.tsx, surfaces/Settings/useSettingsRefresh.ts and related hooks, api/mailHealth.ts, SettingsMail/MailControls.tsx, upload controller integration if task 2 requires it, and apps/web/index.html. Add small settings synchronization modules/tests alongside their owner. Update docs/web.md and docs/administration.md.

**Interfaces:** Use existing GET /me, GET /public-settings, and administrative GET /settings responses. Private URL/sender changes must refresh an open Settings form and global mail health even though those fields are absent from /me. Consume task 1's GET /mail/health?refresh=true. Use native BroadcastChannel when supported, with polling/focus/reconnect covering other devices and unsupported browsers. No new dependency or private settings broadcast.

- [x] Write and run failing tests for a second client receiving a setting update without reload, another device updating via periodic refresh, focus/reconnect, and cleanup. Use 30-second freshness/polling while visible, plus an immediate same-origin settings-change signal after successful local saves. Broadcast only a change notification, never settings or member data.
- [x] Replace permanent/static settings-cache reads with bounded freshness and mount one synchronization owner. Reconcile current /me data into router settings and invalidate dependents only when settings actually change. Avoid unnecessary router churn on every poll, overlapping refresh races, feedback loops, and discarded dirty drafts. Handle anonymous public settings and sign-out safely.
- [x] Write and run failing tests that timezone saves/remote changes invalidate both filters and people caches along with existing dependents. Reuse one invalidation definition for local and observed changes. Integrate pending-upload refresh safely if needed; never restart active transfers or discard selected files.
- [x] Write and run a failing render/navigation test that saving tidy arrangement updates the actual app ancestor and that a remote change returns it to messy. Bind the saved arrangement in the signed-in shell and remove the hardcoded root attribute so the preview and real archive agree.
- [x] Write and run a failing test that the Recheck mail health button requests refresh=true and displays the returned result with existing pending/error behavior. Ordinary background reads keep the default cached path.
- [x] Update docs, run focused web tests/type-check, self-review, and commit with red/green evidence.

## Integration and finish

- [x] Independently review each task before advancing, then review the whole branch.
- [x] Run pnpm check and address failures attributable to this change.
- [ ] Confirm main is clean, merge fix/settings-refresh locally into main, and verify the merged result.
- [ ] Verify the branch is merged, remove only this task's worktree and branch with wt, and confirm clean main. Do not touch the unrelated feat/duplicates worktree.

## Verification record

All behavior fixes were developed against failing regressions before the matching implementation. Tests use in-memory catalogs, fake storage, recording mail delivery, and browser request stubs.

- Mail: the stale older invitation retry, inherited sender name, and explicit health recheck regressions passed; the server suite passed 1,827 tests at that task boundary.
- Upload dates: pending/ingested parity, explicit offsets, chosen-date evidence, concurrent saves, bounded batches, and rollback passed. Two full-suite timing failures passed a constrained rerun without code changes.
- Browser: remote/private settings, arrangement, dirty drafts, stale reads, account transitions, safe upload metadata, and explicit mail checks passed. Five initial full-suite failures were corrected and covered by focused recovery/lifetime reruns.
- Review follow-up: remote reconciliation failure now retains pending work and retries on a later unchanged poll, without clearing newer changes or spinning an immediate retry loop.
- Final whole-repository checks and merge verification are recorded after the review gate below.

### Final verification before local integration

Combined product commit `2cb71db1` passed `VITEST_MAX_WORKERS=1 pnpm check`
with exit code 0: skills, formatting, lint, type checks, build and every test
suite passed. The previously merged exact-duplicate upload feature and version
1.0.6 release are preserved. Main's duplicate migration stays at 0012; the
unreleased sender migration is 0013.

| Suite           | Files | Tests |
| --------------- | ----: | ----: |
| Root            |    30 |   232 |
| Shared          |    24 |   292 |
| Email templates |    10 |    55 |
| Web             |   260 | 1,615 |
| Server          |   311 | 1,859 |
| Total           |   635 | 4,053 |

An earlier concurrent run exposed a pre-existing SQLite startup lock race and
a five-second timeout in the 50,002-item timezone case. The timezone case
passed unchanged in full serial runs. The startup race received a deterministic
real-process failing regression, bounded WAL initialization retry, failure
cleanup tests and independent review. Existing jsdom scrollTo notices remain
non-failing.

Independent reviews verified sender identity across sequential and overlapping
retries, retained remote timezone work during local recovery, additive migration
compatibility and integration with duplicate-upload metadata. Every reported
behavioral finding is addressed. Provider and storage tests used local fakes.

The additional startup repair is limited to `apps/server/src/db/client.ts`,
`apps/server/test/db/databaseStartup.test.ts`,
`apps/server/test/db/databaseStartupProcessFixture.ts` and
`docs/migrations.md`. Migration transaction, backup and history rules remain
unchanged. A lock persisting beyond five seconds still fails startup.

Local merge and worktree removal follow this verification record; Git ancestry
and the final repository state provide their completion evidence.
