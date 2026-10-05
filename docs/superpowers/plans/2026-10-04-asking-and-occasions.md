# Asking and Occasions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Step 8b explicitly selects this execution method.

**Goal:** Implement surfaces 10, 14 and 15 so a family can ask, answer or withdraw a removal request and manage dated occasions with explicit attachment and reconciliation.

**Architecture:** Keep the three existing file routes thin. Validate every HTTP exchange with the merged shared schemas, use member-scoped TanStack Query reads and focused mutation controllers, and reuse the existing system components. The occasion picker reads attached and available timeline streams using the existing filter language.

**Tech Stack:** TypeScript, React 19, Mantine 9, TanStack Router and Query, Zod, Vitest, Testing Library and Playwright. No new product dependency.

**Spec:** `docs/superpowers/specs/2026-10-04-asking-and-occasions-design.md` (approved 2026-10-04).

## Global Constraints

- Work only in the existing `feat/asking-occasions` worktree. No push, merge, PR or publication.
- Modify only `apps/web`, `e2e` and relevant `docs`. No backend, shared-schema, migration, mail-template, product-spec, prototype or generated-skill edits.
- Product routes stay `/items/$itemId/removal`, `/removal-requests` and `/milestones`. Do not hand-edit `routeTree.gen.ts`.
- Use shared schemas and `apiFetch` on the same origin. Milestone names cap at 200, blurbs at 280, request/decline reasons at 4,000, attachment directions and reconciliation batches at 500.
- Use `canRequestRemoval`, `canWithdraw`, `canDecline`, `canDeleteItem`, `canEdit` and `canDelete` as the specified action gates. Role is allowed for queue access, occasion creation and explanatory copy only.
- Preserve upload helper names/call patterns and pre-ingest behavior. Manifest file IDs never become landed item IDs.
- Member-dependent reads include member identity in their cache keys. Cursors are opaque; duplicate IDs do not become duplicate cards; an empty page with a cursor is not the end.
- Item GET counts an open. Invalidate item detail with `refetchType: "none"`; do not broadly refetch `items` to refresh capabilities, dates or deleted state.
- Plain text and actual responder words; no invented recipient counts or delivered-mail claims. Deleted or unavailable media creates no broken image or dead item link.
- Square controls, Archivo body copy, existing tokens, CSS modules, native controls, focus restoration and pending/error announcements. No em dashes in saved copy.
- Red/green TDD for behavior; retain inputs on failure, block duplicate writes and refresh authority before retrying an uncertain mutation.

## Review Focus

1. A write commits but its response is lost or malformed: do not replay destructive/resolution operations or create a duplicate occasion. Tests: Tasks 2, 3 and 4.
2. A member or selected target changes while a read/write is pending: no former-member rows, capabilities or stale completion change the new target. Tests: Tasks 1, 2 and 3.
3. Attached and available streams contain representatives of the same burst, duplicate pages or empty advancing pages: select explicit item identities only and keep both cursors independent. Tests: Task 5.
4. Mismatches exceed a page or a 500-item batch, or another occasion changes underneath the form: widen with the server's whole-set span, require each move target and refresh refusals. Tests: Task 6.
5. Long unbroken words, accented names and 4,000-character replies at narrow width or 200% zoom: preserve the words, wrap controls, keep focus and prevent horizontal scrolling. Tests: Tasks 2 and 7.

## File and execution map

Task 1 owns clients, schemas and request construction. Task 2 owns the shared
request card/dialog/controller modules and queue route. Task 3 consumes those
units for the item-scoped asking route. Tasks 4, 5 and 6 own separate modules
under `surfaces/Milestones`; each extends the routed surface from Task 4.
Task 7 owns browser acceptance and final documentation. Execute in that order;
do not run implementers that share these files concurrently.

New E2E files live under `e2e/occasions-and-removals/`, after
`empty.spec.ts` in the existing alphabetical single-worker ordering. Their
fixtures seed only suite-owned rows, without clearing unrelated archive data.

Use separate files for components and colocated tests/styles. The exact
public units below are the cross-task contracts; private layout components
may be split within their owning module when needed to meet the 45-line
function limit. No barrel files. Shared test fixtures live in
`apps/web/src/testing/askingAndOccasionsFixtures.ts`.

### Task 1: Validated clients and member-scoped reads

**Files:**

- Create: `apps/web/src/api/removals/removals.ts`, `removalsQueryHelpers.ts`, `removals.types.ts`, `removals.test.ts` in that directory.
- Modify: `apps/web/src/api/milestoneHelpers/milestoneHelpers.ts`, `milestoneHelpers.types.ts`, `milestoneSchemas.constants.ts`, `milestonesQueryHelpers.ts`, `milestoneHelpers.test.ts`.
- Create: `apps/web/src/api/milestoneHelpers/milestoneItemsHelpers.ts`, `milestoneItemsQueryHelpers.ts`, `milestoneItemsHelpers.test.ts`.
- Modify: `apps/web/src/api/timeline/selection/selection.ts`, `selection.test.ts`, `apps/web/src/api/timeline/timeline.ts`, `timeline.test.ts`.
- Create: `apps/web/src/testing/askingAndOccasionsFixtures.ts`.
- Update: `docs/web.md` client-contract notes.

**Interfaces:**

- Consume `apiFetch`, `jsonInit`, `makePathFromSearchParams`, shared route schemas/types and existing `deleteItem(itemId: string): Promise<void>`.
- Produce removal actions: `createRemovalRequest({ itemId, body }: Readonly<{ itemId: string; body: CreateRemovalRequestRequest }>): Promise<RemovalRequestDto>`; `declineRemovalRequest({ requestId, body }: Readonly<{ requestId: string; body: DeclineRemovalRequestRequest }>): Promise<RemovalRequestDto>`; `withdrawRemovalRequest(requestId: string): Promise<RemovalRequestDto>`.
- Produce `makeItemRemovalRequestsQueryOptionsFromIdentity({ memberId, itemId })`, returning `queryOptions` for `ListItemRemovalRequestsResponse`; `makeRemovalRequestsInfiniteQueryOptionsFromQueueScope({ memberId, state })`, returning `infiniteQueryOptions` for `ListRemovalRequestsResponse` pages. Both take readonly named fields; `state` is `"open" | "settled"`.
- Preserve `createMilestone(body)` and `updateMilestone({ milestoneId, body })`; their body/response aliases adopt shared route contracts. Existing upload calls still omit `itemIds`.
- Produce `makeMilestoneDetailQueryOptionsFromIdentity({ memberId, milestoneId })` for `MilestoneDetail`, `makeMilestonesInfiniteQueryOptionsFromMemberId(memberId: string)` for `ListMilestonesResponse` pages, and `deleteMilestone(milestoneId: string): Promise<DeleteMilestoneResponse>`.
- Produce `setMilestoneItems({ milestoneId, body }): Promise<SetMilestoneItemsResponse>` and `reconcileMilestone({ milestoneId, body }): Promise<ReconcileMilestoneResponse>`, using shared `SetMilestoneItemsRequest` and `ReconcileMilestoneRequest` bodies.
- Produce `makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity({ memberId, milestoneId })` for span `ListMilestoneCandidatesResponse` pages and `makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity({ memberId, milestoneId })` for `ListMilestoneMismatchesResponse` pages.
- Extend `TimelineSelection` with optional `attachedToMilestoneId?: string` and `excludeAttached?: boolean`. Preserve all existing required fields. Add optional `memberId` as a second argument to `makeTimelineQueryOptionsFromView(view, memberId?)`; existing callers are unchanged and the picker always supplies it.
- Export fixture factories `makeRemovalRequestFromOverrides(overrides?: Partial<RemovalRequestDto>): RemovalRequestDto`, `makeMilestoneDetailFromOverrides(overrides?: Partial<MilestoneDetail>): MilestoneDetail`, and `makeItemSummaryFromOverrides(overrides?: Partial<ItemSummary>): ItemSummary`. Use valid fixed UUIDs and signed-media shapes; no network calls.

- [ ] **Step 1: Write failing API and query tests.** Use `stubFetch`, `getRecordedRequests` and `QueryClient`. Assert exact methods/paths/bodies for all five removal and all nine occasion routes; withdrawal has no JSON body, item DELETE stays 204, milestone DELETE parses 200. Assert blank ask becomes null, blank decline fails, 200/201-character names succeed/fail, malformed responses reject, and structured field errors survive.
- [ ] **Step 2: Add request-identity tests.** Different members, queue tabs and attachment branches have distinct query keys. A second page URL contains the encoded opaque cursor; returned `nextCursor: null` ends pagination. Ordinary timeline URLs are unchanged. Pin the attachment query:

```ts
expect(
  makeTimelinePathFromView({
    view: {
      selection: {
        ...emptySelection,
        attachedToMilestoneId: milestoneId,
        excludeAttached: true,
      },
      at: undefined,
    },
  }),
).toBe(`/timeline?attachedToMilestoneId=${milestoneId}&excludeAttached=true`);
expect(requests.find(({ method }) => method === "PATCH")?.body).toEqual({
  attach: [itemId],
  detach: [],
});
```

- [ ] **Step 3: Run RED.** `pnpm --filter @memory-shoebox/web test -- src/api/removals src/api/milestoneHelpers src/api/timeline`. Expected: failures on missing actions/query options and existing 120-character/attachment-filter behavior, not unrelated setup failures.
- [ ] **Step 4: Implement the interfaces.** Call the documented routes, encode path IDs, parse bodies and responses with shared schemas and derive keys from the same query strings sent. Query factories return typed TanStack options with null initial cursor and the route's `nextCursor`; pass Query's abort signal through read `init`. Replace local schema bodies with shared schema aliases; keep the complete-directory upload helper and its existing signature.
- [ ] **Step 5: Run GREEN and types.** Repeat Step 3, then `pnpm --filter @memory-shoebox/web type-check`. Expected: all selected tests pass and no type errors. Existing upload milestone contract tests remain green.
- [ ] **Step 6: Update client docs and commit.** `git add apps/web/src/api apps/web/src/testing/askingAndOccasionsFixtures.ts docs/web.md && git commit -m "feat: add occasion and removal clients"`. Stage only this task's files. Expected: commit contains the validated clients and no backend edits.

### Task 2: Shared request presentation and the answer queue

**Files:**

- Create modules under `apps/web/src/surfaces/RemovalRequests/`: `RemovalRequestsSurface/RemovalRequestsSurface.tsx`, `RemovalRequestsSurface.test.tsx`; `RemovalRequestCard/RemovalRequestCard.tsx`, `.test.tsx`, `.module.css`; `RemovalRequestPreview/RemovalRequestPreview.tsx`; `RemovalActionDialogs/RemovalActionDialogs.tsx`, `.test.tsx`; `DeclineRemovalDialog/DeclineRemovalDialog.tsx`; `DeleteRemovalDialog/DeleteRemovalDialog.tsx`; `useRemovalActions/useRemovalActions.ts`, `.test.tsx`; `removalCopyHelpers/removalCopyHelpers.ts`, `.test.ts`.
- Modify: `apps/web/src/routes/_app/removal-requests.tsx`, `apps/web/src/routes/rendering.test.tsx` scoped queue fixtures/expectations.
- Update: `docs/removals.md`, `docs/web.md`.

**Interfaces:**

- Consume Task 1 actions/query options/fixtures, `deleteItem`, `Viewer`, route context and existing system components.
- Produce `RemovalRequestCard({ request, viewer, onDelete, onDecline, onWithdraw? })`, accepting `RemovalRequestDto`, `Viewer` and callbacks receiving that DTO. It renders controls only from its three capability booleans.
- Produce `useRemovalActions({ viewer, onItemDeleted? }): RemovalActions`. `RemovalActions` has `target: RemovalRequestDto | undefined`, `dialog: "delete" | "decline" | undefined`, `openDelete(request)`, `openDecline(request)`, `close()`, `confirmDelete()`, `confirmDecline(reason: string)`, `withdraw(request)`, `isPending: boolean`, `error: string | undefined`, and `fieldErrors: Record<string, string[]>`. `onItemDeleted?(itemId: string)` runs after confirmed deletion only.
- Produce `RemovalActionDialogs({ actions, viewer })` and `RemovalRequestsSurface()`. The surface reads identity from the guarded route context; action data lives in the hook, form text lives in its dialog keyed by request ID.

- [ ] **Step 1: Write failing card and dialog tests.** A viewer with all three capabilities false sees no action controls even if the test changes the role to admin. An admin with `canWithdraw: false` sees no proxy withdrawal. Preserve accented resolver names and exact decline words, including newlines and HTML-looking text. Null item ID/media renders Gone with no image/link; existing ID/null media renders Unavailable without asserting deletion. A null reason uses the prototype's allowed-no-reason copy.
- [ ] **Step 2: Write failing queue/controller tests.** Server counts may exceed loaded cards; all three settled outcomes render. Zero open plus nonzero settled still permits opening history. Follow an empty advancing page and reject repeated cursors with retry copy. Required decline whitespace sends nothing; rapid confirmation sends one mutation; closing/reopening the same failed decline retains text, switching request resets it. An old pending result cannot close a newer target dialog or populate another viewer's queue. Response loss triggers an authoritative read before retry, without automatically sending the mutation again.

```ts
expect(
  screen.queryByRole("button", { name: "Withdraw the request" }),
).toBeNull();
expect(screen.queryByRole("img")).toBeNull(); // deleted-card case
expect(screen.queryByRole("link", { name: /photo/i })).toBeNull();
expect(
  getRecordedRequests().filter(({ method }) => method === "DELETE"),
).toHaveLength(1);
```

- [ ] **Step 3: Run RED.** `pnpm --filter @memory-shoebox/web test -- src/surfaces/RemovalRequests src/routes/rendering.test.tsx`. Expected: new controls/surface tests fail against missing modules or the placeholder route.
- [ ] **Step 4: Implement cards, dialogs, hook and routed queue.** Use exact requester/resolver snapshots, native links, Mantine focus restoration, status/error announcements and wrapping CSS. Query open and settled separately by member; show load-more and normal zero-waiting state. Guard the queue for viewers. Mutation keys include member/request/item identities; item delete shares `makeWriteScopeFromItemId`, other request mutations use a request-ID scope. Hold an immediate ref guard until completion/read reconciliation. On success invalidate all removal queue tabs and matching item history; mark archive and affected item cache stale without active item GETs. Disable dismissal/target switching during a submitted write, while keeping form text on refusal.
- [ ] **Step 5: Wire the visibility alternative.** For a visible live item, link to `/items/$itemId`, explain that its Who can see this section contains the existing edit control, and preserve the open request. Do not add item-viewer behavior or call decline/withdraw from that link. Omit the link with null media/item ID.
- [ ] **Step 6: Run GREEN.** Repeat Step 3. Expected: all selected tests pass, including refresh invalidating both tabs after deleting one item with multiple open requests. Assert no refresh invokes `/api/items/:id` solely to populate this queue.
- [ ] **Step 7: Update docs and commit.** Stage this task's modules, route/test changes and docs; `git commit -m "feat: implement removal answer queue"`. Expected: surface 15 and shared answering controls are independently usable.

### Task 3: Asking, own history, Ask again and withdrawal

**Files:**

- Create modules under `apps/web/src/surfaces/Removal/`: `RemovalSurface/RemovalSurface.tsx`, `.test.tsx`; `RemovalAskForm/RemovalAskForm.tsx`, `.test.tsx`; `RemovalOwnHistory/RemovalOwnHistory.tsx`; `useRemovalAsk/useRemovalAsk.ts`, `.test.tsx`; `removalStateHelpers/removalStateHelpers.ts`, `.test.ts`.
- Modify: `apps/web/src/routes/_app/items.$itemId_.removal.tsx`, `apps/web/src/routes/rendering.test.tsx` scoped removal fixtures/expectations.
- Update: `docs/removals.md`, `docs/web.md`.

**Interfaces:**

- Consume Task 1 item history/create action and Task 2 `RemovalRequestCard`, `RemovalActionDialogs`, `useRemovalActions`.
- Produce `RemovalSurface({ itemId }: Readonly<{ itemId: string }>): ReactNode` and `getRemovalViewFromResponse({ response, viewer }): RemovalView`. `RemovalView` has `ownNewest: RemovalRequestDto | undefined`, `ownOpen: RemovalRequestDto | undefined`, `incoming: RemovalRequestDto[]`, `canAsk: boolean`; response is `ListItemRemovalRequestsResponse` and viewer is `Viewer`.
- Produce `useRemovalAsk({ memberId, itemId, onCreated }): RemovalAsk`. `RemovalAsk` has `send(reason: string)`, `isPending`, `error: string | undefined`, `fieldErrors: Record<string, string[]>`; `onCreated(request: RemovalRequestDto)` receives only a confirmed/current-target result.

- [ ] **Step 1: Write failing state and asking tests.** Cover every prototype state, newest own declined history, own withdrawn history, multiple incoming asks and an uploader/admin who is also asking. Own open history wins over the ask form; capability false never offers Send. Ask again opens a fresh optional form without sending. A blank reason is accepted, a 4,001-character trimmed reason is refused, and failed text survives. Missing/malformed/inaccessible item addresses show the same unavailable presentation and never expose request controls.
- [ ] **Step 2: Write withdrawal and race tests.** Successful withdraw renders returned state and permits fresh asking only from refreshed `canRequestRemoval`. Admin/uploader cannot withdraw another person's request. A 409 refreshes history. A create response lost after commit discovers the new own open request and does not resend. On changing item/member during a pending read/write, old rows and completion announcements do not appear in the new view. Confirm that asking/answering reads do not call the counted item-detail GET.

```ts
expect(screen.getByText(reply, { exact: true })).toBeVisible();
expect(
  getRecordedRequests().filter(({ method }) => method === "POST"),
).toHaveLength(0); // Ask again before Send
expect(
  getRecordedRequests().some(({ url }) => url === `/api/items/${itemId}`),
).toBe(false);
```

- [ ] **Step 3: Run RED.** `pnpm --filter @memory-shoebox/web test -- src/surfaces/Removal src/routes/rendering.test.tsx`. Expected: new own-history/state/form behavior fails against the placeholder.
- [ ] **Step 4: Implement the route and controllers.** Keep the trailing underscore and `hasOwnBar`. Use the supplied item summary for preview, timezone-aware existing date labels, and requester identity only to group history. Use capability booleans for actions. Keep failed form text, announce recorded requests without recipient counts/delivery promises, and route a confirmed item deletion to the queue with a local confirmation rather than back to a dead photograph. If withdrawal is rejected, refresh before offering another action.
- [ ] **Step 5: Run GREEN and relevant regressions.** Repeat Step 3 and run `pnpm --filter @memory-shoebox/web test -- src/surfaces/Item/ItemSurface src/routes`. Expected: all selected tests pass; item entry point and one-bar routing behavior remain intact.
- [ ] **Step 6: Update docs and commit.** Stage this task's files only; `git commit -m "feat: implement asking and withdrawal"`. Expected: surface 10 uses live clients and all designed states are renderable through response data.

### Task 4: Occasion list, create/edit, empty state and label deletion

**Files:**

- Create modules under `apps/web/src/surfaces/Milestones/`: `MilestonesSurface/MilestonesSurface.tsx`, `.test.tsx`; `MilestoneList/MilestoneList.tsx`, `.module.css`; `MilestoneForm/MilestoneForm.tsx`, `.test.tsx`; `MilestoneDeleteDialog/MilestoneDeleteDialog.tsx`, `.test.tsx`; `MilestoneEmpty/MilestoneEmpty.tsx`; `useMilestoneForm/useMilestoneForm.ts`, `.test.tsx`; `milestoneSearchHelpers/milestoneSearchHelpers.ts`, `.test.ts`; `milestoneCacheHelpers/milestoneCacheHelpers.ts`, `.test.ts`.
- Modify: `apps/web/src/routes/_app/milestones.tsx`, `apps/web/src/routes/search.test.ts`, `apps/web/src/routes/rendering.test.tsx` scoped occasion fixtures/expectations.
- Update: `docs/milestones.md`, `docs/web.md`.

**Interfaces:**

- Consume Task 1 occasion clients, `MilestoneDateFields`, `MilestoneBand`, `Viewer` and existing system components.
- Produce `MilestoneSearch = { milestone?: string; mode?: "create" | "created" | "edit" | "attach" | "fix" | "empty" | "delete" }`, `getMilestoneSearchFromUnknown(search: unknown): MilestoneSearch` with Zod validation, and `MilestonesSurface(): ReactNode`.
- Produce `MilestoneForm({ detail?, selection?, onSaved, onCancel })`. Detail is `MilestoneDetail`, selection is optional `readonly Pick<ItemSummary, "itemId" | "capturedOn">[]`; `onSaved(detail: MilestoneDetail)` runs after a confirmed create/update. A selection can only originate from an existing explicit caller; do not add a new timeline bulk flow.
- Produce `invalidateMilestoneReads({ queryClient, milestoneId, itemIds?, hasMovedItems? }): Promise<void>`. Refetch member-scoped active occasion/candidate/mismatch reads, invalidate timeline/rail and burst data as appropriate, and mark item details stale with `refetchType: "none"`.
- Navigation to created/attach/fix is represented by validated search state. Tasks 5 and 6 add the corresponding components to this surface.

- [ ] **Step 1: Write failing form/list/search tests.** Dates collapse to equal ends for one day, span requires ordered ends, blank blurb becomes null, 200-character name succeeds. Create sends optional explicit item IDs only when supplied; prefill selected capture days without deriving them again after a user edit. Viewer gets read-only rows and no New; row permissions override creator/role guesses. Follow list cursors, render zero counts honestly and handle null creator. Refresh/Back preserves stored milestone/mode; malformed IDs or impossible mode/ID combinations reach a safe route error, never a mutation.
- [ ] **Step 2: Write failed/uncertain mutation and deletion tests.** Validation refusal retains text; duplicate presses create once; a transport/Zod failure after create never automatically creates again or identifies success by a duplicate name. Disable resubmit until the member explicitly resolves uncertainty via the list. Saving an edit that returns mismatches navigates to fix. Delete uses milestone DELETE only, displays returned name/count and leaves item caches/media intact.

```ts
expect(createBody).toMatchObject({
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
});
expect(
  getRecordedRequests()
    .filter(({ method }) => method === "DELETE")
    .map(({ url }) => url),
).toEqual([`/api/milestones/${milestoneId}`]);
expect(itemQueryFn).not.toHaveBeenCalled(); // cache invalidation must not record an open
```

- [ ] **Step 3: Run RED.** `pnpm --filter @memory-shoebox/web test -- src/surfaces/Milestones src/routes`. Expected: occasion behavior/search tests fail against the placeholder or missing modules.
- [ ] **Step 4: Implement routed CRUD.** Use the per-viewer server count, named New/Edit/Attach/Delete controls, duplicate-name support and label-only delete copy. Create navigates to the saved `created` mode; Cancel from that saved mode returns to the list without deleting the occasion. Empty state uses `MilestoneBand` with its real span/count and omits the fixture-only contact button. At narrow widths use wrapping rows/cards rather than a horizontally scrolling table. Keep shared date controls behavior and upload forms unchanged.
- [ ] **Step 5: Run GREEN and upload regressions.** Repeat Step 3, then `pnpm --filter @memory-shoebox/web test -- src/api/milestoneHelpers src/surfaces/Upload/UploadMilestoneModal src/UploadMilestoneDates.integration.test.tsx`. Expected: all selected tests pass and the existing upload flow remains green.
- [ ] **Step 6: Update docs and commit.** Stage this task's modules/routes/tests/docs; `git commit -m "feat: implement occasion forms and list"`. Expected: list/create/span/edit/empty/delete work through the existing address.

### Task 5: Span suggestions and filtered attachment deltas

**Files:**

- Create modules under `apps/web/src/surfaces/Milestones/`: `MilestoneCandidates/MilestoneCandidates.tsx`, `.test.tsx`; `MilestoneAttach/MilestoneAttach.tsx`, `.test.tsx`; `useMilestoneAttachment/useMilestoneAttachment.ts`, `.test.tsx`; `milestoneAttachmentHelpers/milestoneAttachmentHelpers.ts`, `.test.ts`.
- Modify: `apps/web/src/surfaces/Milestones/MilestonesSurface/MilestonesSurface.tsx`.
- Modify only if needed for member-scoped picker vocabulary reads: `apps/web/src/surfaces/Timeline/FilterSheet/FilterSheet.tsx`, `apps/web/src/api/vocabularies/vocabularies.ts`, `vocabularies.test.ts`; add optional member-ID arguments/prop without changing existing callers.
- Update: `docs/milestones.md`, `docs/web.md`.

**Interfaces:**

- Consume Task 1 candidates/timeline options and `setMilestoneItems`, Task 4 invalidation, `FilterSheet` and `Print`.
- Produce `MilestoneCandidates({ detail, viewer, onDone, onFix })` and `MilestoneAttach({ detail, viewer, onDone, onFix })`. Detail is `MilestoneDetail`; viewer is `Viewer`; `onFix(detail: MilestoneDetail)` receives a successful delta with pending mismatches; `onDone(): void` navigates to the list.
- Produce `MilestoneAttachmentEntry = { item: ItemSummary; isAttached: boolean }` and `getMilestoneItemDeltaFromChoices({ baseline, chosen }): SetMilestoneItemsRequest`, accepting `ReadonlyMap<string, boolean>` for both maps. Only explicitly observed/toggled IDs may enter a delta.
- Produce `useMilestoneAttachment({ detail, viewer, source }): MilestoneAttachment`. It exposes `entries`, `chosenCount`, `attachCount`, `detachCount`, `toggle(itemId)`, `save()`, `isPending`, `error`, `selection`, `onSelectionChange(selection)`, `hasMore`, `loadMore()`, and `savedDetail: MilestoneDetail | undefined`; `source` is `"span" | "archive"`; choices are retained across filtering and failed saves.

- [ ] **Step 1: Write failing delta tests.** Existing attached selected IDs stay absent from a delta, unchecked attached IDs become detach, selected available IDs become attach, and toggling twice yields no change. Filtering a pending change away does not drop it or create unrelated detaches. Reject a 501-ID direction before the request and preserve choices. Candidate pages use `isAttached`; leaving suggestions empty performs no deletion.
- [ ] **Step 2: Write paired-stream/burst tests.** Attached and available requests carry identical tag/person/date fields plus distinct attachment booleans and cursors. Handle an empty advancing page, duplicate item rows and responses arriving in reverse order after a filter change. A shared burst across branches keeps distinct returned `itemId` values; selection sends only the pressed identity, not `coverItemId`, siblings or `visibleFrameCount` inferred IDs. Typed search requests vocabulary `q`, never timeline `q`.

```ts
expect(delta).toEqual({
  attach: [chosenAvailableId],
  detach: [uncheckedAttachedId],
});
expect(body.attach).toEqual([representative.itemId]);
expect(body.attach).not.toContain(representative.burst?.coverItemId); // fixture uses a distinct cover
expect(
  timelineUrls.every(
    (url) => !new URL(url, "http://localhost").searchParams.has("q"),
  ),
).toBe(true);
```

- [ ] **Step 3: Run RED.** `pnpm --filter @memory-shoebox/web test -- src/surfaces/Milestones src/api/timeline src/api/vocabularies`. Expected: new picker/delta tests fail for missing behavior; ordinary filter tests stay meaningful.
- [ ] **Step 4: Implement both picker modes.** Span suggestions page candidates and preserve individual identities. Attach reads two independently paginated filtered timeline branches, combines/deduplicates entries in capture-day order and omits itemless milestone days from selectable results. Retain first-observed baseline plus explicit pending choices across narrowing; a server refresh must not silently overwrite unsaved toggles. Add member identity to picker facets/vocabulary query keys. A no-change Save returns without PATCH; successful PATCH uses actual server delta counts, refreshes reads and offers fix if `mismatchCount > 0`. Cancel discards local choices only.
- [ ] **Step 5: Run GREEN.** Repeat Step 3 and the ordinary timeline FilterSheet tests. Expected: picker tests and existing filtering pass; no seen/open latch is invoked merely by choosing attachments.
- [ ] **Step 6: Update docs and commit.** Stage this task's files and optional scoped filter extensions; `git commit -m "feat: attach photographs to occasions"`. Expected: created and attach states work without a second search grammar or whole-set replacement.

### Task 6: Reconciliation with explicit dates and whole-set widening

**Files:**

- Create modules under `apps/web/src/surfaces/Milestones/`: `MilestoneReconcile/MilestoneReconcile.tsx`, `.test.tsx`; `useMilestoneReconcile/useMilestoneReconcile.ts`, `.test.tsx`; `milestoneReconcileHelpers/milestoneReconcileHelpers.ts`, `.test.ts`.
- Modify: `apps/web/src/system/MilestoneFix/MilestoneFix.tsx`, `MilestoneFix.test.tsx`; add private `MilestoneFixRows.tsx`, `MilestoneFixActions.tsx` and `MilestoneFix.module.css` in that directory.
- Modify: `apps/web/src/surfaces/Milestones/MilestonesSurface/MilestonesSurface.tsx`.
- Update: `docs/milestones.md`, `docs/web.md`.

**Interfaces:**

- Consume Task 1 mismatches/reconcile/update clients and Task 4 invalidation.
- Produce `MilestoneReconcile({ detail, viewer, onDone, onOtherMilestone })`; `onOtherMilestone(milestoneId: string): void` navigates to another saved fix mode.
- Replace the placeholder system fix contract with `MilestoneFix({ milestone, strays, totalMismatchCount, wideningSpan, targets, onTargetChange, onMove, onWiden, onAcknowledge, isPending, error?, fieldErrors? })`. `strays` retain the existing `{ itemId, media, capturedOn }` shape. `targets` is `Readonly<Record<string, string | undefined>>`; `onTargetChange({ itemId, targetOn })` accepts strings; action callbacks are parameterless and distinct. `wideningSpan` is the server-provided `{ startsOn, endsOn }`. No production caller besides this surface currently uses the placeholder system component; upload uses its own `UploadMilestoneFix` and remains unchanged.
- Produce `makeReconcileRequestFromTargets({ milestone, itemIds, targets }): ReconcileMilestoneRequest | undefined`; only returns move mode when every named target is in the span and there are 1-500 unique IDs.

- [ ] **Step 1: Write failing explicit-date tests.** A one-day occasion supplies its sole target. A span initializes blank Choose a day targets and sends no move until every submitted ID is chosen. Targets survive paging by ID; out-of-span/blank/dotted server field errors attach to the correct item, preserve inputs and block premature retry. The displayed batch caps at 500 and remaining mismatches stay discoverable.
- [ ] **Step 2: Write full-set/authority tests.** Loaded four rows may represent 650 pending mismatches: headings distinguish those figures, Move/Acknowledge address the displayed explicit batch only, and Widen uses the server span including an unloaded extreme date. Changed span/attachment conflict refreshes detail and mismatches before another action. Return `raisedElsewhere` as named navigation controls. Uncertain response re-reads authoritative detail/mismatches rather than replaying automatically.

```ts
expect(moveBody).toEqual({
  mode: "move",
  moves: [
    { itemId: firstId, targetOn: "2026-09-18" },
    { itemId: secondId, targetOn: "2026-09-20" },
  ],
});
expect(acknowledgeBody).toEqual({ mode: "acknowledge", itemIds: displayedIds });
expect(widenBody).toEqual({ startsOn: "2026-08-31", endsOn: "2026-10-02" }); // includes unloaded extrema
```

- [ ] **Step 3: Run RED.** `pnpm --filter @memory-shoebox/web test -- src/system/MilestoneFix src/surfaces/Milestones`. Expected: the old placeholder callback/default span target cannot satisfy the new action and full-set assertions.
- [ ] **Step 4: Implement the controlled sheet and controller.** Use page metadata for widening, detail for total count, explicit targets for moves and separate pending actions. Acknowledgment persists through POST rather than just dismissing. Refetch remaining rows after each successful batch; zero mismatches renders completion and a way back. Offer raised occasions without guessing their affected hidden counts. Stack row prose and date controls at narrow widths; wrap actions. Invalidate moved item/burst/archive reads with no phantom active item GETs.
- [ ] **Step 5: Run GREEN and shared-control regressions.** Repeat Step 3, then `pnpm --filter @memory-shoebox/web test -- src/system/MilestoneDateFields src/surfaces/Upload/UploadMilestoneFix src/UploadMilestoneDates.integration.test.tsx`. Expected: all selected tests pass; pre-ingest upload reconciliation remains unchanged.
- [ ] **Step 6: Update docs and commit.** Stage this task's files/docs; `git commit -m "feat: reconcile occasion capture dates"`. Expected: all nine occasion states are wired and each fix action has the documented effect.

### Task 7: Browser acceptance, visual comparison and completion record

**Files:**

- Create: `e2e/occasions-and-removals/asking-occasions.fixtures.ts`, `removals.spec.ts`, `milestones.spec.ts`, `keyboard.spec.ts`, `responsive.spec.ts`, `visual.spec.ts`.
- Create: `e2e/occasions-and-removals/support/seedAskingAndOccasions/seedAskingAndOccasions.ts`, `getRemovalMailFromOutbox/getRemovalMailFromOutbox.ts`, `prototypeStateHelpers/prototypeStateHelpers.ts` (directory modules, split private helpers when needed).
- Update: `docs/e2e.md`, `docs/web.md`, `docs/milestones.md`, `docs/removals.md`, `docs/architecture.md`, `docs/prds/2026-09-27-memory-shoebox/plan/step-8b.md`, `docs/prds/2026-09-27-memory-shoebox/plan/README.md` progress only.
- Fix only acceptance failures within this plan's web/e2e files. No backend or unrelated cleanup.

**Interfaces:**

- Consume all routed surfaces and existing isolated E2E catalog, fake S3, `seedMemberAtAddress`, `signInAs` and shared email payload schemas.
- Produce suite-local fixtures `askerPage`, `uploaderPage`, `adminPage` with one cached storage state per address. Seed unique disposable cases in `E2E_DATABASE_PATH` with a linked people tag and visible item; PUT fixture thumbnail/display/original bytes into the local fake S3 bucket so live previews actually load. Read queued removal mail through a second catalog handle, never through a new route or configured real sender.
- Visual fixtures fulfill controlled API responses only for visual states. Live flow tests drive the real API without replacing its mutation/read JSON.

- [ ] **Step 1: Write failing live-flow browser cases.** Asker sends blank/reasoned ask, sees Already and withdraws; uploader observes withdrawal and its queued notification. Asker asks again, uploader declines in exact words, asker reads reply and uses Ask again; admin deletes with multiple open asks, both settle and the item address becomes unavailable. Assert admin has no proxy-withdraw control and viewer has no decline/delete controls. Use separate cases/items to avoid cross-test dependence.
- [ ] **Step 2: Write failing occasion/browser cases.** Create single-day/span, leave a saved occasion empty, find/attach candidates, narrow by tag/person/date, toggle a delta, then move/acknowledge/widen and inspect resulting real capture days. Delete the label and verify the item remains readable. Keyboard cases use Tab/Shift+Tab/Enter and typing, never mouse/focus calls to bypass traversal. Confirm dialog trap/restoration and selectable print `aria-pressed`.
- [ ] **Step 3: Run RED.** `pnpm exec playwright test e2e/occasions-and-removals --project=chromium`. Expected: any not-yet-covered browser integration fails with an actionable assertion; if all product behavior already works, add the missing observable assertion before treating a new behavioral fix as TDD. Do not deliberately break completed features merely to make acceptance tests red.
- [ ] **Step 4: Add the visual/responsive matrix and fix verified failures.** All five removal, five queue and nine occasion states at 1280/768/400 in light/dark, plus 640px reflow equivalent of 200% zoom and a manual actual 200% browser-zoom pass on all three surfaces. Include 4,000-character/unbroken replies, accented names and failed controls. Assert document scroll width is no greater than client width and use screenshots for clipping/focus checks. Match each state to its prototype URL, hide prototype switcher chrome and keep intended production wrapping improvements. Save comparison images/evidence in ignored `.playwright-mcp/step8b-acceptance/`.
- [ ] **Step 5: Run GREEN.** Repeat Step 3. Expected: all live, keyboard and controlled visual/browser assertions pass with no skipped required cases. Re-run focused Vitest tests for any fix. Perform the whole three-person removal flow and keyboard attaching manually in the isolated E2E environment; observe uploader withdrawal notification in the queued mail record, not a delivery claim.
- [ ] **Step 6: Run the required repository gate.** `pnpm check`. Expected: skill validation, formatting, lint, types, builds and every Vitest suite pass. Run existing impacted browser coverage once: `pnpm exec playwright test e2e/item e2e/account e2e/filter.spec.ts e2e/occasions-and-removals --project=chromium`. Expected: pass, preserving any documented unrelated pre-existing parked case; no new required case is parked.
- [ ] **Step 7: Record exact completion evidence and commit.** Update docs as implemented, list command results, matrix/manual results and any concrete remaining limitations. Mark step 8b complete only when every required criterion is satisfied; otherwise record implemented with the specific pending acceptance. Stage this task's files and `git commit -m "test: verify asking and occasion surfaces"`. Expected: no product spec or backend changes and no ignored screenshots staged.

## Controller completion checklist

- [ ] Initialize this plan's SDD workspace and task ledger, then preflight its interfaces against the approved spec and current code.
- [ ] Dispatch each task's implementer and reviewer through the required SDD skill, record tests/commits/findings, and finish each review gate before its dependent task.
- [ ] Run the whole-branch review and address material findings through the skill's fix/re-review workflow.
- [ ] Verify clean tracked status, all required acceptance evidence and the worktree's final commit. Keep the unmerged branch/worktree available for Juan Pablo's review.
- [ ] Report what changed, verification, any rulings/deferred findings and remaining actions. Do not push, merge, publish or delete the unmerged worktree.
