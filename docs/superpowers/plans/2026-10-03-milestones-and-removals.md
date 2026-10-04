# Milestones and Removals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete step 7a's nine milestone routes, five removal routes, five removal emails, and weekly reminder enqueue.

**Architecture:** Extend the existing Fastify, Kysely, archive, item, and mail services. Keep visibility checks and mail enqueues within the mutation transaction; share removal authorization and capture-date arithmetic with existing item routes. Assign timeline bands globally from all milestone spans.

**Tech Stack:** TypeScript, Zod 4, Fastify 5, Kysely, SQLite, react-email, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-03-milestones-and-removals-design.md` (approved 2026-10-03).

## Global Constraints

- Implement step 7a only. Product specs and prototypes are read-only references. No web surfaces, member-management routes, migration, deployment, push, merge, or PR.
- Follow repository and parent AGENTS.md; use the existing `feat/milestones-removals` worktree. Never edit generated skill directories.
- Relative runtime imports in server/shared use `.ts`; email imports use their actual `.ts` or `.tsx` extensions. Shared runtime code must be erasable TypeScript.
- No `any`, no new `resolve...` names, no rhetorical em dashes. Public functions/types/constants have docstrings; follow the source/target naming convention.
- Milestone name limit 200; blurb 280; removal reason and decline reason 4000 after trimming. Both attachment directions and reconciliation batches cap at 500 each.
- Items outside visibility return byte-identical `item_not_found` to nonexistent IDs. People tags never grant visibility. Milestones have no visibility; all item counts are per viewer.
- PATCH items is a delta. Milestone deletion never deletes photographs or queues object deletions.
- Requester alone may withdraw. Decline settles one request; item deletion settles every open request before item deletion performs SET NULL.
- Every email is one row per recipient and enqueued in the state-change transaction. Preference bypass for requester answers does not bypass provider address suppression.
- Weekly reminders use the existing local-calendar week helper, require weekIndex >= 1, and blindly enqueue with conflict-do-nothing; no last-reminded state.
- Use red/green TDD for behavior, then run targeted verification and commit each task. Do not commit unrelated formatting changes produced by the full check.

## Review Focus

- A page cut through a burst must not report a sampled frame count or sign an invisible cover; Task 4 covers full visible-frame metadata.
- A failure after a request or item state change must roll back its mail rows too; Tasks 7 and 8 inject a database failure late in the transaction.
- A tagged uploader/admin who asks against their own upload must get capability and recipient behavior consistent with the approved design; Tasks 2, 7, and 8 cover overlapping identities.
- A filter, jump, or legacy cursor omitting a milestone's opening day must not reintroduce its band; Task 2 covers all three entry paths.
- A long, multiline decline containing markup must remain the author's words in HTML and text; Task 6 covers escaping, line breaks, quote order, and the 4000-character boundary.

## File map and shared interfaces

New code is grouped by responsibility, not bundled into one route file:

| Area            | Files and responsibility                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared          | `packages/shared/src/milestones.ts`, `removals.ts`: HTTP contracts; `email.ts`: removal payloads; `index.ts`: exports.                                |
| Bands           | `apps/server/src/milestones/getDayBandAssignmentsFromMilestoneSpans.ts`: pure assignment; existing archive readers/cursor helpers consume it.         |
| Gate            | `apps/server/src/removals/readRemovalGate.ts`: people-tag and open-request facts, reused by item-detail and removal routes.                           |
| Milestones      | `apps/server/src/milestones/`: counts/detail, cursor codecs, visibility validation, mutations, picker reads, reconciliation.                          |
| Item summaries  | `apps/server/src/archive/readItemSummariesByItemIds.ts`: complete batched summaries for explicit visible item IDs.                                    |
| Capture changes | `apps/server/src/items/setItemCaptureDates.ts`: common batch service; existing singular service delegates to it.                                      |
| Removal reads   | `apps/server/src/removals/`: scoped rows, DTO composition, queue and item-scoped collections.                                                         |
| Removal mail    | `apps/server/src/removals/enqueueRemovalEmails.ts`: recipient selection and payload construction for every removal outcome.                           |
| Routes          | `apps/server/src/routes/milestones/` and `routes/removals/`: focused handlers and registrars; `createApp.ts`: registration.                           |
| Email copy      | `packages/emails/src/templates/RemovalRequestEmail.tsx`, `RemovalReminderEmail.tsx`, `RemovalResolvedEmail/`: five bodies and three template objects. |
| Jobs/deletion   | Existing `jobs/runRemovalReminder.ts`, `items/closeOpenRemovalRequests.ts`: transactional mail integration.                                           |

All services below use existing `DatabaseExecutor`, `Viewer`, `B2Client`,
`VisibleItem`, and shared DTO types. Their reusable option aliases contain the
exact fields shown here. `now: Date` is for media signing; mutation/mail time is
`now: string`, an ISO instant from the request clock.

Use existing `createTestApp`, `insertSignedInMember`, seed helpers,
`makeQueryCountingDatabaseFromDatabase`, and fake B2. New test helpers belong
inside their feature's test directory. Tests must close apps/databases. Source
files may be split into focused sibling helpers within the mapped directories;
keep the public interfaces below stable.

---

### Task 1: Shared milestone, removal, and mail contracts

**Files:** Create `packages/shared/src/milestones.ts`, `removals.ts`, tests `packages/shared/test/milestones.test.ts`, `removals.test.ts`; modify `email.ts`, `index.ts`, `test/email.test.ts`, and `docs/shared.md`.

**Interfaces:** Produces all schema/type pairs named in the two API slices: milestone summary/detail/candidate/mismatch; list/create/get/update/delete/set-items/candidates/mismatches/reconcile requests and responses; removal DTO and create/list/list-item/decline/withdraw requests, path params, and responses. Export `MILESTONE_ERROR_CODES`/`MilestonesErrorCode` and `REMOVAL_ERROR_CODES`/`RemovalsErrorCode`, following items.ts. Reuse existing item/member/media/milestone-ref and band schemas rather than duplicating them. Produce removal request/reminder payloads and three resolved variants, with `removalResolvedEmailPayloadSchema` discriminated on outcome. Payload fields are exactly notifications §§ 5-9.

- [ ] **Step 1: Write contract failure tests.** Cover required endsOn, merged-span validation left to the service for partial PATCH, real dates, whitespace normalization, duplicates, overlapping delta IDs, empty deltas, empty/oversized reconciliation lists, dotted target errors, pagination defaults/caps, nullable removal media, and resolved outcome parsing. Representative assertions:

```ts
expect(
  createMilestoneRequestSchema.parse({ ...validCreate, name: "a".repeat(200) })
    .name,
).toHaveLength(200);
expect(
  createMilestoneRequestSchema.safeParse({
    ...validCreate,
    name: "a".repeat(201),
  }).success,
).toBe(false);
expect(
  setMilestoneItemsRequestSchema.safeParse({
    attach: [itemId],
    detach: [itemId],
  }).success,
).toBe(false);
expect(
  createRemovalRequestRequestSchema.parse({ reason: "   " }).reason,
).toBeNull();
expect(
  declineRemovalRequestRequestSchema.safeParse({ declineReason: "   " })
    .success,
).toBe(false);
expect(
  declineRemovalRequestRequestSchema.parse({ declineReason: "a".repeat(4000) })
    .declineReason,
).toHaveLength(4000);
expect(listRemovalRequestsRequestSchema.parse({})).toMatchObject({
  state: "open",
  limit: 25,
});
```

Also assert milestone list/mismatch defaults 50/200, candidates 60/200,
queue 25/100, and 500 accepted/501 rejected for every batch. Removal reason
4000 passes/4001 fails after trimming. Preserve frozen DTO requirements.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/shared test test/milestones.test.ts test/removals.test.ts test/email.test.ts`. **Expected:** new contract assertions fail because the contracts are absent.
- [ ] **Step 3: Implement** the schemas with Zod and shared LIMITS, matching the approved design and API documents. Date validation strengthens existing calendarDateSchema if it is shape-only, with a regression test in test/dtos.test.ts; do not create a second calendar grammar. Keep per-route validation distinct from persistence checks.
- [ ] **Step 4: Run** `pnpm --filter @memory-shoebox/shared test` and `pnpm --filter @memory-shoebox/shared type-check`. **Expected:** all pass. The server standing shared runtime import test remains valid.
- [ ] **Step 5: Document** new contracts and commit as `feat: add milestone and removal contracts`.

### Task 2: Shared removal gate and global milestone bands

**Files:** Create `apps/server/src/removals/readRemovalGate.ts`, `milestones/getDayBandAssignmentsFromMilestoneSpans.ts`, tests `test/removals/readRemovalGate.test.ts`, `test/milestones/bandAssignments.test.ts`; modify `items/readItemDetail/readItemDetailParts.ts`, `items/itemPermissions.ts`, archive `readTimelinePage.ts`, `timelineCursorHelpers.ts`, `milestoneSpanHelpers.ts`, shared timeline cursor comments, relevant archive/route tests, `upload/enqueueUploadSessionEmails/uploadEmailMessageHelpers.ts`, `docs/archive.md`, `docs/server.md`.

**Interfaces:**

- `readRemovalGate({ database: DatabaseExecutor, viewer: Viewer, itemId: string }): Promise<RemovalGate>`; export `RemovalGate = { isPeopleTagged: boolean; hasOpenRemovalRequest: boolean }`. Caller has already checked item visibility.
- `getDayBandAssignmentsFromMilestoneSpans(spans: readonly MilestoneSpanRow[]): Map<string, DayBandAssignment>`; export `MilestoneSpanRow = { milestoneId: string; startsOn: string; endsOn: string }`, `DayBandAssignment = { bandMilestoneId: string | null; continuesMilestoneIds: string[] }`.
- Timeline cursors retain lastDay and filterDigest in their internal state; new encoding `{ d, f }`. Decoder accepts both `{ d, f }` and previously valid `{ d, o, f }`; validates a supplied legacy o before ignoring it.

- [ ] **Step 1: Write failure tests.** Band fixtures cover both worked examples in milestones.md, equal-span ID ties independent of input order, continuation ordering, absent days, and filtered/paged/jumped requests producing the same assignment. Assert a legacy cursor's o cannot move a band. Tag tests cover linked people, unlinked people, wrong item/member, existing open versus settled requests, and tagged uploader/admin capabilities. Change the existing uploader-exclusion assertion to the approved behavior.

```ts
expect(assignments.get("2026-09-21")?.bandMilestoneId).toBe(firstWeekId);
expect(assignments.get("2026-09-17")?.bandMilestoneId).toBe(homeId);
expect(filteredDay.milestoneBand).toBeNull(); // Its band opened on an omitted later day.
expect(taggedUploaderCapabilities.canRequestRemoval).toBe(true);
expect(taggedUploaderWithOpenRequest.canRequestRemoval).toBe(false);
```

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test test/removals/readRemovalGate.test.ts test/milestones/bandAssignments.test.ts test/archive/timelineCursorHelpers.test.ts test/routes/timeline.test.ts`. **Expected:** new gate/band assertions fail.
- [ ] **Step 3: Implement** extraction and ranking. Query all milestone spans for assignment; use bounded day-stream reads for page membership as before. Keep the existing band-only item-count wire shape and one batched visible aggregate; continuation strips retain their current fields. Replace stateful page ranking with assignment lookup, retaining HTTP field names. Reuse the same assignment in upload mail's milestone-name lookup if that caller ranks bands independently. Only band winners enter the introduced set.
- [ ] **Step 4: Run** `pnpm --filter @memory-shoebox/server test test/removals test/milestones test/archive test/routes/timeline.test.ts test/routes/timelineRail.test.ts test/items test/upload/enqueueUploadSessionEmails` and server type-check. **Expected:** all pass. Adjust query-count expectations only for documented new batched work.
- [ ] **Step 5: Update** cursor/band and gate docs; commit as `feat: share removal gate and assign milestone bands globally`.

### Task 3: Milestone CRUD and attachment deltas

**Files:** Create `apps/server/src/milestones/readMilestoneDetail.ts`, `milestoneCursorHelpers.ts`, `milestoneMutationHelpers.ts`, `assertVisibleMilestoneItems.ts`, routes `routes/milestones/milestoneRoutes.ts`, `readMilestoneRoutes.ts`, `mutateMilestoneRoutes.ts`, tests `test/milestones/crud.test.ts`, `attachments.test.ts`, `test/routes/milestones.test.ts`; modify `createApp.ts`, `docs/server.md`; create `docs/milestones.md`.

**Interfaces:**

- `readMilestoneDetail({ database: DatabaseExecutor, viewer: Viewer, milestoneId: string }): Promise<MilestoneDetail>` raises milestone_not_found and uses fixed batched counts plus creator metadata.
- `assertVisibleMilestoneItems({ database: DatabaseExecutor, viewer: Viewer, itemIds: readonly string[] }): Promise<void>` validates the entire set in one read, empty set allowed.
- `registerMilestoneRoutes(app: FastifyInstance): Promise<void>` registers list/create/get/update/delete/PATCH-items now; Task 4 adds picker/mismatches and Task 5 adds reconcile.
- `insertMilestone({ transaction, viewer, body: CreateMilestoneRequest, now: string }): Promise<MilestoneDetail>`; `updateMilestone({ transaction, viewer, milestoneId: string, body: UpdateMilestoneRequest, now: string }): Promise<MilestoneDetail>`; `deleteMilestone({ transaction, viewer, milestoneId: string, now: string }): Promise<DeleteMilestoneResponse>`; `setMilestoneItems({ transaction, viewer, milestoneId: string, body: SetMilestoneItemsRequest, now: string }): Promise<SetMilestoneItemsResponse>`. Transaction is DatabaseExecutor and viewer is Viewer.

- [ ] **Step 1: Write failure tests.** Cover all six routes, unauthenticated requests, role ladder, creator null or another uploader, equal-date cursor ties, overlap filters, duplicate names, create from nothing/selection with unchanged explicit dates, and visible counts hiding restricted attachments. PATCH validates a merged span and only resets acknowledgements on actual date changes. Attachment tests prove both directions idempotent, metadata untouched on duplicate attach, detach never rewrites items, and inaccessible detach rolls back an accessible attach.

```ts
expect(create.statusCode).toBe(201);
expect(create.json().mismatchCount).toBe(1);
expect(rejectedDelta.json()).toEqual(nonexistentDelta.json());
expect(await attachmentsForMilestone()).toContainEqual(hiddenAttachment);
expect(await itemRows()).toEqual(itemsBeforeMilestoneDelete);
expect(await pendingObjectDeletions()).toEqual([]);
expect(deleted.json().detachedItemCount).toBe(visibleCount);
expect(activity.detail).toMatchObject({
  startsOn,
  endsOn,
  attachmentCount: trueCount,
});
```

Use `attachmentCount` for the true count in the admin activity detail; the
response remains `detachedItemCount`, which is per viewer.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test test/milestones/crud.test.ts test/milestones/attachments.test.ts test/routes/milestones.test.ts`. **Expected:** route/service behavior fails before implementation.
- [ ] **Step 3: Implement** reads, mutations, cursor validation, route registration, and immediate transactions. Batched visible-item validation precedes writes; conflict-do-nothing handles existing attachments. Milestone deletion counts before cascade and writes one milestone_deleted activity with actor/subject snapshots. Return post-mutation details inside the transaction.
- [ ] **Step 4: Run** `pnpm --filter @memory-shoebox/server test test/milestones test/routes/milestones.test.ts` and server type-check. **Expected:** all pass. Add query-count test comparing one versus many attachments; queries do not scale per attachment.
- [ ] **Step 5: Write** milestone overview and route docs; commit as `feat: add milestone CRUD and attachment deltas`.

### Task 4: Batched item summaries, candidates, and mismatch pages

**Files:** Create `apps/server/src/archive/readItemSummariesByItemIds.ts`, `milestones/readMilestoneCandidates.ts`, `readMilestoneMismatches.ts`, `milestoneItemCursorHelpers.ts`, `routes/milestones/readMilestoneItemRoutes.ts`; modify `milestoneRoutes.ts`; create tests `test/archive/readItemSummariesByItemIds.test.ts`, `test/milestones/pickers.test.ts`, `test/routes/milestonePickers.test.ts`; update `docs/milestones.md`.

**Interfaces:**

- `readItemSummariesByItemIds({ database: DatabaseExecutor, b2: B2Client, viewer: Viewer, itemIds: readonly string[], now: Date }): Promise<Map<string, ItemSummary>>`. Returns only visible existing items with drawable media, keyed by their actual requested ID. Reuse archive helpers for media, visibility, people, members, unseen flags, and burst metadata. Query full visible siblings for involved bursts in one batch; never one query per item or burst.
- `readMilestoneCandidates({ database, b2, viewer, milestoneId, query: ListMilestoneCandidatesRequest, now: Date }): Promise<ListMilestoneCandidatesResponse>`.
- `readMilestoneMismatches({ database, b2, viewer, milestoneId, query: ListMilestoneMismatchesRequest, now: Date }): Promise<ListMilestoneMismatchesResponse>`.

- [ ] **Step 1: Write failure tests.** Candidate scope defaults to span, all supports bounds, malformed pair cursors fail, pages have no repeated IDs with tied dates, attached flags include existing joins, and outsiders are advisory under all. Mismatch widening sees all visible unacknowledged rows even when limit is one; acknowledged and hidden rows affect neither items nor widening. Burst metadata includes visible siblings beyond a page and excludes hidden covers/counts. A burst with one visible frame has null metadata. Assert ItemSummary carries seen/visibility/uploader/media fields without per-item queries.

```ts
expect(firstPage.candidates[0]?.isAttached).toBe(true);
expect(
  allPage.candidates.find((candidate) => candidate.item.itemId === outsideId)
    ?.isOutsideSpan,
).toBe(true);
expect(mismatchPage.wideningSpan).toEqual({
  startsOn: earliestVisibleDay,
  endsOn: latestVisibleDay,
});
expect(summary.burst?.visibleFrameCount).toBe(allVisibleFrames);
expect(summary.burst?.coverItemId).not.toBe(hiddenCoverId);
```

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test test/archive/readItemSummariesByItemIds.test.ts test/milestones/pickers.test.ts test/routes/milestonePickers.test.ts`. **Expected:** new reads/routes fail.
- [ ] **Step 3: Implement** pair cursor codecs, indexed page selection, batched summary resolution and attachment flags, all-set widening aggregate, and both route registrations. Preserve actual item identities for attachment deltas, with burst metadata for rendering. Skip/log missing drawable renditions consistently with the existing archive behavior; cursor advances on selected rows to avoid retrying a broken row forever.
- [ ] **Step 4: Run** `pnpm --filter @memory-shoebox/server test test/archive test/milestones test/routes/milestonePickers.test.ts` and server type-check. **Expected:** all pass; query-count comparison is constant as page size grows.
- [ ] **Step 5: Update** picker and widening docs; commit as `feat: add milestone candidates and mismatch pages`.

### Task 5: Shared batch capture changes and milestone reconciliation

**Files:** Create `apps/server/src/items/setItemCaptureDates.ts`, `milestones/reconcileMilestone.ts`, `routes/milestones/reconcileMilestoneRoute.ts`, tests `test/items/setItemCaptureDates.test.ts`, `test/milestones/reconcile.test.ts`, `test/routes/milestoneReconcile.test.ts`; modify singular `setItemCaptureDate.ts`, `milestoneRoutes.ts`, `docs/milestones.md`, `docs/server.md`.

**Interfaces:**

- `setItemCaptureDates({ transaction: DatabaseExecutor, viewer: Viewer, changes: readonly CaptureDateTarget[], timezone: string, now: string }): Promise<Map<string, CaptureDateChange>>`.
- `CaptureDateTarget = { item: VisibleItem; capturedOn: string; capturedTime: string | undefined; reason: 'manual' | 'milestone_reconcile'; milestoneId: string | null }`. Reuse existing CaptureDateChange type, exported beside the common batch service and re-exported from setItemCaptureDate.ts to preserve callers. The singular API retains its signature and delegates with manual/null.
- `reconcileMilestone({ transaction: DatabaseExecutor, viewer: Viewer, milestoneId: string, body: ReconcileMilestoneRequest, now: string }): Promise<ReconcileMilestoneResponse>`; handler owns immediate transaction.

- [ ] **Step 1: Write failure tests.** Fixed offsets preserve the clock across day changes; unknown offsets use timezone DST rules and stay null. Audit preserves previous instant/day/source, originalCapturedAt remains untouched, and reason/milestone columns distinguish manual/reconcile. Burst ejection empties only genuinely empty bursts; invisible siblings retain the burst and surviving indexes. Reconciliation validates all IDs before changes, rejects unattached items with 409, reports out-of-span per-item field errors, preserves first acknowledgement timestamps, and resets/reports mismatches elsewhere. An inside-span no-op creates no history.

```ts
expect(history.reason).toBe("milestone_reconcile");
expect(history.milestone_id).toBe(milestoneId);
expect(moved.capture_source).toBe("uploader_set");
expect(moved.original_captured_at).toBe(originalInstant);
expect(result.raisedElsewhere).toEqual([
  { milestone: otherRef, mismatchCount: visibleMismatches },
]);
expect(await remainingBurst()).toBeDefined(); // An invisible sibling survives.
expect(await historyRowsAfterRejectedBatch()).toEqual(historyBefore);
```

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test test/items/setItemCaptureDates.test.ts test/milestones/reconcile.test.ts test/routes/milestoneReconcile.test.ts`. **Expected:** new batch/reconciliation behavior fails.
- [ ] **Step 3: Implement** pure per-item clock planning followed by batched SQL writes/history, batch burst ejection/empty checks, and acknowledgement clearing. Parameterize SQL through Kysely values/CASE or a values CTE, never concatenate user values. Batch item/attachment visibility reads and fetch settings once. Use the same service from manual and reconcile paths; do not invoke per-item transactions or per-item settings/visibility/burst reads.
- [ ] **Step 4: Run** `pnpm --filter @memory-shoebox/server test test/items test/milestones test/routes/itemCaptureDate.test.ts test/routes/milestoneReconcile.test.ts` and server type-check. **Expected:** all pass, including existing manual correction and DST tests; batch query counts do not scale per item.
- [ ] **Step 5: Update** capture/reconciliation docs; commit as `feat: reconcile milestone items with shared capture changes`.

### Task 6: Five removal emails and typed registry

**Files:** Create three template entries listed in the file map, resolved outcome body components, `packages/emails/test/RemovalEmails.test.tsx`; modify email `index.ts`, `lib/EmailShell.tsx` comments, server `mail/templates/emailTemplates.constants.ts`, `mail/enqueueEmail.ts`, tests `apps/server/test/mail/removalEmailRegistry.test.ts`, `packages/emails/test/EmailShell.test.tsx`, `docs/emails.md`, `docs/mail.md`.

**Interfaces:** `removalRequestEmail: EmailTemplate<RemovalRequestEmailPayload>`, `removalReminderEmail: EmailTemplate<RemovalReminderEmailPayload>`, `removalResolvedEmail: EmailTemplate<RemovalResolvedEmailPayload>` with subjects and render(payload) returning both HTML/text. Extend EmailPayloadExtras/EMAIL_TEMPLATES/EMAIL_RENDERERS with removal_request, removal_reminder, removal_resolved.

- [ ] **Step 1: Write failure tests** for all five prototype states, uploader/admin/requester relation variants, absent reason, weekIndex 1 versus later weeks, dates in extreme timezones, verbatim multiline text, HTML escaping, deleted absence of item links, and truthful preference footers. Use full sentences from prototype references as expected copy, replacing gendered pronouns with names.

```ts
expect(requestSubject).toBe("Inés has asked for a photo to come down");
expect(reminderSubject).toBe("Inés is still waiting on that photo");
expect(deletedSubject).toBe("That photo has come down");
expect(declinedSubject).toBe("Papá has kept that photo up, and said why");
expect(withdrawnSubject).toBe("Never mind about that photo");
expect(declined.text.indexOf(ownWords)).toBeLessThan(
  declined.text.indexOf("The photo is still there."),
);
expect(requesterAnswer.text).not.toContain("Turn these emails off");
expect(uploaderAnswer.text).toContain("Turn these emails off");
expect(deleted.text).not.toContain("/item/");
```

Account for wrapping when comparing long plain-text passages; test paragraph
order and preserve every word rather than requiring an unwrapped substring.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/emails test test/RemovalEmails.test.tsx` and `pnpm --filter @memory-shoebox/server test test/mail/removalEmailRegistry.test.ts`. **Expected:** absent template/registry behavior fails.
- [ ] **Step 3: Implement** exact prototype-led copy and resolved dispatch, with decline quote as the first body content after its heading. Render via existing EmailShell/renderEmail. Suppressible resolved copies show the preference footer; requester deleted/declined copies omit it irrespective of the generic common payload preference value. Preserve the approved product copy; actual object cleanup remains queued as in existing deletion behavior. Format calendar dates as calendar dates, not shifted UTC noon instants.
- [ ] **Step 4: Run** `pnpm --filter @memory-shoebox/emails test`, `pnpm --filter @memory-shoebox/emails build`, `pnpm --filter @memory-shoebox/server test test/mail`, and both package type-checks. **Expected:** all pass; built runtime imports find all three templates.
- [ ] **Step 5: Render** all five representative HTML/text artifacts under this plan's ignored SDD workspace, inspect HTML in a browser at phone and desktop widths, and compare every body to its prototype. Record the artifact paths and visual findings in the task report. No production app or provider calls. Update copy/registry docs and commit as `feat: add five removal email bodies`.

### Task 7: Removal routes, DTOs, and transaction-bound notifications

**Files:** Create `apps/server/src/removals/readRemovalRequests.ts`, `getRemovalRequestOr404.ts`, `makeRemovalRequestDtosFromRows.ts`, `removalMutationHelpers.ts`, `enqueueRemovalEmails.ts`, route directory files; modify `createApp.ts`; create tests `test/removals/access.test.ts`, `mutations.test.ts`, `mail.test.ts`, `test/routes/removals.test.ts`, overview `docs/removals.md`; update `docs/server.md` and `docs/mail.md`.

**Interfaces:**

- `RemovalRequestRow = Selectable<Database['removal_requests']>` exported beside DTO composer.
- `getRemovalRequestOr404({ database: DatabaseExecutor, viewer: Viewer, requestId: string }): Promise<RemovalRequestRow>` applies three-party scope only.
- `makeRemovalRequestDtosFromRows({ database: DatabaseExecutor, b2: B2Client, viewer: Viewer, rows: readonly RemovalRequestRow[], now: Date }): Promise<RemovalRequestDto[]>` batches member/media reads and signs only visible items.
- `enqueueRemovalEmails({ transaction: DatabaseExecutor, requests: readonly RemovalRequestRow[], event: 'requested' | 'deleted' | 'declined' | 'withdrawn' | 'reminder', actorMemberId: string, now: string, weekIndexes?: ReadonlyMap<string, number> }): Promise<{ recipientCount: number }>` requires weekIndexes for reminder via a discriminated options type. Reminder actor is the requester whose own notification is excluded. All names/settings/payload dates freeze at enqueue. Task 8 reuses this exact interface for multiple deleted requests and reminders.
- `registerRemovalRoutes(app: FastifyInstance): Promise<void>` registers all five routes. Handlers return Task 1 response types and use immediate transactions for create/decline/withdraw.

- [ ] **Step 1: Write failure tests.** Tag gate follows item visibility even for admins; nonexistent/invisible POST/GET have equal errors. Queue role scope uses snapshot uploader and includes deleted history; scoped counts, pagination, DTO capabilities, nullable media after restricted access, request-ID 404 for outsiders, and forbidden versus not-open ordering match the API. Partial unique maps duplicate open asks to 409; settled asks permit a new ask. Admin/uploader cannot withdraw for another member. Decline requires words and settles one request. Withdrawal can succeed after access changes. Add direct constraint tests to reject open+resolved, settled+null-resolved, silent decline, and open+null-item.

```ts
expect(adminWithdraw.json().error).toBe("removal_request_forbidden");
expect(uploaderWithdraw.statusCode).toBe(403);
expect(secondResolution.json().error).toBe("removal_request_not_open");
expect(requesterDto.media).toBeNull();
expect(requesterDto.canWithdraw).toBe(true);
expect(queue.removalRequests.map((row) => row.requestId)).toContain(
  deletedRequestId,
);
```

Mail tests cover initial uploader+active admins minus actor, deduplicated
uploader/admin identities, no inactive/invited recipients, requester answer
ignoring notify_on_removal, withdrawal honoring it, snapshots, per-recipient
keys, missing base_url failed rows, and rollback. Inject a failing SQLite
trigger on a targeted outbound insert, using fixed SQL, to prove both request
state and earlier email inserts roll back; drop the test trigger on cleanup.

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test test/removals test/routes/removals.test.ts`. **Expected:** new route/state/mail tests fail.
- [ ] **Step 3: Implement** scoped reads/DTOs, partial-unique error mapping, conditional open-state transitions, permission gates, payload/recipient construction, enqueues and registrars. Create snapshots include original rendition key and item upload day for request payload. For a legacy open row with item_captured_at null, use the still-live item's captured_at to derive its email day; the open-row invariant guarantees its item exists. New API rows always snapshot that instant. Settled history DTOs keep the nullable snapshot as stored and do not trigger new mail.
- [ ] **Step 4: Run** `pnpm --filter @memory-shoebox/server test test/removals test/routes/removals.test.ts test/items test/mail` and server type-check. **Expected:** all pass. Assert fixed batched query counts for DTO/queue reads, excluding the intentional per-recipient outbound insert.
- [ ] **Step 5: Document** removal privacy, states, mail and recipient rules; commit as `feat: add removal requests and their notifications`.

### Task 8: Deletion resolution and real weekly reminder enqueues

**Files:** Modify `apps/server/src/items/closeOpenRemovalRequests.ts`, `items/deleteItem.ts` only as needed, `jobs/runRemovalReminder.ts`; extend `test/jobs/runRemovalReminder.test.ts`, `test/routes/itemDelete.test.ts`, `test/items/__tests__/deleteItem.record.test.ts`; create `test/removals/deleteResolution.test.ts`; update `docs/server.md`, `docs/removals.md`, `docs/mail.md`.

**Interfaces:** Existing deleteItem signature remains intact. closeOpenRemovalRequests retains its inputs/result, but reads all payload facts and calls Task 7's mail service before returning. runRemovalReminder retains database/ISO now inputs and due result for current callers/tests, while actually enqueueing inside an immediate transaction.

- [ ] **Step 1: Write failure tests.** Deletion closes all open requests before SET NULL, leaves settled state/resolver/timestamp unchanged, mails each requester and a non-actor uploader with the correct preferences, deduplicates overlapping identities, and sends no removal messages for zero open requests. A late outbound failure rolls back request settlement, item destruction, object-deletion enqueues, and activity. No B2 deletion occurs inside the transaction.

Reminder tests run the same hourly job repeatedly in one week, then across a
local week boundary, and settle via every outcome. Include week zero, timezone
and DST boundaries, new/removed admin identities, overlapping requester/admin
identities, suppressed preferences, and duplicate unique keys.

```ts
await runRemovalReminder({ database, now: weekOne });
await runRemovalReminder({ database, now: weekOneLater });
expect(await reminderRows()).toHaveLength(eligibleRecipientCount);
await runRemovalReminder({ database, now: weekTwo });
expect(await reminderRows()).toHaveLength(eligibleRecipientCount * 2);
await settleRequest();
await runRemovalReminder({ database, now: weekThree });
expect(await reminderRows()).toHaveLength(eligibleRecipientCount * 2);
expect(await requestRows()).toSatisfy((rows) =>
  rows.every((row) => row.item_id === null && row.state !== "open"),
);
```

- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test test/removals/deleteResolution.test.ts test/jobs/runRemovalReminder.test.ts test/routes/itemDelete.test.ts`. **Expected:** missing deleted/reminder mail assertions fail.
- [ ] **Step 3: Implement** transaction-bound deleted enqueues using the snapshot rows before item deletion; keep the conditional open update. Replace reminder discovery-only behavior with transaction-bound selection and Task 7 enqueue, retaining weekIndex >= 1 and exact unique key. Do not query outbound rows before insertion. Keep provider address suppression and already-queued reminder behavior unchanged.
- [ ] **Step 4: Run** `pnpm --filter @memory-shoebox/server test test/removals test/jobs test/items test/routes/itemDelete.test.ts test/mail` and server type-check. **Expected:** all pass, including existing object cleanup and CHECK guards.
- [ ] **Step 5: Update** docs to remove the unbuilt mail seams; commit as `feat: close removal loops on deletion and weekly reminders`.

### Task 9: Cross-slice verification and completion documentation

**Files:** Existing docs touched by prior tasks plus `docs/architecture.md`, `docs/prds/2026-09-27-memory-shoebox/plan/step-7a.md`; create `apps/server/test/routes/step7a.integration.test.ts`.

**Interfaces:** Consumes all fourteen routes, shared response schemas, timeline attachedToMilestoneId, existing delete route, real mail queue/renderers, and reminder job. Produces verification evidence and current implementation status.

- [ ] **Step 1: Write a failure-capable integrated lifecycle test.** Create an empty multi-day milestone, find and attach candidates, reconcile a mismatch, read its timeline flags, ask as a visible tagged member, run a reminder with controlled time, decline and ask again, withdraw and ask again, then delete the item as admin. Parse every response against its shared schema and verify all outcome payloads render through the actual registry. Assert all resolved rows survive as itemId null, the milestone survives, and no request is still open. This may pass immediately once earlier tasks compose correctly; record that rather than changing correct code to manufacture a failure.
- [ ] **Step 2: Run** `pnpm --filter @memory-shoebox/server test test/routes/step7a.integration.test.ts`. **Expected:** PASS, or a specific integration gap to reproduce and fix with red/green.
- [ ] **Step 3: Run** `pnpm check`, saving its output in this plan's SDD workspace. **Expected:** format, lint, types, build, and all tests pass. Inspect all resulting changes; restore unrelated formatter changes only when they came from this command and were not user work. If any behavior fix is needed, add its failing test before the fix.
- [ ] **Step 4: Audit** all nine milestone and five removal route registrations, both singular and batch capture callers, email registry/payloads, reminder key/guard, and every verification bullet in step-7a.md against tests/reports. Confirm no web surface, product-spec, prototype, generated skill, or unrelated source edits.
- [ ] **Step 5: Update** architecture's built-route/mail status and step 7a status, then commit as `docs: record verified completion of step 7a`. Do not mark complete until pnpm check passed on the final behavior. Run a final `git diff --check` after the documentation changes.

## Execution and handoff

Use the subagent-driven-development ledger, per-task brief/report files, and
independent task review gates. Never run two implementers concurrently in this
shared worktree. Dependencies are sequential: contracts; shared primitives;
milestone CRUD; picker reads; reconciliation; templates; removal routes/mail;
delete/reminder integration; final verification. The two slices do not require
one another's tables, but they intentionally share the contracts and transaction
helpers in this plan.

After Task 9, perform the fresh whole-branch review required by the execution
skill, including its fix/review process. Preserve reported rulings and any
deferred findings in the final handoff. Keep the branch and worktree for Juan
Pablo's review; do not merge, push, create a PR, or delete unmerged work.
