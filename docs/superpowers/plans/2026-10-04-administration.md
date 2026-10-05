# Administration and first-run setup implementation plan

**Execution status:** implementation and automated verification complete on
2026-10-05; final independent review pending. The original task checklists below
remain the planned sequence. Actual outcomes, historical RED exceptions and
deferred acceptance are recorded in
[step-8a-verification.md](../../prds/2026-09-27-memory-shoebox/plan/step-8a-verification.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking. Juan Pablo approved the written design on 2026-10-04; the milestone specifies subagent-driven execution.

**Goal:** Deliver step 8a's administration API and a fresh-catalog setup flow that creates the first admin, offers invitations, and opens the upload-capable home page.

**Architecture:** Add resource-specific Fastify modules using the existing request context, immediate transactions, shared Zod contracts and compiled email package. Initial setup uses the existing member/session model plus one private progress setting. Its React screens use real APIs and the established Mantine theme; the remaining admin screens stay in step 9.

**Tech Stack:** pnpm workspace, Node >=22.18, TypeScript, Fastify 5, Kysely/better-sqlite3, Zod 4, React, Mantine, TanStack Router/Query, react-email, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-administration-design.md` (approved).

## Global constraints

- Work only in `feat/administration`; use `wt` for worktree operations. Do not push, merge, publish or create a PR without an explicit user instruction.
- Read `AGENTS.md`, `~/src/jpsyx/AGENTS.md`, `docs/architecture.md` and the applicable `docs/rules/` before product edits. Never hand-edit generated skills or route trees.
- Watch each behavioral test fail for the expected missing behavior before implementation; passing tests alone do not prove red/green. Keep exported functions documented and <=45 lines, extracting focused private helpers.
- Use named exports, descriptive names and source/target naming for conversions; no `any`, exported `build`/`compute` converters, `resolve` helpers or rhetorical em dashes. Relative runtime imports include `.ts` in server/shared and omit extensions in web.
- Reuse `MemberRef`, `SessionDto`, `VisibilitySummary`, existing error envelopes, email normalization and `SETTING_DEFINITIONS`. Shared runtime modules must remain erasable TypeScript.
- Every authority mutation and its audit/visibility changes commit together under `runInImmediateTransaction`. Never hold that transaction across provider/network calls.
- Private item responses and counts use the existing visibility predicate. Member/group identities are directory information; administrative extras are role-gated.
- No extra tables or product dependencies. No Vercel access. No real email or external bucket writes in automated tests.
- Preserve step 7b's implementation; its remaining live/manual acceptance runs after all build steps. Keep existing admin placeholder screens and `prototypes/` intact.
- Keep relevant docs current in the implementing task, not only at the end. Final verification is `pnpm check` plus the specified browser runs and independent code review.

## Review focus

1. Setup: simultaneous writers on separate SQLite connections, stale tabs and lost HTTP answers must produce at most one initial admin and never reopen public creation. Task 8 tests these paths.
2. Group confirmation: changing subjects, membership, roles, uploader exemptions or actual item assignments without changing totals must invalidate a previously displayed usage snapshot. Task 5 pins the affected audience and assignments.
3. Mail recovery: failed messages whose triggers were deleted or whose codes were scrubbed must not become malformed sends, live-looking expired codes or altered frozen copy. Task 6 tests retained/missing triggers and scrubbed payloads.
4. Onboarding retries: partial invitation success and a response lost after persistence must not send duplicate invitations or block the home page. Tasks 9 and 10 test both response-loss and retry behavior.
5. Observation: deleted subjects, unknown event kinds under filters, removed members and DST/window boundaries must remain honest without exposing another member's private record. Task 7 tests each input class.

## File map and shared decisions

`apps/server/src/createApp.ts` is the actual application registration point, not the older docs' `app.ts`. Tasks register their own route modules there; one implementer owns that file at a time. Use existing `createTestApp`, `insertMember`, `insertSession`, `insertInvitation`, archive seed helpers and a frozen clock. Reuse the existing invitation resend middleware rather than implementing another limiter.

New server services live beside the resources they own: `administration/` for members/groups, `settings/` for settings/timezone, `observation/` for presence/activity, `setup/` for initialization, and `mail/` for invitation enqueue/domain reads/link repair. Each route module is a thin parser/guard/service adapter. Helper files named below may be split into adjacent focused files when the 45-line limit requires it; do not create barrels.

No `/join` route exists today. Task 9 adds the contract's `/join?address=` alias into the existing `/sign-in?email=` flow; the approved design's reference to an existing mapping was an implementation assumption, not an extra sign-in system.

The existing manual capture-date setter changes the instant and source. Task 6 must not call it to apply a timezone change; it writes only the derived day and history, reusing the existing burst-ejection helper. Its revert verification calls the actual `POST /api/items/:itemId/capture-date` route, not a fictional PATCH endpoint.

The existing enqueue scrubs a `base_url_unset` sign-in-code payload immediately. Task 6 leaves those terminal rather than attempting to recover their digits. Retained, valid non-code payloads can have only their absolute links repaired.

For task tests, run the email build once before server tests if the worktree's `packages/emails/dist` is absent. Product network dependencies are fakeable through `AppDeps`, and no test uses personal environment files.

---

### Task 1: Shared administration, observation and setup contracts

**Files:** Create `packages/shared/src/administration/memberSchemas.ts`, `groupSchemas.ts`, `settingSchemas.ts`, `packages/shared/src/observation.ts`, `packages/shared/src/setup.ts`; modify `packages/shared/src/settings.ts`, `errors.ts`, `index.ts`; test `packages/shared/test/administration.test.ts`, `observation.test.ts`, `setup.test.ts`, existing `settings.test.ts`; update `docs/shared.md`, `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/administration.md` (setup appendix) and `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md` (internal setting).

**Interfaces:** Produce the administration spec's `AdminMemberDto`, `MemberInvitationDto`, `ListMembersResponse`, `InviteMemberRequest`, role/status requests and params, `ListMemberSuggestionsResponse`, `AdminGroupDto`, `ListGroupsResponse`, create/rename/replace/usage/delete contracts, `GetSettingsResponse`, `UpdateSettingsRequest/Response` and `TimezoneImpactDto`. Produce notifications Part 2's `PresenceRequest/Response`, `PresenceRow`, `ItemViewersRequest/Response`, `ItemViewerRow`, `ActivityRequest/Response`, `ActivityActor`, `ActivitySubject`, `ActivityDetail`, `ActivityEntryDto`, `ActivityFamily`, `MailDiagnosis`, `MailHealthResponse` and `MailDeliveryFailure`, reusing existing `MailQueueHealth`. Every name has its lower-camel `...Schema`, inferred type and explicit barrel export. Produce `CreateSetupRequest`, `setupStatusResponseSchema` (`{ isRequired }`), `setupProgressResponseSchema` (`{ needsInvitations }`) and `createSetupResponseSchema` as the existing session response. Export `EDITABLE_INSTANCE_SETTING_KEYS` and its derived `EditableInstanceSettingKey` for the six keys in the administration contract; retain registry-wide `SettingKey` for internal persistence.

- [ ] **Step 1: Write contract tests.** Include the following assertions plus exact DTO fields from the two binding API documents:

```ts
expect(createSetupRequestSchema.parse(validSetup).admin.email).toBe(
  "owner@example.com",
);
expect(
  createSetupRequestSchema.safeParse({ ...validSetup, role: "admin" }).success,
).toBe(false);
expect(
  createSetupRequestSchema.safeParse({
    ...validSetup,
    shoebox: { name: "Box", timezone: "invalid/zone" },
  }).success,
).toBe(false);
expect(SETTING_DEFINITIONS["setup.pending_member_id"].default).toBe(null);
expect(SETTING_DEFINITIONS["setup.pending_member_id"].isPubliclyReadable).toBe(
  false,
);
expect(apiErrorDetailsSchema.parse(groupUsage).wideningItemCount).toBe(2);
```

Test strict input parsing, nonnegative figures, canonical timestamp/id schemas, directory shapes omitting admin fields, and `members_last_admin`/member-conflict details surviving the error parser. Extend error details with `memberId`, `activeAdminCount` and optional group usage fields in the documented top-level shape, using the group schema without introducing an import cycle.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/shared test -- administration observation setup settings`. **Expected:** failing imports/missing definitions or rejected new error fields.
- [ ] **Step 3: Implement** the shared schemas. Reuse the registry schemas for setup settings, enforce existing string caps and nested strict inputs, and add only `setup.pending_member_id` to the registry with `idSchema.nullable()`, instance-only scope and private readability. Keep `PUBLIC_SETTING_KEYS` unchanged.
- [ ] **Step 4: Run** the same test command, then `pnpm --filter @memory-shoebox/shared type-check`. **Expected:** all targeted tests and types pass.
- [ ] **Step 5: Commit** `feat: define administration and setup contracts`.

### Task 2: Settings persistence/read and actionable mail health

**Files:** Create `apps/server/src/settings/saveInstanceSetting.ts`, `readAdminSettings.ts`, `apps/server/src/mail/readMailHealth.ts`, `createMailDomainReader.ts`, `mailDomainReader.types.ts`, `apps/server/src/routes/registerSettingsRoutes.ts`, `registerMailHealthRoutes.ts`; modify `createApp.ts`; test `apps/server/test/routes/adminSettingsRead.test.ts`, `mailHealth.test.ts`, `apps/server/test/mail/mailDomainReader.test.ts`; update `docs/mail.md`, `docs/server.md`, new `docs/administration.md`.

**Interfaces:** Produce `saveInstanceSetting<Key extends SettingKey>(options: { transaction: DatabaseExecutor; key: Key; value: SettingValue<Key>; memberId: string | undefined; now: string }): Promise<void>` (upsert only, caller owns audit). Produce `readAdminSettings(database: DatabaseExecutor): Promise<GetSettingsResponse>` and `readMailHealth(options: { database: DatabaseExecutor; domainReader: MailDomainReader | undefined; now: string }): Promise<MailHealthResponse>`. `MailDomainReader` is `(domain: string) => Promise<{ isVerified: boolean; error: string | undefined }>`; `createMailDomainReader(config: Config): MailDomainReader | undefined` returns no reader without a key. Add an optional test override to `AppDeps`, and decorate the resolved reader on Fastify. Register `GET /settings` and `GET /mail/health` under `/api`.

- [ ] **Step 1: Write route/service tests** with an empty settings table, storage sum 0, stored provenance and forbidden lower roles:

```ts
expect(settingsResponse.json().defaultedKeys).toHaveLength(6);
expect(settingsResponse.json().storage).toEqual({ itemCount: 0, byteSize: 0 });
expect(healthResponse.json().diagnosis.code).toBe("base_url_unset");
expect(nonAdminResponse.statusCode).toBe(403);
expect(JSON.stringify(healthResponse.json())).not.toContain(secretCode);
```

Cover each diagnosis rung, partly-sending versus wholly-failing states, genuinely unconfigured provider, suppressed addresses, recent failures and absence of raw payloads. Persist domain facts only from a successful real-source reader, never from an administrative setting value.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test -- adminSettingsRead mailHealth mailDomainReader`. **Expected:** routes 404 or missing services.
- [ ] **Step 3: Implement** batched settings/provenance reads, indexed storage aggregate and upsert matching the partial instance index. Reuse `readMailQueueHealth`. The provider adapter uses the installed Resend SDK's paginated `domains.list`, matches the exact sender domain, and accepts only `status === "verified"` with sending enabled. Sanitize provider errors; no DNS writes, verification action or test-send endpoint. Cache provider reads for 60 seconds per domain within the adapter, never across domain changes. Do the network read outside a write transaction, then update the two internal domain facts. In fake/disabled mail, do not contact a provider or invent verified status.
- [ ] **Step 4: Run** the same tests and `pnpm --filter @memory-shoebox/server type-check`. **Expected:** pass, with no provider call during any test.
- [ ] **Step 5: Commit** `feat: read administration settings and mail health`.

### Task 3: Invitation email, member lists and invite creation

**Files:** Create `packages/emails/src/templates/InvitationEmail.tsx`, `packages/emails/test/InvitationEmail.test.tsx`, `apps/server/src/administration/readAdminMembers.ts`, `inviteMember.ts`, `readMemberSuggestions.ts`, `apps/server/src/mail/enqueueInvitationEmail.ts`, `apps/server/src/routes/registerMemberRoutes.ts`; modify email `src/index.ts`, server `mail/templates/emailTemplates.constants.ts`, `createApp.ts`, `activity/writeActivityEvent/writeActivityEvent.ts`; test `apps/server/test/routes/memberInvitations.test.ts`, `memberDirectory.test.ts`, `memberSuggestions.test.ts`; update `docs/emails.md`, `docs/administration.md`.

**Interfaces:** Export `invitationEmail: EmailTemplate<InvitationEmailPayload>` using the already-existing shared invitation payload. Add invitation extras/template/renderer to the existing registries. Produce `readAdminMembers(options: { database: DatabaseExecutor; currentSessionId: string; statuses: readonly MemberStatus[]; now: string }): Promise<Extract<ListMembersResponse, { shape: "admin" }>>`; `inviteMember(options: { database: DatabaseExecutor; viewer: Viewer; body: InviteMemberRequest; now: string }): Promise<AdminMemberDto>`; `enqueueInvitationEmail(options: { transaction: DatabaseExecutor; invitationId: string; inviterMemberId: string; invitedMemberId: string; sendCount: number; expiresAt: string; now: string }): Promise<void>`. Add this slice's activity kinds and subject kinds to the existing writer without changing its callers.

- [ ] **Step 1: Write failing tests** for HTML/plain-text zero/singular/plural counts, address-prefilled `/join?address=`, escaped names, expiry and frozen inviter attribution. Route tests assert:

```ts
expect(inviteResponse.statusCode).toBe(201);
expect(invitedMember.status).toBe("invited");
expect(queueRow.idempotency_key).toBe(`invite:${invitationId}:1`);
expect(invitationPayload.visibleItemCount).toBe(1); // one public item, two restricted ones
expect(directoryResponse.json().members[0]).not.toHaveProperty("email");
```

Include removed-row reuse with unchanged join timestamps/content links, active/pending conflicts carrying memberId, first code sign-in accepting the new invitation, lower-role status filtering 403, no session-per-member query loop and admin-only suggestions capped at five. Force enqueue failure to prove the member/invitation/activity writes roll back.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/emails test -- InvitationEmail`; build emails for the server harness, then `pnpm --filter @memory-shoebox/server test -- memberInvitations memberDirectory memberSuggestions`. **Expected:** missing template or 404 routes.
- [ ] **Step 3: Implement** list/create/suggestion routes and the transaction services. Invitation prospective counts use the invitee's role/group expansion and the shared item predicate, not the requesting admin's visibility. Query all sessions/latest invitations in batches. Use the standard seven-day expiry and declared idempotency recipe. Freeze all copy at enqueue; no provider call in the transaction.
- [ ] **Step 4: Run** the same tests plus the emails build and compiled runtime-import tests. **Expected:** all pass; queued invite accepts through existing auth.
- [ ] **Step 5: Commit** `feat: invite members with private invitation emails`.

### Task 4: Member authority mutations, resend, revoke and lapse

**Files:** Create `apps/server/src/administration/changeMemberRole.ts`, `removeMember.ts`, `revokeMemberInvitation.ts`, `resendMemberInvitation.ts`, `revokeMemberSession.ts`; extend `registerMemberRoutes.ts`; modify `jobs/runInvitationLapse.ts`; test `apps/server/test/routes/memberAuthority.test.ts`, `memberResend.test.ts`, `memberRevocation.test.ts`, `apps/server/test/jobs/runInvitationLapse.test.ts`; update `docs/administration.md`, `docs/auth.md`.

**Interfaces:** Each mutation takes `{ database: DatabaseExecutor; viewer: Viewer; memberId: string; now: string }`; role additionally takes `role: MemberRole`, session revoke additionally takes `sessionId: string`. Member mutations return `Promise<AdminMemberDto>`; session revoke returns `Promise<void>`. Keep `runInvitationLapse({ database, now }): Promise<InvitationLapseSummary>` intact. Consume task 3's DTO reader/enqueue and the existing `bumpVisibilityGeneration`/resend middleware.

- [ ] **Step 1: Write failing tests** for immediate access revocation, surviving authorship, invited-admin exclusion, self demotion/removal and concurrent admin attempts:

```ts
expect(lastAdminDemotion.statusCode).toBe(409);
expect(lastAdminDemotion.json().error).toBe("members_last_admin");
expect(lastAdminRemoval.statusCode).toBe(409);
expect(await activeAdminCount()).toBeGreaterThanOrEqual(1);
expect(revokedDeviceRead.statusCode).toBe(401);
expect(resendResponse.json().invitation.sendCount).toBe(2);
```

Use separate database connections to the same temporary file for the concurrency case; do not race two immediate transactions on one handle. Test missing/mismatched session parity, 1/minute and 10/day middleware refusal, resend preserving invitation id and extending expiry, and revoked/job-lapsed invitees being unable to redeem a previously issued code. Lapse chooses only the latest unrevoked/unaccepted invitation, drops memberships/sessions and invalidates visibility in one transaction. No duplicate expiry check in auth.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test -- memberAuthority memberResend memberRevocation runInvitationLapse`. **Expected:** missing mutation routes or incomplete lapse cleanup.
- [ ] **Step 3: Implement** each mutation and recount under `BEGIN IMMEDIATE`, with exactly the specified audit event, timestamp/history behavior and generation bump. Reuse persisted resend checks and invitation email enqueue; attach their middleware config. Correct the lapse module's inaccurate resend comment. Keep double removal a 409 and session revoke a 204.
- [ ] **Step 4: Run** the same tests plus `pnpm --filter @memory-shoebox/server test -- authGuarantees redeemSignInCode`. **Expected:** pass without changing ordinary sign-in behavior.
- [ ] **Step 5: Commit** `feat: enforce member authority and invitation lifecycle`.

### Task 5: Groups, usage snapshots and confirmed deletion

**Files:** Create `apps/server/src/administration/readGroups.ts`, `changeGroups.ts`, `readGroupUsage.ts`, `groupUsageTokenHelpers.ts`, `deleteGroup.ts`, `apps/server/src/routes/registerGroupRoutes.ts`; modify `createApp.ts` and, only if needed, extract the existing visibility digest algorithm into `apps/server/src/visibility/makeSubjectDigestFromSubjects.ts` consumed by `items/getVisibilityRuleFromSubjects.ts`; test `apps/server/test/routes/groups.test.ts`, `groupAccess.test.ts`, `groupDeletion.test.ts`, `apps/server/test/administration/groupUsageToken.test.ts`; update `docs/administration.md`.

**Interfaces:** Produce `readGroups(options: { database: DatabaseExecutor; viewer: Viewer }): Promise<ListGroupsResponse>`, `readGroupUsage(options: { database: DatabaseExecutor; groupId: string; secret: string; now: string }): Promise<GroupUsageResponse>`, `deleteGroup(options: { database: DatabaseExecutor; viewer: Viewer; groupId: string; confirmationToken: string | undefined; secret: string; now: string }): Promise<void>`. In `changeGroups.ts`, export `createGroup`, `renameGroup` and `replaceGroupMembers`, each taking `{ database: DatabaseExecutor; viewer: Viewer; body; now: string }`: body is respectively `CreateGroupRequest`, `RenameGroupRequest` and `ReplaceGroupMembersRequest`; returns are respectively `Promise<AdminGroupDto>`, `Promise<AdminGroupDto>` and `Promise<ReplaceGroupMembersResponse>`. Token helpers consume the same canonical usage snapshot in read and delete.

- [ ] **Step 1: Write failing tests** for admin/picker split, viewer refusal, normalized-name conflicts, invited versus removed members, deduplication, no-op PUT bumps and rename no-bump. Access tests use the same authenticated cookie before and after membership changes. Deletion assertions include:

```ts
expect(beforeExceptItem.statusCode).toBe(404);
expect(afterConfirmedDeletion.statusCode).toBe(200);
expect(unconfirmedDelete.json().error).toBe("groups_confirmation_required");
expect(changedUsageDelete.json().error).toBe("groups_usage_changed");
expect(remainingOnlyRule.mode).toBe("only");
expect(remainingOnlySubjects).toEqual([]);
```

Change subjects, memberships, roles, uploader/item assignments with unchanged totals and verify stale tokens fail; also test ten-minute expiry, tampering, wrong group, zero-item referenced rules, empty unused groups, equivalent digest collisions and historical event labels. Assert fresh usage survives error response parsing.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test -- groups groupAccess groupDeletion groupUsageToken`. **Expected:** 404 routes or missing token helpers.
- [ ] **Step 3: Implement** batched group/membership/item-count reads, set-based eligibility deltas and HMAC-bound canonical snapshots. The digest includes sorted rules/modes/subjects, expanded audience facts including roles/uploader exemptions, and item ids, in addition to reported counts. Derive a domain-separated key from SESSION_SECRET, encode issue time, compare signatures safely and recompute inside the delete transaction. Remove subjects, recompute the existing canonical subject digest, preserve empty `only` rules, delete the group, bump generation and log the widening atomically.
- [ ] **Step 4: Run** the same tests plus existing visibility-rule tests. **Expected:** pass with no stale cookie privileges and no shared-rule identity regression.
- [ ] **Step 5: Commit** `feat: manage groups with confirmed access changes`.

### Task 6: Settings writes, timezone preview/history and mail repair

**Files:** Create `apps/server/src/settings/previewTimezoneChange.ts`, `applyTimezoneChange.ts`, `updateAdminSettings.ts`, `apps/server/src/mail/requeueBaseUrlFailures.ts`; extend `registerSettingsRoutes.ts`; test `apps/server/test/routes/adminSettingsWrite.test.ts`, `timezoneChange.test.ts`, `apps/server/test/mail/requeueBaseUrlFailures.test.ts`; update `docs/administration.md`, `docs/mail.md` and `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/administration.md` (timezone ruling 4) if its route body remains stale.

**Interfaces:** Produce `previewTimezoneChange(options: { database: DatabaseExecutor; fromZone: string; toZone: string }): Promise<TimezoneChangePlan>` with `impact: TimezoneImpactDto` and changed item rows `{ itemId, capturedAt, previousCapturedOn, capturedOn, captureSource, burstId }`. Produce `applyTimezoneChange(options: { transaction: DatabaseExecutor; plan: TimezoneChangePlan; memberId: string; now: string }): Promise<void>` and `updateAdminSettings(options: { database: DatabaseExecutor; viewer: Viewer; body: UpdateSettingsRequest; isPreview: boolean; now: string }): Promise<UpdateSettingsResponse>`. Produce `requeueBaseUrlFailures(options: { transaction: DatabaseExecutor; baseUrl: string; now: string }): Promise<number>`.

- [ ] **Step 1: Write failing tests** for strict six-key validation/internal refusal, no-op versus changed audits, multi-key rollback and preview immutability:

```ts
expect(preview.json().isPreview).toBe(true);
expect(await snapshotCatalog()).toEqual(beforePreview);
expect(movedItem.captured_at).toBe(originalInstant);
expect(movedItem.capture_source).toBe(originalSource);
expect(history.map((row) => row.reason)).toEqual([
  "timezone_change",
  "timezone_change",
]);
expect(repairedPayload.visibleItemCount).toBe(frozenCount);
```

Cover DST/midnight/no-offset dates, explicit offsets unchanged, empty/nonempty bursts, milestone flags, and one history row per moved item containing both local days and unchanged instants. Revert each moved item's date through `POST /api/items/:itemId/capture-date`, using that history row's previous date. Test seven-day boundary, only base-URL failures, multiple email families, deleted triggers, malformed retained payloads and scrubbed/expired sign-in codes staying terminal.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test -- adminSettingsWrite timezoneChange requeueBaseUrlFailures`. **Expected:** missing PATCH route/impact/repair behavior.
- [ ] **Step 3: Implement** the registry-based writer and shared impact calculation. Save recomputes the plan under the transaction lock; preview performs the same calculation without writes. Timezone updates write only `captured_on`, per-item audit rows and the existing burst/milestone consequences, preserving capture evidence. Call `ejectCaptureDateBurstFrames`, not the manual setter. Requeue valid retained non-code payloads younger than seven days, rewriting `baseUrl` and kind-specific absolute links only; keep payload copy and recipient fields unchanged. Do not reconstruct missing trigger content or scrubbed digits; leave those rows failed with their diagnosis.
- [ ] **Step 4: Run** the same tests plus `pnpm --filter @memory-shoebox/server test -- itemCaptureDate setItemCaptureDates`. **Expected:** pass with original manual correction behavior intact.
- [ ] **Step 5: Commit** `feat: update settings with reversible timezone history`.

### Task 7: Presence, item viewers and exhaustive activity feed

**Files:** Create `apps/server/src/observation/readPresence.ts`, `readItemViewers.ts`, `readActivity.ts`, `activityKindHelpers.ts`, `activityDetailHelpers.ts`, `apps/server/src/routes/registerObservationRoutes.ts`; modify `createApp.ts`; test `apps/server/test/routes/presence.test.ts`, `itemViewers.test.ts`, `activity.test.ts`, `apps/server/test/observation/activityKindHelpers.test.ts`; update `docs/administration.md`, `docs/server.md`.

**Interfaces:** Produce `readPresence(options: { database: DatabaseExecutor; viewer: Viewer; memberId: string | undefined; now: string }): Promise<PresenceResponse>`; `readItemViewers(options: { database: DatabaseExecutor; viewer: Viewer; itemId: string }): Promise<ItemViewersResponse>`; `readActivity(options: { database: DatabaseExecutor; query: ActivityRequest }): Promise<ActivityResponse>`; `getActivityFamilyFromKind(kind: string): ActivityFamily` which throws for unknown kinds. Register the three documented reads, reusing existing visible-item guard and cursor conventions.

- [ ] **Step 1: Write failing tests** for admin versus self, local-day union counts and sorting, eligible unseen members versus tagged-only members, removed-member opened history and visibility-first refusals:

```ts
expect(otherMemberPresence.statusCode).toBe(403);
expect(invisibleItemViewers.body).toBe(nonexistentItemViewers.body);
expect(visibleNonAdminItemViewers.statusCode).toBe(403);
expect(() => getActivityFamilyFromKind("unknown_kind")).toThrow();
expect(firstPage.nextCursor).not.toBe(null);
expect(new Set(allPages.map((entry) => entry.entryId)).size).toBe(
  allPages.length,
);
```

Test unknown kinds under a family filter via a disposable SQLite fixture that deliberately permits the corrupt kind without altering production migrations. Verify timestamps tied to ids, filter combinations, dangling subjects, renamed actors/devices, per-kind detail whitelisting, DST and 90-day boundaries, zero marks and no per-member SQL loops.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test -- presence itemViewers activity activityKindHelpers`. **Expected:** 404 routes/missing mapping.
- [ ] **Step 3: Implement** grouped durable-mark reads, eligible-member set expansion and exhaustive family/detail mapping. Validate distinct stored kinds before applying family pagination so corrupt filtered-out rows do not disappear. Keep all historic labels from event rows and device labels independent of session survival; no content unions, raw detail passthrough or analytics writes.
- [ ] **Step 4: Run** the same tests and server type-check. **Expected:** pass, including byte-identical visibility failures.
- [ ] **Step 5: Commit** `feat: expose private administration observation reads`.

### Task 8: Atomic first admin and durable setup API

**Files:** Create `apps/server/src/setup/initializeShoebox.ts`, `readSetupStatus.ts`, `readSetupProgress.ts`, `completeSetup.ts`, `setupOriginHelpers.ts`, `apps/server/src/routes/registerSetupRoutes.ts`; modify `createApp.ts`, `http/rateLimit/rateLimit.constants.ts`; test `apps/server/test/routes/setup.test.ts`, `apps/server/test/setup/setupConcurrency.test.ts`, `setupRollback.test.ts`, `apps/server/test/http/rateLimit/registerRateLimit.test.ts`; add `docs/setup.md` and update `docs/auth.md`, `docs/configuration.md`, `docs/architecture.md` and API conventions.

**Interfaces:** Produce `initializeShoebox(options: { database: DatabaseExecutor; body: CreateSetupRequest; userAgent: string | undefined; now: string }): Promise<{ response: CreateSessionResponse; token: string }>` (extract the four-field input into a named type). Produce `readSetupStatus(database: DatabaseExecutor): Promise<{ isRequired: boolean }>`, `readSetupProgress(options: { database: DatabaseExecutor; viewer: Viewer }): Promise<{ needsInvitations: boolean }>` and `completeSetup(options: { database: DatabaseExecutor; viewer: Viewer; now: string }): Promise<void>`. Consume task 2 persistence, task 1 progress registry and existing session/cookie/account/shell helpers. New middleware rule `setupCreatePerIp`: 20 attempts/3600 seconds.

- [ ] **Step 1: Write failing tests** on a migrated unseeded catalog:

```ts
expect(initialStatus.json()).toEqual({ isRequired: true });
expect(created.statusCode).toBe(201);
expect(created.json().me.role).toBe("admin");
expect(created.headers["set-cookie"]).toContain("HttpOnly");
expect(created.json()).not.toHaveProperty("token");
expect(await memberCount()).toBe(1);
expect(replayed.json().error).toBe("setup_already_completed");
expect(homeSessionRead.statusCode).toBe(200);
```

Test status when only settings/codes exist, invited/removed rows closing setup, 401/403 progress/completion, any active admin completing idempotently, no invitation row for the initial admin, sender-name default and messy arrangement. Reject unsupported content types, `Origin: null`, malformed/cross-origin Origin and a malicious submitted base URL trying to bypass origin checks. Accept missing Origin for non-browser clients. Check trusted single-proxy serving origin, 20th/21st attempt and no input/IP/secret logging. Inject an aborting SQLite trigger to prove complete rollback and no cookie. Use separate app processes or worker threads with separate file-backed connections to prove two competing initializations yield one 201 and one 409 without an event-loop deadlock.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test -- setup setupConcurrency setupRollback registerRateLimit`. **Expected:** setup route 404 or absent middleware rule.
- [ ] **Step 3: Implement** the no-member recheck and all admin/settings/progress/session/audit writes under one immediate transaction. Compose response before commit while token stays internal; attach cookie only after success. Use `isFirstSignIn: true`, standard 30-day session, existing notification defaults and active join/sign-in timestamps. GET status/progress use `Cache-Control: no-store`; repeated setup never modifies any instance data. No provider calls, emailed code requirement or new owner role.
- [ ] **Step 4: Run** the same tests plus existing unknown-address/sign-in-code guarantees. **Expected:** pass with ordinary authentication unchanged.
- [ ] **Step 5: Commit** `feat: initialize empty shoeboxes with one admin`.

### Task 9: Setup screens, routing, invitation recovery and join alias

**Files:** Create `apps/web/src/api/setup/setup.ts`, `setup.test.ts`, `apps/web/src/api/adminMembers/adminMembers.ts`, `apps/web/src/api/mailHealth/mailHealth.ts`, `apps/web/src/session/setupNavigation.ts`, `setupNavigation.test.ts`, `apps/web/src/surfaces/Setup/SetupForm.tsx`, `SetupInvitations.tsx`, `Setup.module.css`, `useSetupCreation.ts`, `useSetupInvitations.ts` and their tests; create `apps/web/src/routes/setup.tsx`, `_app/setup.invite.tsx`, `join.tsx`; modify root and `_app.tsx`, route/rendering tests and generate `routeTree.gen.ts`; update `docs/setup.md`, `docs/web.md`.

**Interfaces:** API functions `createSetup(body: CreateSetupRequest): Promise<CreateSessionResponse>`, `completeSetup(): Promise<void>`, `inviteMember(body: InviteMemberRequest): Promise<AdminMemberDto>` and query options for setup status/progress/mail health. Keep admin-member query/data separate from the existing stripped picker cache. Export `getSetupRedirectFromNavigation(state: SetupNavigationState): SetupRedirect | undefined` from `setupNavigation.ts`. State contains `{ isRequired: boolean; me: MeResponse | null; needsInvitations: boolean; pathname: string; attemptedUrl: string }`; redirect contains `{ to: "/setup" | "/setup/invite" | "/sign-in" | "/"; redirect?: string }`, with `undefined` meaning continue on the requested route. Use this decision from root/setup/app guards rather than duplicating cases. `SetupForm` and `SetupInvitations` components use task 8/task 3 real adapters.

- [ ] **Step 1: Write failing adapter/route/component tests** for uninitialized cold/deep load, initialized anonymous sign-in redirect, root fetch failure with retry, pending creator reload, non-admin routing, permanent email review and UTC fallback. Assert UI requests and cache transitions:

```ts
expect(submittedSetup.admin.email).toBe("owner@example.com");
expect(submittedSetup.shoebox.timezone).toBe(browserZone);
expect(submittedSetup.mail?.fromAddress).not.toBe(adminInbox);
expect(submittedSetup.public.baseUrl).toBe(window.location.origin);
expect(inviteRequests.map((body) => body.email)).toEqual([
  "one@example.com",
  "two@example.com",
]);
expect(retryRequests.map((body) => body.email)).toEqual(["two@example.com"]);
expect(finalNavigation).toBe("/");
```

Test lost create response followed by successful `/me` recovery, missing cookie following normal sign-in, 409 stale setup tab, invalid nested field mapping and focus. On lost invitation response, recover a matching pending row from the real admin directory before retrying; do not treat an arbitrary existing member conflict as newly queued. Preserve successful rows during retry, allow skip despite failure, and do not persist emails or setup state in URL/localStorage. Test `/join?address=` prefills sign-in without validating the query before form submission or granting access.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/web test -- setup Setup routes rendering`. **Expected:** missing adapters/routes or setup UI.
- [ ] **Step 3: Implement** within the established Mantine styles. Read setup status with fresh query data (`staleTime: 0`), seed/invalidate the `/me` and setup query keys after mutations, and use progress only for an active admin. Guard `/setup/invite` as a signed-in admin path without redirect loops; it may render its own bar via existing static data. Root failures render an explicit retry state. Fields are labelled, roles use native select, targets >=48px, errors ink/icon/text rather than accent. Use mutation callbacks and extracted hooks; optional sender settings never gate creation. The invite form starts with one row, supports adding people, validates before sends, preserves successes, completes only after all intended rows queue or explicit skip, then navigates home.
- [ ] **Step 4: Generate** routes through `pnpm --filter @memory-shoebox/web build`; run the same tests and web type-check. **Expected:** pass, generated route tree matches the new routes, existing sign-in and upload lifetime tests remain green.
- [ ] **Step 5: Commit** `feat: guide first-run admins from setup to home`.

### Task 10: Real fresh-catalog browser proof, review and completion

**Files:** Create `playwright.setup.config.ts`, `e2e/setup/setup.fixtures.ts`, `setup.spec.ts`, `setup.keyboard.spec.ts`, `setup.responsive.spec.ts`; exclude `e2e/setup/` from standard projects in `playwright.config.ts`; update `docs/e2e.md`, `docs/setup.md`, `docs/README.md`, step 8a status/design/plan and `docs/architecture.md`.

**Interfaces:** The setup fixture starts the real `createApp` on a dynamically assigned loopback port with an isolated temporary SQLite file per test, the built web distribution, fake B2 and no email service. It migrates rather than seeding a member, offers a read-only assertion handle and closes app/connections before removing only its own temporary directory. The standalone setup config builds the shared email/web artifacts before browser workers and runs `setup-chrome` and `setup-webkit` with one worker. Standard E2E catalogs/order/ports remain independent.

- [ ] **Step 1: Write failing browser scenarios** for creation/skip/home upload entry, creation/multiple invitations/home, partial invite failure/retry, pending reload, two setup tabs, lost create/invite answers, existing-catalog/deep-link bypass, mail-unconfigured diagnosis and `/join` code acceptance. Read actual rows to assert admin role, one initial member, correctly queued invitations and setup progress clearing. Intercept only failure/lost-answer seams, never successful contract responses.
- [ ] **Step 2: Run** `pnpm exec playwright test --config playwright.setup.config.ts`. **Expected:** any remaining navigation/UI defects fail with the actual behavior identified; retain artifacts. If earlier tasks already satisfy a scenario, record it as passing integration coverage rather than fabricating a red result. The fixture must not reset a live catalog through an HTTP test-only endpoint or unlink an open database file.
- [ ] **Step 3: Finish** fixture integration and behavioral gaps using their red/green tests. Add phone 390px, tablet 768px, desktop 1280px, Day/Night and a 640x450 layout check for the 200% viewport equivalent; report the latter honestly as a layout equivalent, not genuine browser zoom. Verify keyboard-only creation/invite/skip, error focus, labelled fields, no clipped actions and active text contrast. Inspect a batched desktop/phone screenshot round, fix discovered defects together, then at most one confirmation round. Run the Impeccable detector over changed UI targets and perform its scoped finish review.
- [ ] **Step 4: Run** `pnpm check`; `pnpm exec playwright test --config playwright.setup.config.ts`; `pnpm test:e2e --project chromium` for ordinary sign-in/account/archive/item regression. **Expected:** all pass; record commands/counts and any truly unavailable manual acceptance separately. Do not run step 7b's deferred real-bucket or physical-device checks, and do not mark those passed. Existing parked full-picker acceptance stays for its next frontend owner.
- [ ] **Step 5: Review and commit.** Request independent whole-branch code review against this plan, approved design and task ledger, including all five Review Focus inputs. Fix material findings with failing regressions then rerun affected checks. Mark step 8a implemented only after its automated requirements pass; keep step 7b final acceptance deferred. Commit `test: verify administration and first-run setup` and leave the branch/worktree available for Juan Pablo's review. No merge/push/PR is implied.

## Plan self-review and handoff

All approved design sections map to tasks: shared contracts (1), settings/mail health (2), invitations/email/list/suggestions (3), authority/lifecycle (4), groups (5), timezone/mail repair (6), observation (7), atomic setup (8), setup/alias UI (9), integrated verification/current docs (10). Task dependencies run in that order; no concurrent implementers edit shared registration/barrel files. Helper extraction changes only code that the slice consumes directly.

Confirmed implementation corrections: registration is `createApp.ts`; `/join` must be added; manual capture corrections use POST and are not the timezone writer; invitation rate limiting already persists its counters; scrubbed code rows cannot be requeued meaningfully. These corrections preserve the approved behavior rather than expanding product scope.

The milestone already selected subagent-driven development. Review this detailed plan before that execution begins, as required by the writing-plans handoff. After review, use the per-task test/review ledger and continue through all tasks without additional routine approval stops.
