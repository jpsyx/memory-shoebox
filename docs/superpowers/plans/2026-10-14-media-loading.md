# Media Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved media-performance improvements and prove reduced transferred bytes and navigation delays without changing access or view tracking.

**Architecture:** Retain the Router SPA and direct private B2 delivery. Stabilize signed media identity and introduce safe preview reads before adding bounded client speculation. A durable, isolated processing worker produces immutable photo/video derivatives; independent navigation and build changes remove other loading costs.

**Tech Stack:** Node >=22.18, TypeScript, Fastify 5, SQLite/Kysely, AWS S3 SDK, React/Mantine, TanStack Router/Query, Vite, Vitest, Playwright, FFmpeg/libheif.

**Spec:** [Approved design](../specs/2026-10-14-media-loading-design.md).

Status at the original M2 handoff: M1 and Tasks A1–A6, B1–B5 and C1–C5 are implemented and independently reviewed. M2 implementation and local current-source integrated verification are complete on `feat/media-loading`; independent M2 and whole-branch reviews were pending at that handoff. The historical pre-product baseline is `1ec228b0`, with 4,359 passing tests. See [operating evidence and limits](../../media-loading-performance.md) for measured outcomes and unverified deployment prerequisites.

Update, 15 October 2026: the [Avandar Auto review and fix pass](../../media-loading-code-review.md) is complete, including independent rechecks and targeted regression verification. The original task checklist below is retained as the implementation record; current review results and verification limits are in that report.

## Global Constraints

These constraints apply to this index and all three linked plans. Read the spec and this index before implementing a linked task.

- Keep the TanStack Router SPA, one Fastify deployment, private B2 storage, original-quality archives, current visibility rules, and accurate open/seen records.
- Media downloads continue directly from B2. Background derivative processing is a new, explicit exception to the server's metadata-only path.
- No deployment, push, merge, or production backfill is part of implementing and verifying the code locally.
- Keep the one-hour viewing signature lifetime; a bounded 10,000-entry LRU, a 60-second renewal margin, and private seven-day HTTP freshness for immutable media bytes.
- Batch preview reads accept at most eight IDs. Speculation cannot increment opens, latch seen state, or enqueue mail. Preserve existing actual-detail failure-retry semantics.
- After the current photo loads and 250 ms dwell, warm two photos in the direction of travel and one behind. Allow at most two speculative network operations, including at most one optimized-video metadata operation.
- Speculative budgets are 8 MiB encoded and 32 MiB decoded; decode only the immediate photo neighbor. Save-Data/2G disables speculation; 3G allows the immediate photo and video posters only.
- Bound active timeline metadata to five pages and eager first-viewport thumbnails to six. Keep atomic days and the effective `until` boundary of jumps.
- Retain the 480px thumbnail and 2048px maximum display, and add a 960px display candidate. JPEG budgets: 128 KiB, 512 KiB, and 1.5 MiB respectively. Do not upscale.
- Processing: one job across photo/video/fingerprint decoding; probe 15 seconds, 16 MiB input, 1 MiB metadata; photo 64 MiB compressed, 24 megapixels, primary still, 60 seconds; video at most 3840x2160 or 2160x3840, 60 fps, 10-bit input, 30 minutes.
- Video output: H.264/AAC, YUV420p, 1280x720 or 720x1280 maximum, 30 fps maximum, approximately two-second keyframes, 3 Mbit/s video ceiling, 128 kbit/s audio ceiling, fast-start MP4, supported HDR tone-mapped to SDR.
- Processing budgets: 512 MiB output, 1 GiB scratch, additional 512 MiB free-space reserve, OS-enforced 256 MiB job memory, at least 128 MiB serving headroom, validated under a 512 MiB deployment target. Disable automatic processing with a diagnostic when these prerequisites fail.
- Meter video upstream bytes, including rereads/retries: `min(2 * sourceBytes + 16 MiB, 16 GiB + 16 MiB)`; 1,024 upstream requests, two concurrent reads, 15-second read idle timeout.
- No production email, catalog, or real bucket writes during tests. Local servers explicitly use `NODE_ENV=development` and `ENABLE_FAKE_EMAIL=true`.
- Red/green TDD for behavior. Server/shared relative imports include `.ts`; web imports omit it. Public interfaces get docstrings; names follow the repository rules. Update product docs with each task.
- No Start migration, CDN, HLS, persistent offline cache, production machine changes, or speculative full-original video downloads. Measurement-dependent choices are recorded explicitly, not treated as completed features.

## Review Focus

Five easily missed conditions are assigned to tests below and in the linked tasks:

1. A preview response arriving after sign-out/member change must never repopulate the next member's media cache (A3, A4).
2. Viewport/DPR changes while a photo decodes must not show an obsolete candidate or the previous item (A5).
3. Signature expiry during a shared in-flight request must not mint a falsely extended lease or let speculative cancellation abort foreground use (A1, A4, A6).
4. A worker dying after multipart initiation, or continuing after lease reclamation, must leave reclaimable ownership and cannot publish (B1, B2, B5).
5. Resizing or expanding a burst above a virtualized scroll anchor must preserve position, focus, selected IDs, and the jump boundary (C2, C3).

## File Structure and Execution Order

| Plan                                                                | Owned units and deliverable                                                                  | Depends on                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| M1 below                                                            | Cache/range-capable local bucket and real-browser measurement harness                        | Baseline                                                    |
| [A: Delivery and viewer](2026-10-14-media-delivery.md)              | `server/src/media`, shared media contracts, `web/src/media`, viewer and media consumers      | M1; execute A1 through A6 in order                          |
| [B: Derivative processing](2026-10-14-media-processing.md)          | `server/src/mediaProcessing`, append-only migration, background lifecycle, runtime codecs    | A2; execute B1 through B5 in order                          |
| [C: Navigation and delivery overhead](2026-10-14-media-overhead.md) | Bootstrap, bidirectional timeline/windowing, upload decode scheduling, static build delivery | C1/C5 independent; C2 after A2, C3 after C2/A6, C4 after A2 |
| M2 below                                                            | Whole-branch tests, browser comparisons, operating documentation                             | A, B, C complete                                            |

Default linear order: **M1, A1-A6, B1-B5, C1-C5, M2**. Independent tasks may run in parallel only with exclusive file ownership. Shared `createApp.ts`, `app.config.ts`, schemas, lockfiles, and docs edits are integrated serially. Each task is one reviewed, working commit, not a partially compiling contract change.

An executor may add focused helper/test files beside the named unit when required to keep functions small. This does not permit unrelated refactors. Mechanical DTO fixture changes are included in A2 and must be enumerated in its completion report.

## Task M1: Local HTTP Cache and Range Evidence

**Files:** Modify `e2e/support/createFakeS3Server/createFakeS3Server.ts`, `createFakeS3Server.types.ts`, `fakeS3ObjectHandlersHelpers.ts`, and `fakeS3MultipartHandlersHelpers.ts` in that directory. Create `e2e/support/createFakeS3Server/mediaDelivery.test.ts`, `e2e/support/createMediaAcceptanceCatalog.ts`, `e2e/media/media.fixtures.ts`, `e2e/media/cache.spec.ts`, `e2e/media/mediaMeasurementHelpers.ts`, `playwright.media.config.ts`. Update `docs/e2e.md`.

**Interfaces:** Extend the fake bucket factory with injected clock and configurable signature-date/expiry enforcement; preserve its current upload behavior. `createMediaAcceptanceCatalog(): Promise<{ origin: string; database: Kysely<Database>; memberId: string; itemIds: readonly string[]; getTransfers(): readonly { objectId: string; status: number; bodyBytes: number }[]; close(): Promise<void> }>` owns an ephemeral catalog and bucket, uses the real signer, and exposes sanitized transfer records. Define it in the new support file, using existing acceptance catalog/session seeding helpers. `measureMediaNavigation(page: Page): Promise<{ firstImageMs: number; navigationMs: readonly number[]; videoStartupMs: number; longTasksMs: readonly number[]; maxMediaNodes: number }>` lives in `measurements.ts`.

- [x] **Red:** Add `"serves validators and ranges without excess bytes"`: `expect(range.status).toBe(206)`, `expect(range.body.byteLength).toBe(1024)`, `expect(invalid.status).toBe(416)`, `expect(conditional.status).toBe(304)`, `expect(conditional.body.byteLength).toBe(0)`. Also test suffix/open ranges, HEAD, If-Range, expiry, response-cache overrides, and multipart list/abort isolation.
- [x] **Verify red:** `pnpm exec vitest run e2e/support/createFakeS3Server/mediaDelivery.test.ts`; expect assertion failures against current full-200 behavior, not missing test discovery.
- [x] **Implement:** Add actual ETags, `Accept-Ranges`, conditional/range semantics and body-byte counting. Use separate app and bucket origins to reflect B2. Create Chromium/WebKit projects, one worker, per-test catalogs, no browser routing/interception, fake email, and no real keys. Firefox is an explicit optional project when installed. At this stage the browser harness records reload bytes without asserting the product improvement; A1 adds the zero-byte regression before fixing it. Ordinary reload and hard reload are separate measurements.
- [x] **Verify green/harness baseline:** Run the Vitest command, then `pnpm build` and `pnpm exec playwright test -c playwright.media.config.ts`. Record current byte/latency results in ignored `tmp/media-loading/baseline.json`; require successful harness assertions and retain the measured redundant transfers as the baseline. Include 30 repeated neighbor transitions, small/large photos, burst boundaries, a video, 5,000 timeline items, and a 1,000-item day. Local loopback throttling belongs in the bucket, not a browser route. Preserve raw results for M2.
- [x] **Commit:** Stage only the named harness/docs files; commit `test: measure media cache and range transfers`.

## Task M2: Integrated Acceptance and Operating Evidence

**Files:** Extend `e2e/media/cache.spec.ts`, `prefetch.spec.ts`, `renewal.spec.ts`, `timeline.spec.ts`, and `processing.spec.ts` in that directory (created by M1/A5/A6/C3/B5). Create `docs/media-loading-performance.md`; finish `docs/media-loading.md`, `docs/architecture.md`, `docs/configuration.md`, `docs/deployment.md`, `docs/e2e.md`.

**Interfaces:** Consume M1's fixture/measurement API, A's media contract, B's job runtime, and C's window/bootstrap behavior. Produce a reproducible report with fixture identity, environment, raw-result paths, p50/p95, body bytes, API/signing counts, and worker memory. No runtime analytics service or personal event logging is added.

- [x] **Red:** Add whole-flow regressions before correcting any integration gaps: `expect(prefetchedSelectionBodyBytes).toBe(0)`, `expect(speculativeOriginalVideoBytes).toBe(0)`, `expect(openDelta).toBe(actualSelections)`, `expect(maxRetainedPages).toBeLessThanOrEqual(5)`, `expect(overscanSeenDelta).toBe(0)`. Test expired playback renewal, visibility revocation after warming, metadata-only video loading, source replacement, offline return, and all internal entry points.
- [x] **Verify failures:** Run `pnpm exec playwright test -c playwright.media.config.ts`; classify genuine integration failures separately from intentionally disabled experimental behavior. Fix only within the owning tasks' boundaries, with a local failing regression first.
- [x] **Measure:** Reuse M1's fixtures/throttling and 30-transition samples. Compare cold/warm first image, p50/p95 next-photo readiness, video startup/rebuffering, consumed/wasted prefetch bytes, maximum DOM/long tasks, signing CPU, and processing peak memory. Target zero redundant reload bodies within a reusable lease and zero new bytes for consumed prefetched photos; report required authorization/metadata traffic separately. Keep first-segment video prefetch disabled unless a separate native-player reuse experiment passes in Chromium and WebKit within budget. Enable metadata prefetch only for browser/profile combinations that pass the byte-budget check.
- [ ] **Verify:** `pnpm check`, `pnpm exec playwright test -c playwright.media.config.ts`, `pnpm test:e2e:video`, `pnpm test:e2e:admin`, and the upload browser suites selected by C4. Run the full ordinary E2E suite once after those targeted checks. Require successful exits; document any unavailable engine/container as unverified. Review branch-wide spec compliance and code after tests; correct material findings and rerun affected checks.
- [x] **Document and commit:** Record outcomes, limitations, disabled resource prerequisites, browser-cache eviction/signature-renewal limits, and manual actual-iPhone/B2 Range checks. Document optional `FLY_MIN_MACHINES_RUNNING=1` and a cold-start comparison without changing deployment settings. Evaluate Start only for a remaining cold-deep-link discovery waterfall, CDN only for measured geography/renewal misses, and HLS only for remaining video startup/rebuffering problems. Commit `docs: record media loading performance evidence` with the acceptance tests. Do not claim production timings from local measurements.

At the original M2 handoff, local verification was complete: `pnpm check` passed 5,025 tests, current media
76/76, video40/40, built static28/28 and full ordinary370 cases with one existing
fixme skipped. Earlier full admin118/118 and upload89/89 evidence remains recorded
with its source provenance. At that handoff, the Verify checkbox and whole-branch review checklist
were still open for independent reviews and resulting corrections. The dated
review update above records the subsequent Auto review. Requirements and resource limits above are unchanged.

## Coverage and Completion Checklist

| Approved spec                                                             | Tasks                        |
| ------------------------------------------------------------------------- | ---------------------------- |
| 1: Stable identity, exact expiry, bounded signing, immutable cache policy | A1, A2, B5, M1/M2            |
| 2: Explicit sources, all consumers, economical fallbacks/placeholders     | A2, A5, B4                   |
| 3: Safe preview/neighbor reads and preserved actual-open semantics        | A3, A5, A6                   |
| 4: Bounded direction/intent prefetch and image presentation               | A4, A5, M2                   |
| 5: Visible-source renewal and video state preservation                    | A6                           |
| 6: Bootstrap, links, eager budget, reverse pagination and windowing       | C1, C2, C3, A6               |
| 7: Responsive candidates, JPEG budgets, measured WebP, repair queue       | A2, A5, B1, B4, B5, C4       |
| 8: Migrations, fenced queue, metered processing, codecs, durable cleanup  | B1-B5                        |
| 9: Upload-only thumbs, decode coordination, static cache/compression      | C4, C5                       |
| 10: Real cache/range measurements, complete checks, manual limits         | M1, M2 and each task's tests |

- [x] All A/B/C tasks implemented and their targeted tests passed.
- [x] Metadata authorization, original preservation, and existing view semantics verified.
- [ ] Whole-branch review findings addressed, complete checks passed, measurements saved.
- [x] Conditional decisions have measured outcomes or explicit unsupported prerequisites.
- [x] Work remains on the reviewed worktree branch; no publication action is implied.

## Execution Handoff

Recommend **subagent-driven execution**: fresh implementer and reviewer per task, followed by a whole-branch review. The 18 tasks cross authorization, HTTP caching, durable object ownership, and browser state, so independent checks at each boundary are valuable. Native execution remains available: Codex implements all tasks, followed by one fresh whole-branch reviewer.

The writing-plans skill requires review of these linked plans and selection of an execution method before product code begins.
