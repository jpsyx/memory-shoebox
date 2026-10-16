# Media Navigation and Delivery Overhead Implementation Plan

Status at the original M2 handoff: Tasks C1–C5 are implemented and independently reviewed. M2 implementation and local current-source integrated verification are complete; independent M2 and whole-branch reviews were pending at that handoff. Original task requirements below are unchanged; [operating evidence](../../media-loading-performance.md) records conditional decisions and unverified deployment prerequisites.

Update, 15 October 2026: the [Avandar Auto review and fix pass](../../media-loading-code-review.md) is complete, including independent rechecks and targeted regression verification. The original task checklist below is retained as the implementation record; current review results and verification limits are in that report.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce startup requests, long-session work, redundant upload decoding, and repeat static asset transfers.

**Architecture:** One fresh bootstrap response replaces serial authority reads. Bidirectional day cursors support a bounded client page/render window. Upload preparation shares one prioritized decode lane, while static text assets are compressed at build time and cached by content-hashed identity.

**Tech Stack:** Existing Fastify, Kysely, TanStack Query/Router, React/Vite, browser workers, Node zlib; TanStack Virtual for measured render windows.

**Spec:** [Approved design, sections 6 and 9](../specs/2026-10-14-media-loading-design.md).

## Global Constraints

Inherit the [master constraints](2026-10-14-media-loading.md#global-constraints). In particular: one fresh bootstrap per actual navigation, none for speculative route preloads; five retained timeline pages, six eager first-viewport thumbnails, atomic days and unchanged jump boundaries; original transfer concurrency remains separate from decode concurrency. HTML revalidates; hashed assets use one-year immutable caching.

## Review Focus

Master focus 5 belongs here. Test transient reads following committed writes, revoked/demoted sessions, occasion-only days around reverse-page boundaries, upload cancellation while another file owns decoding, and encoding-specific cache validators.

## File Structure

Bootstrap is a focused shared contract/server route/client query. Reverse cursors extend the existing archive implementation, with no client-minted cursors. Window/anchor state lives under `surfaces/Timeline/`; media-loading policy stays in A's provider. Upload coordination lives under `upload/`. Build compression is an isolated Vite plugin; serving remains in `server/src/web/`.

## Task C1: One Current Bootstrap and Router Navigation

**Files:** Create `packages/shared/src/bootstrap.ts`, `bootstrap.test.ts` beside it, `apps/server/src/routes/bootstrapRoutes.ts`, `apps/server/test/routes/bootstrap.test.ts`, `apps/web/src/api/bootstrapHelpers/bootstrapHelpers.ts`, `bootstrap.test.ts` beside it. Modify `packages/shared/src/index.ts`, `apps/server/src/createApp/createApp.ts`, `apps/web/src/routes/__root.tsx`, `-__root.test.ts`; `apps/web/src/surfaces/RemovalRequests/RemovalRequestCard/RemovalRequestPreview/RemovalRequestPreview.tsx`, `RemovalActionDialogs/DeclineRemovalDialog/DeclineRemovalControls.tsx`, `RemovalRequestsSurface/RemovalRequestsSurface.tsx` under that surface. Update `docs/setup.md`, `docs/web.md`, `docs/server.md`.

**Interfaces:** `BootstrapResponse = { setup: SetupStatusResponse; account: MeResponse | null; progress: SetupProgressResponse | null }` with a shared Zod schema. `GET /api/bootstrap` composes existing setup/account/settings/progress readers under the current request viewer; response `Cache-Control: no-store`. `bootstrapQueryOptions` uses key `['bootstrap']`, staleTime 0, no focus/reconnect refetch, and current-authority failure behavior. Root navigation seeds existing account/progress caches from that response. Progress is null for anonymous/nonadmin callers; no user or private progress fields leak to anonymous callers.

- [ ] **Red:** `"actual navigation needs one authority request"`: `expect(requestPaths).toEqual(['/api/bootstrap'])`. `"preload needs no bootstrap"`: `expect(bootstrapCalls).toBe(0)`. Cover fresh setup, initialized anonymous state, revoked session, demotion, incomplete invitation setup, setup completion races, and transient read failure after committed settings/group writes. For internal preview/decline links, `expect(documentNavigationCount).toBe(0)` while modifier-click still yields a normal href.
- [ ] **Verify red:** Run server `test/routes/bootstrap.test.ts` and web `src/routes/-__root.test.ts` plus `src/api/bootstrap/bootstrap.test.ts` with package-scoped Vitest.
- [ ] **Implement:** Reuse existing read functions and redirect decisions, avoiding route-handler HTTP calls to the same server. Fetch fresh bootstrap only for actual navigation, seed account cache, clear A's member preview state on authority loss, and preserve committed-write recovery as a recoverable read state without enabling unauthorized mutations. Keep existing setup endpoints. Replace internal plain anchors with TanStack `Link` or Mantine's Link integration using typed item routes.
- [ ] **Verify green:** Rerun tests and existing setup/account/settings/group recovery browser checks. Assert no duplicate me/setup fetch arises when the destination mounts, and internal links keep navigation filters/history.
- [ ] **Commit:** Commit `perf: consolidate navigation bootstrap requests`.

## Task C2: Bidirectional Atomic-Day Pagination

**Files:** Modify `packages/shared/src/timeline/timeline.ts`, `timeline.test.ts`; `apps/server/src/archive/timelineCursorHelpers/timelineCursorHelpers.ts`, its test; `archive/readTimelinePage.ts`, `readDayStream.ts`, `readItemDays.ts`, `readOverlappingMilestones.ts`, `mergeDaysHelpers.ts`, `routes/timeline.ts` below `apps/server/src`; `apps/web/src/api/timelineHelpers/timelineHelpers.ts`, its test. Create `apps/server/test/routes/timelineReversePaging.test.ts`. Update `docs/archive.md`, `docs/web.md`.

**Interfaces:** Extend `TimelineResponse` with `previousCursor: string | null`, keeping `nextCursor`. Version-2 cursor payload is `{ v: 2; d: string; f: string; direction: 'older' | 'newer' }`; existing unversioned cursors decode as older for compatibility. `TimelinePageState` contains `boundaryDay`, `filterDigest`, and `direction`. Keep `makeTimelineCursorFromPageState(state): string` and `getPageStateFromTimelineCursor(cursor): TimelinePageState | undefined`. Both directions are server-issued, exclusive of boundary day, tied to the same effective normalized filter including `until`, and return days newest-first. Web query options add `getPreviousPageParam` and `maxPages: 5` while retaining the same opaque string page parameter.

- [ ] **Red:** `"reverse traversal restores evicted pages without splitting days"`: traverse eight pages down/back, `expect(restoredIds).toEqual(originalIds)` and no duplicate days. Test a 1,000-item day, occasion-only days, overlap bands, equal-date items, hidden frames, empty/restricted archives, source deletions, legacy cursors, invalid cursor direction/digest, and effective `?at=` bound. Assert `expect(newerThanJumpDays).toEqual([])` and at most five retained client pages.
- [ ] **Verify red:** `pnpm --filter @memory-shoebox/server exec vitest run test/routes/timelineReversePaging.test.ts test/routes/__tests__/timelineContract.paging.test.ts` and web `src/api/timeline/timeline.test.ts`.
- [ ] **Implement:** Query the nearest eligible days in the requested direction, merge occasion-only days under existing selection rules, apply atomic-day budget, then normalize response order. Determine both edge cursors from visible bounded existence queries, never unfiltered totals. Keep global milestone-band ranking. Guard client page fetches while one is in flight; reverse fetching must not race forward fetching or refresh.
- [ ] **Verify green:** Run the targeted tests, existing archive query-plan/visibility/occasion paging tests, and shared timeline tests. Compare query counts at small and large archive sizes and inspect `EXPLAIN QUERY PLAN` for bounded keyset reads.
- [ ] **Commit:** Commit `feat: page timeline days in both directions`.

## Task C3: Bounded Timeline Rendering and Visible Thumbnail Loading

**Files:** Create `apps/web/src/surfaces/Timeline/windowing/useTimelineWindow.ts`, `getTimelineRowsFromDays.ts`, `timelineWindow.types.ts`, `useTimelineWindow.test.tsx`, `getTimelineRowsFromDays.test.ts`, and `e2e/media/timeline.spec.ts`; `apps/web/src/media/useVisibleThumbnail.ts`, its test. Modify `apps/web/src/surfaces/Timeline/DayStream.tsx`, `DayBlock/DayBlock.tsx`, `TimelineSurface/useTimelineData.ts`, `TimelineSurface/useBurstFan/useBurstFan.ts`, `useSeenLatch/useSeenLatch.ts`, `JumpRail/JumpRail.tsx` under Timeline; `apps/web/src/system/Pile/PileItems/PileItems.tsx`, `PlainPrint.tsx`, `BurstStackItem.tsx`, and `apps/web/src/system/system.module.css`. Modify `apps/web/package.json`, `pnpm-lock.yaml` for `@tanstack/react-virtual`. Update `docs/web.md`, `docs/archive.md`.

**Interfaces:** `TimelineAnchor = { capturedOn: string; itemId?: string; offsetPx: number; pageCursor: string | null }`. `TimelineRenderRow = { key: string; day: TimelineDay; itemIds: readonly string[]; kind: 'header' | 'media' }`. `getTimelineRowsFromDays({ days, columns }): TimelineRenderRow[]` takes readonly TimelineDay[] and positive numeric column count derived from the existing CSS grid, preserving occasion/header ordering. `useTimelineWindow({ rows, viewKey, focusedItemId })` returns virtual row positions, measured spacer heights, `saveAnchor(): TimelineAnchor`, and `restoreAnchor(anchor): Promise<void>`; page recovery uses C2's issued cursors through the existing query client. `useVisibleThumbnail({ itemId, source }): { ref: RefCallback<HTMLElement>; loading: 'eager' | 'lazy'; source: MediaSource | null }` registers visibility with A's provider and spends its shared six-thumbnail initial viewport budget.

- [ ] **Red:** `"bounds a long stream while preserving its anchor"`: after 5,000 items assert retained pages <=5, rendered media tiles <=200 in the fixed test viewport, and top visible item offset within 2 CSS px before/after page eviction. `"resizes an expanded burst above the anchor"` preserves focus, selected IDs and offset; include browser Back, jump, reverse-scroll, filter change, and a 1,000-item atomic day. `"overscan is not seen"`: `expect(overscanSeenDelta).toBe(0)`; initial eager thumbs <=6 across multiple days.
- [ ] **Verify red:** Run new web windowing/visibility tests and existing TimelineSurface/JumpRail/seen-latch tests.
- [ ] **Implement:** Install TanStack Virtual in the web package, using measured variable-height rows and ResizeObserver. Keep day metadata atomic while windowing media grid rows inside very large days; header/occasion rows retain their semantics. Preserve existing tile widths, deterministic messy-pile seeds, focus, and uncropped aspect ratios. Overscan one viewport each side, pin the focused row, and store compact anchors rather than evicted pages. Bound anchor cache to 20 views and measurement cache to retained rows. Use measured spacers plus anchor compensation during eviction/resize. Keep content-visibility where it remains compatible with measurement; do not measure skipped content as zero. Fetch one viewport ahead via existing sentinel guards; near-start fetches previous page. Apply viewport thumbnail policy to burst fans, strips, and the remaining media lists migrated in A2.
- [ ] **Verify green:** Run unit tests and this task's `e2e/media/timeline.spec.ts` in Chromium/WebKit at desktop/mobile widths. Verify DOM/memory plateaus, jump boundaries, actual viewport-only seen latches, keyboard focus, and preserved selection. Scope invalidation to current member/view; inactive pages must not be re-signed or refetched wholesale.
- [ ] **Commit:** Commit `perf: bound timeline pages rendering and thumbnail work`.

## Task C4: Thumbnail-Only Upload Previews and Shared Decode Scheduling

**Files:** Create `apps/web/src/upload/createUploadDecodeCoordinator.ts`, `createUploadDecodeCoordinator.test.ts`. Modify `apps/web/src/upload/createUploadPreviewQueue/createUploadPreviewQueue.ts`, `createUploadPreviewQueue.types.ts`; `upload/UploadSessionProvider/useUploadPreviewQueue.ts`, `upload/UploadSessionProvider/useUploadSessionResources.ts`, `upload/UploadSessionProvider/useUploadResources.ts`, `upload/createUploadEngine/uploadPreparationHelpers.ts`, `makeContextFromOptions.ts`, `createUploadEngine.types.ts`; `upload/createUploadSessionController/readPendingUploadPicks.ts`; `upload/mediaWorker/mediaWorkerProtocol.types.ts`, `answerMediaWorkerRequest/answer.ts`; `upload/makeImageDerivativesFromFile/makeImageDerivativesFromFile.ts`, `makeImageDerivativesFromFile.types.ts`, `getDerivativePlanFromSize.ts`; `upload/makeVideoDerivativesFromFile/makeVideoDerivativesFromFile.ts` below `apps/web/src`. Extend their colocated tests; update `docs/web.md`, `docs/media-loading.md`.

**Interfaces:** Add `purposes?: readonly ('thumb' | 'display')[]` to existing image derivative options, default both; video derivative maker accepts an optional purpose selection (`thumb`, `poster`), default both. Protocol carries the requested purpose set. `createUploadDecodeCoordinator()` exposes `run<T>({ priority: 'active' | 'preview'; signal: AbortSignal; work: () => Promise<T> }): Promise<T>` and `dispose(): void`, one active decode. The upload-session owner creates and injects it into duplicate-fingerprint, preview, and transfer paths; no per-component independent coordinator. Hash streaming and network transfer slots remain independent.

- [ ] **Red:** `"preview encodes only a thumbnail"`: `expect(encodedPurposes).toEqual(['thumb'])`. `"three preparation paths share one decoder"`: `expect(maxConcurrentDecodes).toBe(1)` while transfers still reach their existing concurrency. Test active work overtaking queued previews, cancellation while another file owns the decoder, HEIC worker recycling after eight uses, object-URL release, and failure allowing the next job to run. Assert a small-dimension but oversized JPEG no longer bypasses encoding.
- [ ] **Verify red:** Run web `src/upload/createUploadDecodeCoordinator.test.ts` and existing preview queue/image derivative/engine tests.
- [ ] **Implement:** Thread one coordinator from session lifetime through all three paths. Preview requests only thumb, while actual transfer requests its required derivatives. Keep existing preview cache and pinned entries, release abandoned worker/image references, and preserve recovery/hash identity. Use A2's dimensional/byte limits for browser JPEG skip decisions. Verify Blob MIME instead of assuming requested encoder format. Do not add a second 960 encoding to browser transfer preparation; B's queue produces responsive upgrades asynchronously.
- [ ] **Verify green:** Rerun unit tests and `pnpm exec playwright test --project=upload-chrome --project=upload-webkit`; existing project dependencies build/start only local fake-email/fake-bucket servers. Exercise large mixed HEIC/video batches, cancellation/retry, completed thumbnails, and recovery. Compare preview CPU/encoding counts using the same M1 fixture batch.
- [ ] **Commit:** Commit `perf: avoid redundant upload preview decoding`.

## Task C5: Immutable Hashed Assets and Precompressed Static Text

**Files:** Create `apps/web/build/precompressStaticAssets.ts`, `apps/web/src/testing/precompressStaticAssets.test.ts`; modify `apps/web/vite.config.ts`. Modify `apps/server/src/web/registerStaticSpa.ts`; create `apps/server/test/web/staticSpa.test.ts`. Update `docs/server.md`, `docs/deployment.md`.

**Interfaces:** `precompressStaticAssets(): Plugin` uses Vite's build output hook and Node `brotliCompress`/`gzip` to emit `.br`/`.gz` for HTML, JS, CSS, JSON and SVG when smaller, skipping already-compressed/media assets. `registerStaticSpa` retains its current interface and uses fastify-static's precompressed serving with explicit cache headers: hashed Vite assets `public, max-age=31536000, immutable`; HTML `no-cache`; nonhashed public assets revalidate. Encoding responses vary on Accept-Encoding and have representation-correct ETags/types/lengths.

- [ ] **Red:** `"negotiates compressed hashed assets and revalidates HTML"`: assert gzip/Brotli decode to original, `expect(asset.cacheControl).toBe('public, max-age=31536000, immutable')`, HTML revalidation, and 304 bodies empty. Test encoding-specific validators, identity fallback, unsupported encodings/q=0, missing files, unknown `/api/*` JSON 404, SPA deep-link fallback, and absence of media recompression.
- [ ] **Verify red:** Run the build-plugin test with `pnpm --filter @memory-shoebox/web exec vitest run src/testing/precompressStaticAssets.test.ts` and `pnpm --filter @memory-shoebox/server exec vitest run test/web/staticSpa.test.ts`.
- [ ] **Implement:** Use Node's built-in compression, no runtime API/media compressor. Emit compressed artifacts only after normal output generation. Do not mark arbitrary assets immutable merely because their name contains a hyphen; identify Vite's content-hashed output naming. Ensure HTML fallback and directly requested HTML receive the same freshness policy. Preserve upload-proof exclusion and worker build behavior.
- [ ] **Verify green:** Rerun tests, `pnpm build`, then static integration tests against the real built output. Inspect requests with `Accept-Encoding: br`, `gzip`, and `identity`, including If-None-Match for each variant. Run the existing build harness-exclusion tests.
- [ ] **Commit:** Commit `perf: cache and precompress built web assets`.

## Library References

- [TanStack Query infinite queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) covers bounded bidirectional page retention and fetch coordination.
- [TanStack Virtual API](https://tanstack.com/virtual/latest/docs/api/virtualizer) covers measured windowing; browser tests still own anchor/focus acceptance.
- [fastify-static options](https://github.com/fastify/fastify-static) covers precompressed serving and cache-header hooks; test the installed version's validator behavior.
