# Burst Interactions and Upload Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if Pablo chooses it. Steps use checkbox syntax for tracking.

**Goal:** Add full-burst and additive range selection, coherent thumbnail overlays, responsive burst motion, immediate photo flight, 100ms hover image warming, and compact upload size labels.

**Architecture:** Keep one timeline selection controller and one transformed paper root per print. Separate photo journey geometry from pixel readiness, and extend the existing member-scoped prefetch ownership instead of building a second cache. A small upload-specific formatter changes size labels without changing byte accounting.

**Tech Stack:** Existing React, TypeScript, Mantine, TanStack Query/Router, CSS and Web Animations API; Vitest and Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-31-burst-interactions-design.md`

**Status:** Approved and implemented on `fix/burst-interactions`. Independent review is complete; both Important findings are fixed and covered by regressions. Verification is recorded below. The unchecked steps below preserve the originally approved checklist, not current task status; execution notes record equivalent coverage and deviations.

## Global constraints

- Use **burst**, **Select full burst**, and Mantine Tooltip/Checkbox/Menu/ActionIcon.
- Preserve existing ticks during additive operations. Maximum final selection: 500 items; reject oversized additions atomically.
- Preserve the first-Shift-click anchor semantics, not the conventional plain-click anchor.
- Shared paper root owns all visual transforms. No interactive element nested in the photo button.
- Preserve authorization, signed-URL ownership, responsive candidate choice and native request mode.
- Hover dwell: 100ms; existing neighbor dwell: 250ms. Do not add them together.
- Prefetch limits remain two operations, 8 MiB encoded, 32 MiB decoded, one retained decode.
- Motion: open 300ms plus at most 60ms stagger, close 200ms, surrounding layout at most 300ms; reduced motion 100-120ms opacity.
- Upload size labels use B/KB/MB/GB, 1024-based units, `en-GB`, at most one decimal and no trailing `.0`; retain exact bytes for percentages and completion.
- Local synthetic test data and fake email only. No production mutations or real test email.
- Implement in a development worktree through `wt`. No push, PR, merge, publication, or main commit without explicit authorization.
- Read applicable rules and Impeccable craft-floor before UI edits; use the TDD and Playwright skills for their respective implementation work.

## Review focus

1. Rapid clicks during pending burst reads must not drop range extensions or revive a cancelled range. Covered in Task 1.
2. Filters, paginated burst tails and virtualized rows must not create partial or hidden selections. Covered in Tasks 1 and 3.
3. Overlay hit targets must not overlap adjacent photos or create nested controls. Covered in Tasks 2 and 7.
4. Preview-to-detail replacement, decode failure and navigation interruption must leave exactly one visible photo owner. Covered in Task 4.
5. Hover then click, member retirement and obsolete native requests must retain correct ownership and budgets. Covered in Task 5.

## Task 1: Selection state and logical ranges

**Modify:**

- `apps/web/src/surfaces/Timeline/TimelineBulkEditor/useTimelineSelection.ts`
- `apps/web/src/surfaces/Timeline/TimelineBulkEditor/useTimelineSelection.types.ts`
- `apps/web/src/surfaces/Timeline/TimelineBulkEditor/timelineSelectionReadHelpers.ts`
- `apps/web/src/system/Pile/PileSelection/PileSelection.ts`

**Create:** colocated `timelineRangeSelection.ts` and `timelineRangeSelection.test.ts` under `TimelineBulkEditor`.

**Extend tests:** `apps/web/src/surfaces/Timeline/TimelineSurface/__tests__/TimelineSurface.bulkSelection.test.tsx` and `TimelineSurface.bulkFilteredBursts.test.tsx`.

**Interfaces:** Export `SelectionTarget = { kind: "item"; itemId: string } | { kind: "burst"; burstId: string }` from the selection types. Add `onSelect(target: SelectionTarget, modifiers: { shiftKey: boolean }): void`, `onSelectBurst(burstId: string): void`, and `onDeselectBurst(burstId: string): void` to the controller/context. Keep existing consumers working while migrating. Add `getItemIdsFromTimelineRange({ days, framesByBurstId, start, end }): readonly string[]` with typed TimelineDay/BurstFrameRef inputs; require all traversed membership to be resolved before calling the pure function. Internal anchor and operation epoch are controller-owned.

- [ ] Write failing tests: prior Z survives B-to-E; first Shift-click on selected B keeps it selected; repeated endpoints and reverse ranges; B-to-E then B-to-C never shrinks; plain click discards anchor; selected/unselected plain toggles preserve unrelated ticks.
- [ ] Add tests for collapsed block endpoints, expanded individual endpoints, cross-day order, and a burst with more than one response page. Use data order even if middle rows are not mounted.
- [ ] Add deferred-read tests: rapid Shift endpoints execute in order; plain click/clear/finish/filter/member change invalidates stale publication; failure retains prior ticks; duplicate IDs count once; union of 501 is rejected unchanged, union of 500 succeeds.
- [ ] Run `pnpm --filter @memory-shoebox/web test timelineRangeSelection TimelineSurface.bulkSelection TimelineSurface.bulkFilteredBursts` and confirm the expected behavioral failures.
- [ ] Implement additive set union and epoch-scoped sequential async reads using existing `getBurstFramesForSelection`. Preserve ordinary selection behavior outside these new commands. Cache membership separately from open state; do not use the current global busy guard to drop range events.
- [ ] Rerun the targeted tests, require all passing, then commit the task in the worktree if desired.

## Task 2: One animated paper root and compact controls

**Modify:**

- `apps/web/src/system/PolaroidContainer/PolaroidContainer.tsx` and `.module.css`
- `apps/web/src/system/Pile/Print/Print.tsx`, `Print.types.ts`, `Print.module.css`, `usePrintInteraction.ts`, `usePrintMedia.ts`
- `apps/web/src/system/Pile/BurstStack/BurstPhoto/BurstPhoto.tsx` and `.module.css`
- Direct-child/data-attribute consumers found by searching Print, burst fan, seen-latch and motion selectors.

**Create test:** `apps/web/src/system/Pile/Print/Print.test.tsx`.

**Interfaces:** Add `overlays?: ReactNode` to Print. Use a non-interactive PolaroidContainer root and a sibling main photo button/overlay layer inside it. Pass root geometry separately to navigation staging rather than assuming `event.currentTarget` is the complete paper. Keep main-button identity and aria-pressed accessible. The root carries photo-surface geometry metadata. Passive children and PrintOverlays stay inside the root.

- [ ] Write failing component tests: menu and checkbox are not descendants of the main button; overlay clicks do not navigate/toggle the photo; primary keyboard activation still works; focus-within lifts the entire paper.
- [ ] Run `pnpm --filter @memory-shoebox/web test Print.test` and confirm failures before migration.
- [ ] Move existing transforms, scatter pose, elevation and fan sizing to the shared root. Ensure selection borders, captions, seen marks and overlays share the transform. Migrate BurstPhoto to the overlay slot, removing its independent menu wrapper.
- [ ] Render the options control with a 28px painted square and 18px glyph inside a 48px transparent target; lower trailing corner, 6px visual inset, existing square paper/ink styling. Keep Mantine menu behavior and accessible naming.
- [ ] Audit all selector/ref consumers and adapt only those broken by this shared change. Check transition cloning excludes live controls and focusable descendants.
- [ ] Rerun `pnpm --filter @memory-shoebox/web test Print.test BurstStack TimelineSurface.pile.selection` and `pnpm --filter @memory-shoebox/web type-check`; require success. Real geometry verification belongs to Task 7.

## Task 3: Burst selection controls and interruptible fan motion

**Modify:**

- `apps/web/src/system/Pile/BurstStack/BurstStack.tsx`
- `apps/web/src/system/Pile/BurstStack/BurstCover/BurstCover.tsx` and `.module.css`
- `apps/web/src/system/Pile/BurstStack/BurstFan/BurstFan.tsx`
- `apps/web/src/system/Pile/BurstFanHeader/BurstFanHeader.tsx` and `.module.css`
- `apps/web/src/system/motion/useBurstMotion.ts`, `burstMotionHelpers.ts`, `pileLayoutHelpers.ts`
- `apps/web/src/system/Pile/Print/usePrintInteraction.ts`

**Tests:** Extend `BurstStack.test.tsx`, `TimelineSurface.burstControls.test.tsx`, `TimelineSurface.pile.selection.test.tsx`; create `apps/web/src/system/motion/useBurstMotion.test.tsx` if existing hook coverage cannot house interruption cases.

**Interfaces:** BurstCover receives a selection overlay and a modifier-aware cover callback. BurstFanHeader receives an optional selection action/state beside onCollapse. `useBurstMotion` retains the actual cover origin across opening and closing; cached membership no longer implies open/pinned state. Individual click handlers pass `event.shiftKey` to Task 1.

- [ ] Write failing tests for cover checkbox and header bulk selection; partial/all states; no accidental expansion; plain cover expansion and Shift block selection; collapse in tick mode with selections preserved; pending frame completion after collapse does not reopen it.
- [ ] Add interruption tests: rapid open-close-open, Escape, unmount and reduced-motion/unsupported-animation fallback never leave inert controls or stale state callbacks. Focus returns to the cover's main button.
- [ ] Run `pnpm --filter @memory-shoebox/web test BurstStack TimelineSurface.burstControls TimelineSurface.pile.selection useBurstMotion` and verify expected failures.
- [ ] Implement separate expansion state and membership storage. Render hover/focus/coarse-pointer checkbox and Mantine tooltip; make header selection additive. Fully checked cover checkbox removes that burst only. Keep Collapse usable independently of selection loading.
- [ ] Implement spec timing and bounded stagger with existing Web Animations API. Animate the complete paper roots from Task 2; preserve cover origin and seeded transforms. Clean up interrupted animation state.
- [ ] Rerun the targeted suite and commit the passing task if desired.

## Task 4: Start photo flight before full-image decode

**Modify:**

- `apps/web/src/system/motion/usePhotoArrival.ts`
- `apps/web/src/system/motion/photoTransition/photoTransition.ts`
- `apps/web/src/media/useSelectedPhoto.ts`
- `apps/web/src/surfaces/Item/ItemViewer/PhotoFrame/PhotoFrame.tsx` and its CSS
- Preview/viewport helpers only where required to reserve identical geometry.

**Tests:** `system/motion/photoTransition/photoTransition.test.ts`, `surfaces/Item/ItemViewer/PhotoFrame/__tests__/photoArrival.test.tsx`, and `e2e/media/photo-journey.spec.ts`.

**Interfaces:** Keep `stagePhotoTransition(root, itemId)` and `arrivePhotoTransition(target, itemId)` public signatures, change arrival's contract to valid layout rather than decoded destination. Add `isLayoutReady?: boolean` to usePhotoArrival options without redefining selected-image `isReady`. Journey identity survives preview/detail replacement. Pixels and flight ownership remain distinct.

- [ ] Record the baseline local click-to-layout and layout-to-flight timestamps with display download/decode held. Update the existing tests that intentionally require a decode wait to the new contract.
- [ ] Write failing tests: two-second held display image still starts flight within two rendered frames of valid geometry; at flight completion a thumbnail remains visible; eventual decode upgrades in place without a second flight; decode during flight reveals only one destination after landing.
- [ ] Add preview replacement, rejected source, wrong item, stale cleanup, route interruption, scrolling, resize, Back and reduced-motion cases. Deep links without source geometry render normally.
- [ ] Run `pnpm --filter @memory-shoebox/web test photoTransition photoArrival` and confirm the new tests fail for the readiness gate.
- [ ] Decouple geometry from decode, reserve the same preview/detail frame, and start the existing accurate flight immediately upon usable layout. Preserve source thumbnail through movement and show fallback at landing. Upgrade decoded pixels with 100ms opacity only. Keep existing cancellation and authorization protections.
- [ ] Run the unit command again and `pnpm exec playwright test -c playwright.media.config.ts e2e/media/photo-journey.spec.ts`; require both browser projects passing. Report click-to-layout separately rather than masking route latency with the changed assertion.

## Task 5: Dwelled image intent within existing budgets

**Modify:**

- `app.config.ts`
- `apps/web/src/media/useMediaIntent.ts`
- `apps/web/src/media/mediaPrefetch.types.ts`
- `apps/web/src/media/createMediaPrefetchScheduler/createMediaPrefetchScheduler.ts` and related state types
- `apps/web/src/media/createMediaLoadingResources/createMediaLoadingResources.ts`
- `apps/web/src/system/Pile/Print/usePrintInteraction.ts`
- `apps/web/src/media/createMediaNavigation.ts` only if pile-to-viewer promotion requires adaptation.

**Tests:** Create `apps/web/src/media/useMediaIntent.test.tsx`; extend scheduler ownership/policy tests and `e2e/media/prefetch/__tests__/prefetch.navigation.spec.ts`.

**Interfaces:** Add `APP_CONFIG.media.prefetch.intentDwellMs = 100`. Extend intent handlers with pointer leave/down and blur, plus an enabled input defaulting true. Use a member-scoped current-intent owner shared by hook instances. Scheduler admission distinguishes hover intent from neighbors without adding neighbor dwell to completed intent dwell. Reuse existing typed PrefetchCandidate and promotion interfaces.

- [ ] Fake-timer tests: no media request at 99ms, eligible request at 100ms; leave at 99ms cancels; repeated enter deduplicates; switching items retires the previous pending intent; tick mode makes no viewing-image request; focus/blur and unmount cleanup work.
- [ ] Test existing budget/network protections, selected-source candidate identity, expired leases, rapid hover across many photos, member change, and click before/after dwell. Assert hover-to-click promotion survives speculation cleanup and settles exactly once.
- [ ] Run `pnpm --filter @memory-shoebox/web test useMediaIntent createMediaPrefetchScheduler` and confirm the expected missing image-warming failures.
- [ ] Extend metadata intent to admit the exact display candidate through existing scheduler/native loader. A fresh metadata cache hit must still warm image bytes. Keep one current candidate and shared caps, with proper in-flight settlement. Promote on click before route cleanup.
- [ ] Rerun targeted units and `pnpm exec playwright test -c playwright.media.config.ts e2e/media/prefetch/__tests__/prefetch.navigation.spec.ts e2e/media/prefetch/__tests__/prefetch.nativeImage.spec.ts`. Require passing request identity/ownership and cache-reuse evidence, not a generic promise that all browsers always deduplicate.

## Task 6: Compact upload size labels

**Modify:**

- `apps/web/src/surfaces/Upload/UploadTransfer/UploadProgress.tsx`
- `apps/web/src/surfaces/Upload/UploadDraft/UploadDraftOverview.tsx`
- `docs/web.md` upload surface description.

**Create:** `apps/web/src/surfaces/Upload/uploadSizeLabel/uploadSizeLabel.ts` and `uploadSizeLabel.test.ts`; `apps/web/src/surfaces/Upload/UploadTransfer/UploadProgress.test.tsx`.

**Extend tests:** `apps/web/src/surfaces/Upload/UploadDraft/UploadDraft.test.tsx`.

**Interfaces:** Export `uploadSizeLabel(bytes: number): string` for non-negative finite byte counts from the upload model. This returns user-facing copy, following the project's copy-function naming exception. Both upload summary surfaces use it; progress calculations still consume the unrounded values.

- [ ] Write failing formatter cases: `0 -> "0 B"`, `1023 -> "1,023 B"`, `1024 -> "1 KB"`, `1536 -> "1.5 KB"`, `1024 ** 2 -> "1 MB"`, `Math.round(4.2 * 1024 ** 2) -> "4.2 MB"`, `1024 ** 3 -> "1 GB"`, and `1.5 * 1024 ** 3 -> "1.5 GB"`. Assert `1024 ** 2 - 1 -> "1 MB"` and `1024 ** 3 - 1 -> "1 GB"` for rounding promotion.
- [ ] Add a rendered UploadProgress regression: completed bytes `Math.round(4.2 * 1024 ** 2)` and total `18 * 1024 ** 2` display `4.2 MB of 18 MB confirmed up`, retain file counts, and derive the progress value from exact bytes. Cover a zero total without NaN and a nearly complete transfer without treating the rounded label as completion. Add draft total coverage for KB and GB using the same formatter.
- [ ] Run `pnpm --filter @memory-shoebox/web test uploadSizeLabel UploadProgress UploadDraft` and confirm the expected failures before changing rendering.
- [ ] Implement the unit selection/rounding helper and replace raw byte interpolation in UploadProgress. Reuse it for the draft total, preserving the existing wording, status semantics, and exact numerical accounting.
- [ ] Rerun the targeted tests and require success. Document the display convention in `docs/web.md`; inspect zero, mixed-unit and multi-GB labels at mobile width during Task 7's batched visual pass.

## Task 7: Integrated browser acceptance and current docs

**Create:** `e2e/media/burst-interactions.spec.ts`, using the existing local media fixture and deterministic burst catalog.

**Update:** `docs/motion.md`, `docs/media-loading.md`, `docs/architecture.md` selection description, and affected `DESIGN.md` Print/burst sections. Keep the proposal docs as the record of intended behavior.

- [ ] Add browser acceptance for full-burst selection, filtered membership, reverse and successive Shift ranges with prior ticks, collapse in tick mode, and a multi-page burst.
- [ ] At 1280px and 390px, in tidy/messy layouts, compare overlay and paper geometry before/after hover. Assert all descendants share the transform and menu/checkbox clicks do not activate photos. Check visible target placement, no overlaps, keyboard focus and coarse-pointer discoverability.
- [ ] Combine held-image navigation and hover-then-click cases with reduced-motion and interruption coverage. Use Chromium and WebKit. Run `pnpm exec playwright test -c playwright.media.config.ts e2e/media/burst-interactions.spec.ts e2e/media/photo-journey.spec.ts`.
- [ ] Inspect one batched desktop/mobile visual pass including partial/full selections, open fans, menus, image arrival, and upload size labels. Fix findings together; allow at most one confirmation pass. Run Impeccable's mechanical detector once over changed UI targets after implementation.
- [ ] Update docs to remove selection-pinned collapse and decode-gated-flight claims. Record full-burst/range semantics, overlay composition, dwell and ownership rules.
- [ ] Run `pnpm type-check`, `pnpm lint`, `pnpm build`, and `pnpm test`. Check formatting for changed files with the existing formatter. No success claim without actual output; do not run production services or send email.
- [ ] Review the final diff for scope, selector regressions and all requested outcomes, including abbreviated upload sizes. Record test evidence, material limitations and any files outside the expected list. Stop for user review without pushing or merging.

## Execution recommendation

Native execution is recommended: selection, DOM ownership, flight geometry and prefetch adoption share interfaces, so keeping their context together is useful. After Pablo reviews this plan, implement in dependency order: 1, 2, 3, 4, 5, 6, 7. Task 6 is independent and can be implemented earlier if desired. If Pablo chooses subagent-driven execution, keep the same task boundaries and review each shared interface before the next task consumes it.

## Execution notes

- Selection logic and membership paging are covered by `timelineRangeSelection.test.tsx` and the existing bulk-selection/filter/recovery integration suites. Browser acceptance covers full selection, additive ranges, collapse, phone/desktop controls, and hover-to-click body reuse in Chromium and WebKit. Complex filter and multi-page permutations remain deterministic integration cases instead of duplicated browser fixtures.
- Shared-root and overlay assertions extend `BurstStack.test.tsx`; the existing `PolaroidContainer` already supports a non-interactive root, so it required no changes.
- Virtualized fans need their own motion coordinator because their rows replace `BurstStack` after expansion. Regression tests cover delayed frame arrival and simultaneous collapses. Browsing expansion is preserved on entering tick mode, with filtered membership fetched separately.
- Upload regressions extend `UploadTransfer.test.tsx` and `UploadDraft.test.tsx`; the formatter has boundary and rounding tests.
- Existing prefetch acceptance fixtures assumed ascending photo IDs for forward navigation. They now follow the server's existing descending timeline order, with the 30-step traversal contained in one synthetic day.
- Browser sampling holds selected-image decode for two seconds and asserts movement starts within two rendered frames of the viewer. Hover reuse compares actual transferred image bodies.
- Menu targets sit inside the exposed portion of overlapping prints. The 28px painted face remains inside a 48px target, with a larger trailing inset than originally proposed.
- Impeccable's mechanical scan completed with exit code 0 and no findings. Visual confirmation covered the rendered fan and menu at phone width; functional browser coverage includes both target widths.

## Final verification

All seven tasks are implemented. The fresh reviewer found two Important edge cases: a plain click could cancel independent burst work, and a narrow portrait could place its menu target outside the paper. Both were reproduced by failing tests before correction. Range cancellation now has a separate epoch and releases abandoned queue waits; full-burst and opening commands survive unrelated plain ticks. Narrow fan prints reserve at least 80px of paper, and virtual-row packing uses the same minimum.

| Check                                                     | Result                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Skills, formatting, lint, type checking, production build | Passed                                                                                  |
| Root/shared/email unit suites                             | 299 / 312 / 55 passed                                                                   |
| Web suite after review fixes                              | 2,326 passed across 382 files                                                           |
| Chromium/WebKit acceptance                                | 32 distinct cases passed across the final runs; 16 rerun after review fixes             |
| Early-flight evidence                                     | Full image decode held for two seconds; flight begins within two rendered viewer frames |
| Hover evidence                                            | Actual viewing-image bytes downloaded before click and reused after navigation          |
| Whole repository `pnpm check`                             | Fails in the unchanged server suite: 63 authentication failures, 2,220 passes, 7 skips  |
| Baseline confirmation                                     | Unchanged main reproduces all 7 failing `test/routes/me.test.ts` cases with HTTP 401    |

The server fixture clock is `2026-09-27`; default sessions expire 30 days later, before this run on October 31. Some tests use a live clock and reject those sessions. No server fixtures or production data were changed for this UI task.

## Implementation decisions

These record the executor's rulings in their original order:

1. Preserve filtered burst membership, as approved. With filters active, only matching accessible frames are selected. Cost: “full” follows the visible filtered set.
2. Put new tested helpers in colocated directories. Cost: paths differ slightly from the proposal.
3. Add explicit open-burst state to virtualized timeline consumers. Membership caching alone must not control expansion. Cost: an additional state field shared by both rendering paths.
4. Extend existing component test suites instead of adding duplicate Print/UploadProgress suites. Cost: some tests live under their existing parent component.
5. Inset menu targets by the fan overlap. Cost: controls sit farther from the trailing paper edge.
6. Preserve open browsing bursts when entering tick mode, but fetch filtered membership separately. Cost: one filtered read per open burst.
7. Correct prefetch acceptance fixtures to the existing descending timeline order. Cost: fixture navigation changes, with no product navigation change.
8. Tick loaded photos selects without expanding collapsed bursts. Cost: individual unticking requires opening that burst explicitly.
9. Keep the options icon's existing accessible label without adding an optional tooltip. Added selection tooltips use Mantine. Cost: the options icon has no hover-text hint.
10. Report the unchanged server authentication test failures instead of changing unrelated fixtures. Cost: the aggregate repository check remains red despite passing UI verification.
11. Separate range cancellation from independent burst commands. Cost: additional cancellation bookkeeping, covered by delayed-read regressions.
12. Reserve 80px minimum paper width for very narrow portraits and match row packing. Cost: narrow portraits occupy slightly more horizontal space.

The worktree and execution ledger are preserved for review. No merge, push, pull request, or deployment was performed.
