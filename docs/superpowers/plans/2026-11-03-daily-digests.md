# Daily Email Digests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offer Off, Immediate, and Daily digest for uploads, comments/replies,
and comment tags, with the requested defaults applied to new and existing members.

**Architecture:** Store pending activity separately from the existing outbox.
Feature transactions route eligible notifications into immediate mail or durable
digest events; a local-time job prepares one combined digest, which the current
mail worker delivers with additional privacy and stable-retry checks.

**Tech Stack:** TypeScript, Fastify, SQLite/Kysely, Zod, React/Mantine, react-email, Vitest, Playwright.

**Spec:** [Approved daily digest design](../specs/2026-11-03-daily-digests-design.md).

## Global Constraints

- Each category offers Off, Immediate, or Daily digest. There is no weekly digest.
- Upload and comment/reply defaults are `daily`; comment-tag default is `immediate`.
- Reset all existing members once, including previous opt-outs and inactive members.
- One combined email at 9 a.m. in the configured Shoebox timezone, covering the
  previous calendar day. Send nothing on empty days.
- Removal preferences and their existing weekly reminders remain unchanged.
- At most 20 source entries per category; comment excerpts at most 200 characters.
- Provider retries must reuse the frozen body, sender, and idempotency key.
- Node >=22.18.0; no new dependency, external scheduler, or production mutation.
- Server/shared relative imports end in `.ts`; email imports use `.ts`/`.tsx`;
  web imports omit extensions. Follow `docs/rules/` and the naming checklist.
- No em dashes, no generated skill-directory edits, and no unrelated refactoring.
- All mail tests use local fake/recording services. Local servers use
  `NODE_ENV=development ENABLE_FAKE_EMAIL=true`.
- Work only in the existing `feat/daily-digests` worktree. Do not push, merge,
  deploy, or alter production settings as part of this plan.

## Review Focus

These five risks have explicit tests in their owning tasks.

1. Old clients submit booleans or `onReply`: reject without changing stored
   preferences; expose reload guidance. Task 3 owns the test.
2. Upload source rows survive differently from their items: missing sources and
   deleted or newly hidden media must never contribute stale counts. Task 5.
3. A process may die after recording provider intent but before finalizing its
   result: retain the frozen request and current `sending` policy. Task 7.
4. Non-hour offsets and midnight timezone transitions can break a naive calendar
   cutoff: select by local calendar date and test Kathmandu and Santiago. Task 5.
5. Database failure during a preference save can cancel events without saving
   the setting unless both writes share a transaction. Task 3.

## File structure and shared interfaces

Existing entry points are `routes/me.ts`, `items/enqueueCommentEmails.ts`,
`items/reconcileCommentTagEmails.ts`, `upload/enqueueUploadSessionEmails/`,
`mail/deliverQueuedEmail.ts`, and `jobs/createJobRegistry.ts` under
`apps/server/src`. Preserve their current unrelated responsibilities.

New units under `apps/server/src/mail/digests/`:

| File                             | Responsibility                                           |
| -------------------------------- | -------------------------------------------------------- |
| `digest.types.ts`                | Internal source, window, eligible-event, and batch types |
| `recordDigestEvent.ts`           | Idempotent insert in the caller's transaction            |
| `cancelPendingDigestEvents.ts`   | Category/source cancellation without deleting history    |
| `getDigestWindowFromInstant.ts`  | Local send date, 09:00 gate, calendar cutoff             |
| `readEligibleDigestEvents.ts`    | Current members, preferences, sources, and visibility    |
| `makeDigestPayloadFromEvents.ts` | Stable ordering, summaries, totals, bounds, links        |
| `prepareDailyDigest.ts`          | One member's atomic batch/outbox preparation             |
| `runDailyDigests.ts`             | Bounded recipient iteration for one scheduler tick       |
| `prepareDigestDelivery.ts`       | Recheck content before send; freeze or reuse the request |

Add `mail/scheduleActivityNotification.ts` for feature routing and
`members/saveNotifyPreferences.ts` for the account transaction's preference work.
Add `packages/shared/src/notificationFrequency.ts` and
`packages/shared/src/email/dailyDigestEmailPayload.ts`. Tests live beside existing
package tests, including new `apps/server/test/mail/digests/` files.

The interface names below are decisions, not suggestions. Object options are
readonly. `DatabaseExecutor` comes from `db/types/db.types.ts`, `Database` is the
existing Kysely database type, and `EmailPayloadExtras` is the current template
registry mapping. Public interfaces receive doc comments; keep function bodies
within the repository's 45-line limit by extracting focused private helpers.

### Shared vocabulary

```ts
type NotificationFrequency = "off" | "immediate" | "daily";
type ActivityNotificationCategory = "upload" | "comment" | "comment_tag";
type ActivityEmailKind = "upload_session" | "comment" | "comment_tag";
type DigestSource =
  | { category: "upload"; sourceKind: "upload_session"; sourceId: string }
  | {
      category: "comment" | "comment_tag";
      sourceKind: "comment";
      sourceId: string;
    };
type DigestWindow = {
  sendDate: string;
  timezone: string;
  cutoffLocalDate: string;
};
```

`cutoffLocalDate` equals `sendDate`: an event is old enough when its local
occurrence date is strictly less. This avoids manufacturing a nonexistent local
midnight. UTC timestamps remain authoritative; a SQL upper bound followed by the
local-day predicate may optimize reads without changing this rule.

## Execution and baseline

- [ ] Read the spec, current worktree instructions, `docs/PRODUCT.md`,
      `docs/architecture.md`, `docs/mail.md`, `docs/emails.md`, `docs/migrations.md`,
      and applicable `docs/rules/`. Run `pnpm skills`. Load TDD before implementation;
      load impeccable before the UI task and Playwright skills before browser tests.
- [ ] Verify branch `feat/daily-digests` and a clean starting tree. Dependencies
      were installed by `wt`; use `pnpm install` only if the lock or installation needs it.
- [ ] Run `pnpm --filter @memory-shoebox/emails build`, then `pnpm test` to record
      the baseline. Investigate failures with systematic-debugging before attributing
      them to this change. Do not run the app against copied production configuration.

All test commands below are run from the worktree root. Each task follows
red/green: run its newly written tests before implementation, confirm the intended
failure, implement, rerun, then commit only that task's files. Shared-contract
changes are integrated across tasks; whole-workspace checks are required before
completion. Never use `git add .` to capture unrelated files.

### Task 1: Add durable digest storage and migrate existing users

**Files:** Create `apps/server/src/db/migrations/0022_daily_digests.ts`,
`apps/server/src/db/types/digests.types.ts`,
`apps/server/src/db/schemaManifest/digests.ts`,
`apps/server/test/schema/dailyDigestsMigration.test.ts`.
Modify `db/migrations/migrations.ts`, `db/types/db.types.ts`,
`db/types/identityAndAccess.types.ts`, `db/schemaManifest/schemaManifest.ts`,
`db/schemaManifest/identityAndAccess.ts`, `db/schemaManifest/operations.ts`,
all under `apps/server/src`; update `docs/migrations.md`.

**Interfaces:** Migration exports `up(database: Kysely<unknown>): Promise<void>`.
New member columns are `notify_upload_frequency`, `notify_comment_frequency`,
and `notify_comment_tag_frequency`. New table types are
`NotificationDigestEventsTable` and `NotificationDigestBatchesTable`.

- [ ] **Red:** Start a populated catalog at 0021 using the existing migration
      source-filter fixture. Include active/invited/removed members, mixed opt-outs,
      dependent delivery events, and queued/sending/sent/failed notifications.

  ```ts
  expect(memberFrequencies).toEqual(["daily", "daily", "immediate"]);
  expect(after.notify_on_removal).toBe(before.notify_on_removal);
  expect(convertedSourceKeys).toEqual(neverAttemptedQueuedActivityKeys);
  expect(afterTagAndAttemptedRows).toEqual(beforeTagAndAttemptedRows);
  expect(foreignKeyViolations).toEqual([]);
  expect(integrityResult).toBe("ok");
  ```

  Test a second startup after saving `off`; assert it remains `off`. Invalid
  frequency, duplicate event key, duplicate member/send date, and inconsistent
  event state/batch values must fail their database constraints. Test rollback
  on a late conversion failure and preservation of sender snapshots and indexes.

- [ ] Run `pnpm --filter @memory-shoebox/server test test/schema/dailyDigestsMigration.test.ts`.
      Expect missing columns/table or unchanged preferences, not fixture failures.
- [ ] **Green:** Add constrained text columns with the requested defaults and
      set all existing members explicitly. Retain old booleans as inert legacy columns.
      Freeze all transformation constants inside the migration.

  Events: `id`, `member_id`, `category`, `source_kind`, `source_id`, `occurred_at`,
  unique `deduplication_key`, `state`, nullable `batch_id`. Source IDs have no FK
  so deletion cannot erase history; member references use RESTRICT. Included
  events require a batch, pending/cancelled events do not. Index recipient/state/time
  and source/category. Batches: `id`, `member_id`, `send_date`, `timezone`,
  `cutoff_local_date`, `prepared_at`, nullable `outbound_email_id`,
  `eligibility_snapshot_json`, `delivery_snapshot_json`, `provider_attempted_at`.
  Unique `(member_id, send_date)`; outbox FK uses SET NULL to retain deduplication.
  Snapshot fields and provider-attempt time start null. Events reference batches.

  Extend both outbox kind and trigger constraints for `daily_digest` using the
  established table-rebuild pattern, preserving every index and dependent row.
  Convert only queued upload/comment rows with `attempts = 0` and no sender
  snapshot, provider IDs, or prior error evidence of an attempt. Ambiguous rows
  stay on the old retry path. Preserve the original idempotency key as event
  deduplication key and `created_at` as occurrence time; cancel the individual
  row only after its event insert. Rows without a member or valid source shape
  are cancelled without inventing a recipient or historical event.

- [ ] Rerun the focused test plus `test/schema/migratedSchema.test.ts` and
      `test/db/migrationSafety.test.ts`; expect all pass. Verify registry/checksum
      behavior without editing any released migration.
- [ ] Commit the task as `feat: add daily digest storage and preference defaults`.

### Task 2: Define frequency and digest payload contracts, and render the email

**Files:** Create `packages/shared/src/notificationFrequency.ts`,
`packages/shared/src/email/dailyDigestEmailPayload.ts`,
`packages/shared/test/dailyDigestEmail.test.ts`,
`packages/emails/src/templates/DailyDigestEmail.tsx`,
`packages/emails/test/DailyDigestEmail.test.tsx`.
Modify both package `src/index.ts` files, `packages/shared/src/email/email.ts`,
`apps/server/src/mail/templates/emailTemplates.constants.ts`, and `docs/emails.md`.

**Interfaces:** Export `notificationFrequencySchema`, `NotificationFrequency`,
`activityNotificationCategorySchema`, `ActivityNotificationCategory`, and
`DEFAULT_ACTIVITY_FREQUENCIES = { onUpload: "daily", onComment: "daily",
onCommentTag: "immediate" }`. Export `dailyDigestEmailPayloadSchema`, inferred
`DailyDigestEmailPayload`, and `dailyDigestEmail: EmailTemplate<DailyDigestEmailPayload>`.
Add `daily_digest` to kind/trigger schemas, `EmailPayloadExtras`, and renderer registry.

- [ ] **Red:** Validate all three frequencies; reject `weekly` and booleans.
      Define payload fields extending `EmailCommon`: `periodStart`, `periodEnd`,
      `shoeboxUrl`, and three sections `uploads`, `comments`, `commentTags`. Each
      section has `totalEvents` and at most 20 `entries`; uploads also have
      `totalVisibleItems`. Upload entries have `sourceId`, `uploaderDisplayName`,
      `visibleItemCount`, and `url`. Comment/tag entries have `sourceId`, `itemId`,
      `authorDisplayName`, `excerpt`, and `url`. Counts must be nonnegative integers,
      entries cannot exceed totals, excerpts cannot exceed 200 Unicode code points,
      and the combined payload must contain activity.

  ```ts
  expect(notificationFrequencySchema.safeParse("weekly").success).toBe(false);
  expect(parsed.commentTags.entries).toHaveLength(20);
  expect(overLimit.success).toBe(false);
  expect(emptyDigest.success).toBe(false);
  expect(text).toContain("Comments and replies");
  expect(text).not.toContain("Comment tags"); // empty tag section
  expect(html).not.toContain("<script>"); // hostile author/body text escaped
  ```

  Cover all seven nonempty section combinations, exact totals, date ranges,
  emoji-safe bounds, preferences links, and equivalent HTML/plain text.

- [ ] Run `pnpm --filter @memory-shoebox/shared test test/dailyDigestEmail.test.ts`
      and `pnpm --filter @memory-shoebox/emails test test/DailyDigestEmail.test.tsx`;
      expect missing exports/template failures.
- [ ] **Green:** Implement schemas and a template using `EmailShell` and current
      typography/helpers. Subject: `Your daily digest from ${shoeboxName}`. Omit empty
      sections; show accurate totals and an Open Shoebox link for overflow. Preserve
      preferences footer, no media attachments, and no external/signed media URLs.
      Register the digest kind only after renderer and payload exports exist.
- [ ] Rerun tests and `pnpm --filter @memory-shoebox/emails build`; expect pass.
- [ ] Commit as `feat: define and render combined daily digest emails`.

### Task 3: Save frequency preferences and cancel pending opt-outs atomically

**Files:** Create `apps/server/src/members/saveNotifyPreferences.ts`,
`apps/server/src/mail/digests/cancelPendingDigestEvents.ts`, and
`apps/server/test/members/saveNotifyPreferences.test.ts`.
Modify `packages/shared/src/auth.ts`, `packages/shared/test/auth.test.ts`,
`apps/server/src/routes/me.ts`, `apps/server/src/members/getMeDtoFromMemberId.ts`,
`apps/server/src/setup/initializeShoebox.ts`,
`apps/server/src/administration/inviteMember.ts`,
`apps/server/scripts/seedMember.ts`, `apps/server/test/routes/me.test.ts`,
`apps/server/test/members/getMeDtoFromMemberId.test.ts`, and
`docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/auth.md`.

**Interfaces:** `NotifyPreferences` has three frequency fields plus boolean
`onRemoval`, no `onReply`. Use a strict object for preference writes.
`saveNotifyPreferences({ transaction: DatabaseExecutor, memberId: string,
notify: NotifyPreferences }): Promise<void>` assumes the caller owns the transaction.
`cancelPendingDigestEvents({ executor: DatabaseExecutor, memberId?: string,
categories?: readonly ActivityNotificationCategory[], source?:
{ kind: "comment" | "upload_session"; ids: readonly string[] } }): Promise<number>`
requires at least one filter in its options union; no unfiltered cancellation.

- [ ] **Red:** Assert GET/PATCH returns the new values and persists each mode.
      Reject a boolean or obsolete `onReply` with 400 and unchanged preferences.
      Check setup/invitation/seed defaults, removal preservation, and name-only updates.

  ```ts
  expect(response.statusCode).toBe(400); // obsolete notify payload
  expect(afterPreferences).toEqual(beforePreferences);
  expect(pendingAfterDailyToOff).toEqual([]);
  expect(pendingAfterDailyToImmediate).toEqual([]);
  expect(alreadyIncludedEvents).toEqual(beforeIncludedEvents);
  expect(afterFailedSave).toEqual(beforeSave); // preference + event rollback
  ```

  Inject a failure after the preference update but during event cancellation;
  assert both mutations roll back. An Off-to-Daily save never revives cancelled
  events; ordinary queued immediate messages remain unchanged.

- [ ] Run shared `test/auth.test.ts` and server `test/routes/me.test.ts`,
      `test/members/saveNotifyPreferences.test.ts`, `test/members/getMeDtoFromMemberId.test.ts`;
      expect new-contract/cancellation assertions to fail.
- [ ] **Green:** Read/write only the frequency columns. Save preferences and
      cancel pending events for every category whose new mode is not `daily`, inside
      the account route's existing immediate transaction. Preserve unrelated updates.
      Remove explicit legacy preference initialization from member constructors;
      rely on new database defaults. Expose validation/reload guidance through the
      existing API error shape without pretending old shipped JavaScript can change
      its own error rendering.
- [ ] Rerun focused tests and existing setup/invitation/seed tests with explicit
      fixtures where older cases need immediate email behavior. Expect pass.
- [ ] Commit as `feat: persist three-mode activity email preferences`.

### Task 4: Route upload, comment, and tag events by frequency

**Files:** Create `apps/server/src/mail/digests/digest.types.ts`,
`apps/server/src/mail/digests/recordDigestEvent.ts`,
`apps/server/src/mail/scheduleActivityNotification.ts`, and
`apps/server/test/mail/digests/scheduleActivityNotification.test.ts`.
Modify `apps/server/src/items/enqueueCommentEmails.ts`,
`apps/server/src/items/reconcileCommentTagEmails.ts`,
`apps/server/src/routes/comments.ts`,
`apps/server/src/upload/enqueueUploadSessionEmails/readRecipients.ts`,
`apps/server/src/upload/enqueueUploadSessionEmails/uploadEmailMessageHelpers.ts`,
`apps/server/src/mail/checkCommentTagDelivery.ts`, and related existing
`test/items/commentTagEmails.test.ts`, `test/items/enqueueCommentEmails.test.ts`,
`test/upload/enqueueUploadSessionEmails/` and comment deletion tests.

**Interfaces:** `recordDigestEvent({ executor: DatabaseExecutor, memberId: string,
source: DigestSource, occurredAt: string, deduplicationKey: string }):
Promise<{ eventId: string; state: "recorded" | "already_recorded" }>`.
`scheduleActivityNotification<K extends ActivityEmailKind>({ executor:
DatabaseExecutor, now: string, input: ActivityNotificationInput<K> }):
Promise<{ state: "off" | "immediate" | "daily"; notificationId: string | null }>`.
`ActivityNotificationInput<K>` holds `kind: K`, `memberId`, `toAddress`, optional
`toDisplayName`, `sourceId`, `idempotencyKey`, and `payload: EmailPayloadExtras[K]`.
The scheduler reads the authoritative frequency, maps kind to category/source,
and invokes `enqueueEmail` or `recordDigestEvent` in the caller's transaction.

- [ ] **Red:** Cover all nine category/mode pairs. Assert an upload batch creates
      one event per recipient, a comment reaches both established recipient groups,
      and all existing visibility/self exclusions hold.

  ```ts
  expect(immediateRows).toHaveLength(0); // daily upload
  expect(digestEvents).toHaveLength(1); // one batch, many items
  expect(keysAfterRetry).toEqual(keysBeforeRetry);
  expect(tagAndGenericForSameRecipient).toHaveLength(1);
  expect(eventsAfterRemoveAndReadd).toHaveLength(1);
  expect(pendingAfterParentDeletion).toEqual([]);
  ```

  Test tag Daily/comment Immediate and tag Immediate/comment Daily; the tag wins
  on creation. Tag Off permits generic mail if otherwise eligible. Later first
  tags can follow already sent generic mail; tag removal cancels only its event.
  A failure on a later recipient rolls back the feature and all earlier events.

- [ ] Run `pnpm --filter @memory-shoebox/server test test/mail/digests/scheduleActivityNotification.test.ts test/items/commentTagEmails.test.ts test/items/enqueueCommentEmails.test.ts test/upload/enqueueUploadSessionEmails`;
      expect wrong destination/count assertions before wiring the scheduler.
- [ ] **Green:** Replace the three feature enqueue calls with the scheduler;
      recipient queries accept both `daily` and `immediate`, excluding `off`.
      Keep the existing tag ledger and create-time priority. Use the same historical
      idempotency keys as Task 1 migration. Before deleting parent/reply comments,
      collect cascading IDs and cancel pending events by source. Adapt immediate
      tag delivery checks to accept modes other than Off, so changing to Daily does
      not cancel already queued immediate mail. Preserve upload notification counts
      as scheduled-recipient counts, including daily recipients, without claiming delivery.
- [ ] Rerun focused routing and deletion tests; expect pass. Update only fixtures
      that intentionally expect immediate notifications; do not restore old defaults.
- [ ] Commit as `feat: route activity into immediate mail or daily events`.

### Task 5: Calculate calendar windows and build private bounded summaries

**Files:** Create `apps/server/src/mail/digests/getDigestWindowFromInstant.ts`,
`readEligibleDigestEvents.ts`, and `makeDigestPayloadFromEvents.ts` in the same
directory; create `apps/server/test/mail/digests/digestWindow.test.ts` and
`digestSummaries.test.ts`. Extend `digest.types.ts`.

**Interfaces:** `getDigestWindowFromInstant({ now: string, timezone: string }):
DigestWindow | null`. `readEligibleDigestEvents({ executor: DatabaseExecutor,
memberId: string, eventIds: readonly string[], mode: "preparation" | "delivery" }):
Promise<{ eligible: readonly EligibleDigestEvent[]; cancelledIds: readonly string[] }>`.
`EligibleDigestEvent` is a discriminated union carrying event/source IDs,
occurrence time, current author label, application-relative destination, and
either visible upload item IDs/counts or comment item ID/body. It contains no B2 URL.
`makeDigestPayloadFromEvents({ events: readonly EligibleDigestEvent[], window:
DigestWindow, baseUrl: string }): Omit<DailyDigestEmailPayload, keyof EmailCommon>`.
Payload construction only receives a validated absolute base URL; Task 6 handles
missing configuration without blocking feature transactions.

- [ ] **Red:** Pin New York winter/summer 08:59/09:00, both 2026 DST transitions,
      UTC, `Asia/Kathmandu`, and the 2026-09-06 midnight transition in
      `America/Santiago`. Assert local-date cutoff rather than elapsed-day arithmetic.

  ```ts
  expect(beforeNine).toBeNull();
  expect(atNine?.sendDate).toBe("2026-11-03");
  expect(yesterdayEligible).toBe(true);
  expect(todayAtMidnightEligible).toBe(false);
  expect(payload.uploads.totalVisibleItems).toBe(2); // hidden/deleted excluded
  expect(payload.comments.entries).toHaveLength(20); // 21 eligible sources
  expect(payload.comments.totalEvents).toBe(21);
  expect(
    Array.from(payload.comments.entries[0]!.excerpt).length,
  ).toBeLessThanOrEqual(200);
  ```

  Test removed members, suppressed-at-delivery addresses, deleted upload sessions,
  partially deleted batches, changed item visibility, missing tags, deleted reply
  parents, malicious text, equal-time ordering, and missing author labels. Reuse
  existing display-name fallback. No newly visible items outside the original
  upload session may enter the summary. Test that 21st/overflow sources affect
  totals and the eligibility manifest but do not create a next-day backlog.

- [ ] Run `pnpm --filter @memory-shoebox/server test test/mail/digests/digestWindow.test.ts test/mail/digests/digestSummaries.test.ts`;
      expect missing helper/summary failures.
- [ ] **Green:** Reuse `getLocalDayFromInstant` and `getLocalWallClockFromInstant`
      with no fixed 24-hour subtraction. Preparation requires current Daily preference;
      delivery permits Immediate but never Off. Reuse the actual item visibility
      predicate and tag eligibility checks. Resolve upload items through surviving
      session/file associations and recheck each item's access. Sort by occurrence
      time and event ID; bound displayed entries before composing the payload, retaining
      all eligible event/item IDs for the delivery manifest. Group comments visually
      by item while counting individual sources. Use `/items/<id>?comment=<id>` links;
      uploads use the current timeline destination convention. Validate totals/links
      through Task 2's schema after common fields are added.
- [ ] Rerun focused tests and existing timezone tests; expect pass.
- [ ] Commit as `feat: build calendar-aware private digest summaries`.

### Task 6: Atomically prepare and schedule daily digests

**Files:** Create `apps/server/src/mail/digests/prepareDailyDigest.ts`,
`runDailyDigests.ts`, and `apps/server/src/jobs/createDailyDigestsJob.ts`.
Modify `apps/server/src/jobs/createJobRegistry.ts`. Create
`apps/server/test/mail/digests/prepareDailyDigest.test.ts`,
`runDailyDigests.test.ts`, and `docs/mail.md` updates.

**Interfaces:** `prepareDailyDigest({ database: Kysely<Database>, memberId: string,
now: string }): Promise<"prepared" | "empty" | "already_prepared" | "not_due">`.
`runDailyDigests({ database: Kysely<Database>, now: string }):
Promise<{ preparedCount: number; emptyCount: number }>`.
`createDailyDigestsJob({ database: Kysely<Database>, clock?: () => Date }): Job`
returns name `daily-digests`, interval `60_000`. Re-read timezone inside the
preparation transaction rather than trusting a scheduler snapshot.

- [ ] **Red:** Build one member with all categories and two missed days. Assert
      one combined batch, correct actual period range, today's events still pending,
      and idempotence after a repeated tick/restart. Run concurrent calls on file-backed
      database connections and inject an outbox failure after reserving a batch.

  ```ts
  expect(digestRows).toHaveLength(1);
  expect(includedEventIds.sort()).toEqual(overdueEligibleIds.sort());
  expect(batchRowsAfterInjectedFailure).toEqual([]);
  expect(eventsAfterInjectedFailure).toEqual(beforeEvents);
  expect(emptyRecipientEmails).toEqual([]);
  expect(job.intervalMs).toBe(60_000);
  ```

  Test a new eligible event arriving after a batch is prepared, a timezone edit,
  a repeated local date, and failure/missing configuration followed by another tick.
  No empty batch may block later content that day. Overflow events count as included.

- [ ] Run `pnpm --filter @memory-shoebox/server test test/mail/digests/prepareDailyDigest.test.ts test/mail/digests/runDailyDigests.test.ts`;
      expect no scheduling/preparation implementation.
- [ ] **Green:** Use `runInImmediateTransaction` per member; validate due state,
      reserve `(member_id, send_date)`, select overdue events, cancel invalid events,
      enqueue `daily_digest` with trigger ID equal to batch ID and key
      `daily-digest:<memberId>:<sendDate>`, mark eligible events included, and link the
      outbox row. Roll back empty reservations while retaining invalid-event cancellations.
      Use indexed recipient pages of 50 and event read pages of 500, accumulating only
      bounded display content plus the necessary source manifest. Do not hold one
      global transaction across all members or perform provider I/O inside a transaction.

  Missing/invalid base URL: retain source references and prepare a failed outbox
  row through the existing enqueue failure mechanism using a schema-valid internal
  placeholder origin that can never reach the provider. Task 7 rebuilds absolute
  links before recovery; the stored failure is `base_url_unset`. No second batch
  or event is created. Missing sender is handled by ordinary worker deferral.

- [ ] Rerun focused tests and existing job-registry tests; expect pass.
- [ ] Commit as `feat: schedule one combined daily digest per member`.

### Task 7: Revalidate delivery, freeze retries, and recover configuration failures

**Files:** Create `apps/server/src/mail/digests/prepareDigestDelivery.ts`,
`apps/server/test/mail/digests/digestDelivery.test.ts`,
`apps/server/test/mail/digests/digestRecovery.test.ts`.
Modify `apps/server/src/mail/deliverQueuedEmail.ts`,
`apps/server/src/mail/requeueBaseUrlFailures.ts`,
`apps/server/src/mail/mailQueue.types.ts` only if a digest outcome needs the existing
union, and `docs/mail.md`.

**Interfaces:** `prepareDigestDelivery({ context: WorkerContext,
row: OutboundEmailRow, senderIdentity: { from: string; address: string } }):
Promise<DigestDeliveryPreparation>`, where `DigestDeliveryPreparation` is
`{ state: "ready"; request: EmailSendRequest } | { state: "cancelled" } |
{ state: "deferred" }`. The helper durably cancels or defers a claimed row before
returning that state; the worker maps these to existing `skipped`/`deferred`
outcomes. The worker still owns provider calls, retry accounting, and successful
finalization. Reuse the existing sender-freezing helper; keep the behavior of
other email kinds unchanged.

- [ ] **Red:** Exercise the full worker with a recording sender. Between batch
      preparation and first handoff, remove one source: assert it is pruned and totals
      change. Remove all or opt out: assert zero provider calls and cancelled state.
      Fail the first actual provider call, then change author text, base URL, Shoebox
      name, and sender settings: retry must receive the identical request.

  ```ts
  expect(secondRequest).toEqual(firstRequest);
  expect(sentRequestsAfterVisibilityRevocation).toHaveLength(1);
  expect(cancelledRow.state).toBe("cancelled");
  expect(queueAfterRestartSendingRow).toEqual(beforeRestartSendingRow);
  expect(digestRowsAfterBaseUrlRecovery).toHaveLength(1);
  expect(eventKeysAfterRecovery).toEqual(eventKeysBeforeRecovery);
  ```

  Include a rendered-then-revoked race, a renderer failure before provider intent,
  source visibility changes in overflow counts, missing sender, suppression,
  missing base URL recovery, and Daily-to-Immediate versus Off after preparation.
  Legacy already-attempted queued mail keeps its old identity; never-attempted
  base-URL failures route using current frequency without repeated events.

- [ ] Run `pnpm --filter @memory-shoebox/server test test/mail/digests/digestDelivery.test.ts test/mail/digests/digestRecovery.test.ts`;
      expect incorrect privacy/retry/recovery assertions before implementation.
- [ ] **Green:** For unattempted digests, read current eligible batch sources,
      regenerate payload and render outside the write transaction, then recheck the
      source/item manifest and active membership inside a short immediate transaction.
      If it changed during rendering, discard that rendering and defer for the next
      worker pass by returning the row to queued with `next_attempt_at = now + 10s`,
      without increasing attempts or setting provider intent. Otherwise persist the payload,
      subject, exact `EmailSendRequest`, manifest, and `provider_attempted_at` before
      the provider await. The marker represents intent immediately before handoff,
      including ambiguous crashes; render/configuration failures do not set it.

  On retries, load the frozen request rather than render again. Check every
  contributing item/source, current tag membership, category not Off, and active
  recipient. Cancel unsafe retries instead of rewriting a provider key. Pending
  Daily-to-Immediate cancellation does not revoke already included content.
  Keep the current `sending` crash policy. The freeze and eligibility check are
  the last database step before the sender; provider-accepted messages cannot be recalled.

  Extend base-URL recovery to rebuild unattempted digests from their batch and
  current sources using the now-valid URL, updating their original outbox record.
  For unattempted individual upload/comment/tag failures, route through Task 4
  with original deduplication keys and occurrence times; if routed to Daily or
  Off, retire the old individual row. Do not re-enter the permanent tag ledger.
  Already-attempted rows never get a replacement request or digest event.

- [ ] Rerun focused tests plus existing mail worker, tag-delivery, suppression,
      sender-retry, and base-URL-recovery suites; expect pass.
- [ ] Commit as `feat: protect digest privacy and preserve retry identity`.

### Task 8: Replace account switches with three frequency selectors

**Files:** Modify `apps/web/src/surfaces/Account/EmailSheet/EmailSheet.tsx`,
`notifyKinds.ts`, `NotifyRow.tsx`, `NotifySwitches.tsx`, `NotifyBulkButtons.tsx`,
and `AccountSurface/AccountSurface.tsx` under the same Account directory.
Modify `apps/web/src/testing/createMeResponse.ts`, account mutation/error helpers,
existing `EmailSheet/EmailSheet.test.tsx`, AccountSurface tests, and `docs/web.md`.
Update affected API/bootstrap fixtures to use the new contract.

**Interfaces:** Pass `timezone: string` into EmailSheet from existing shell
settings. Frequency rows use `NotificationFrequency`; the removal row remains
boolean. Retain `onSave(notify: NotifyPreferences): void`, `isSaving`, `error`,
and `focusCommentTag`. Rename switch-specific internal units only where the
new mixed controls would make their names misleading.

- [ ] **Red:** Render the sheet with the defaults and verify the three labeled
      controls, all three choices, selected defaults, timezone, and unchanged removal
      switch. Test persistence/reload, keyboard selection, rapid queued edits, rollback,
      bulk Off/back-on values, stale-client reload guidance, and focused tag setting.

  ```ts
  expect(uploadSelect).toHaveValue("daily");
  expect(commentSelect).toHaveValue("daily");
  expect(tagSelect).toHaveValue("immediate");
  expect(onSave).toHaveBeenLastCalledWith({
    onUpload: "off",
    onComment: "off",
    onCommentTag: "off",
    onRemoval: false,
  });
  expect(screen.queryByRole("option", { name: /weekly/i })).toBeNull();
  expect(tagSelect).toHaveFocus();
  ```

- [ ] Run `pnpm --filter @memory-shoebox/web test src/surfaces/Account`;
      expect missing selectors/new-contract assertions, not unrelated render failures.
- [ ] **Green:** Prefer Mantine NativeSelect for these three fixed options and
      preserve the current layout/spacing/error conventions. Labels: New photos/videos,
      Comments and replies, Comment tags. Choices: Off, Immediate, Daily digest.
      Show `Daily digests arrive around 9 a.m. (<timezone>). Empty days send no email.`
      Explain that changing frequency applies to new activity and discards pending
      digest activity when leaving Daily. Keep immediate-saving semantics and the
      current serialized account writes. Map validation failures in the current client
      to `Email settings have changed. Reload this page and try again.` without
      promising already shipped clients will render the new text.
- [ ] Rerun Account, auth API, and bootstrap/account write tests; expect pass.
      Run `pnpm type-check` now and update remaining frequency fixtures only where
      the contract change requires them. Do not loosen types to keep old booleans.
- [ ] Commit as `feat: offer daily digest preferences in account settings`.

### Task 9: Integrate acceptance, documentation, and whole-branch verification

**Files:** Create `e2e/comment-tagging/emailFrequency.spec.ts` using the existing
local harness; update `e2e/comment-tagging/commentTagging.spec.ts` account assertions.
Update `docs/PRODUCT.md`, `docs/architecture.md`, `docs/shared.md`,
`docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md`,
`docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`, and the docs updated
in earlier tasks. Create `docs/superpowers/verification/2026-11-03-daily-digests.md`.

**Interfaces:** Browser tests use existing `playwright.comment-tagging.config.ts`
and fake-mail server fixtures; do not add production routes or clock controls.
Cross-package delivery tests run through the real queue with injected clock/sender.

- [ ] **Red:** Add browser assertions for actual account saves across reload and
      a second tab, desktop/mobile keyboard/focus, and a failed save. Run
      `pnpm exec playwright test -c playwright.comment-tagging.config.ts e2e/comment-tagging/emailFrequency.spec.ts`
      against the pre-change UI if capturing this regression before Task 8; otherwise
      record it as acceptance coverage, not a fabricated red/green result.
- [ ] Verify the default complete flow in a server integration test: a new upload
      and ordinary comment stay out of immediate mail, a tag sends immediately, and
      next morning creates one combined digest for the other activity. Assert no
      mail next morning without new events, and removal/sign-in behavior unchanged.
- [ ] Update docs to describe implemented storage, three modes, combined comments,
      defaults/reset, 09:00 timezone, outage catch-up, bounded summaries, preference
      changes, retry cancellation, and coordinated client upgrade. Document that live
      defaults change only when this migration is deployed. Include backup/restore
      references to the established migration guide, not new production commands.
- [ ] Run `pnpm check`. Expected: skills, formatting, lint, types, builds, and
      all tests pass. Fix only failures caused by this feature; use
      systematic-debugging for unexpected failures and rerun affected checks.
- [ ] Run `pnpm test:e2e:comment-tagging` with the local harness and fake delivery.
      Inspect desktop/mobile Email settings and the digest HTML/plain-text artifact.
      Record commands, results, and any real limitations in the verification file.
- [ ] Use requesting-code-review and verification-before-completion as required
      by the chosen execution workflow. Address findings, rerun affected checks, and
      review the final diff against every spec section. Do not declare deployed success.
- [ ] Sync the plan, any updated spec, and verification artifacts into the
      Downloads feature directory; render Markdown copies with `markdown-to-pdf`
      and visually check the PDFs. Commit as `test: verify daily digests and document behavior`.

## Coverage and handoff

| Spec sections                                    | Owning tasks                       |
| ------------------------------------------------ | ---------------------------------- |
| 1-2: scope, defaults, chosen architecture        | 1, 4, 6, 9                         |
| 3: account contract and controls                 | 2, 3, 8                            |
| 4: storage, populated migration, unsent mail     | 1, 7                               |
| 5: routing, tag priority, cancellation           | 3, 4, 7                            |
| 6: calendar, catch-up, bounded combined email    | 2, 5, 6                            |
| 7: privacy, frozen retry, configuration recovery | 5, 7                               |
| 8-9: documentation and acceptance                | Every task; final integration in 9 |

Plan self-review: interfaces, filenames, default values, category names, calendar
rules, and retry ownership checked against the approved spec. Implementation
checkboxes remain unchecked; the commands and assertions here are planned work,
not verification results.

Recommended execution: Native, with the required final independent review. These
nine tasks depend closely on shared preference, event, and payload contracts;
keeping implementation in one session reduces repeated context and interface
handoffs. Subagent-driven execution remains available if per-task independent
reviews are preferred. Await plan review and execution-method selection before
starting product code.
