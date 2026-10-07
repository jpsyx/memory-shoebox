# Video conversations implementation plan

**Goal:** Integrate the approved sidebar and Video.js with persisted timed reactions.
**Spec:** ../specs/2026-10-07-video-conversations-design.md
**Architecture:** Shared Zod contracts, visibility-gated Fastify routes backed by
SQLite, and a video-only React viewer. Existing photo behavior is preserved.
**Execution:** Contract first; independent server/client work with separate write
boundaries; integration, browser verification and fresh code review afterward.

## Global constraints

Video.js React 10.0.1; existing media storage, authorization and notification
boundaries; CSS Modules; no pushes/merges. New migration only, preserve existing
rows. TypeScript and server imports follow repository conventions.

## Tasks

- [x] Shared contract: add videoReactions.ts, export schemas and types; extend
      comment request/response with parentCommentId. Red/green Zod validation tests.
- [x] Server: migration/types/manifests, GET/PUT/DELETE video-reaction routes,
      top-level reply validation, read/write mapping. Route tests must prove repeated
      ID retry, duplicate members at different moments, hidden/missing equivalence,
      photo/invalid timestamp rejection, ownership and parent deletion behavior.
- [x] Web: new video-only viewer using Video.js, real comment sidebar and existing
      item sheets. Query and mutation hooks for the reaction collection, retry/remove
      behavior. Comments auto-pin once, preserve failed drafts, support whole-video
      comments and replies. Red/green component tests and real browser fixtures.
- [x] Integration: update documentation, run format/lint/types/build/tests, inspect
      desktop/mobile captures, run an independent whole-change review and fix findings.

## Review focus

1. Item switches with queued mutations must never write to the new item.
2. Failed reaction retries reuse the original ID/time; no success marker on failure.
3. Reply parents from another item or another reply are rejected.
4. Whole-video comments stay unpinned when focus returns after toggling the chip.
5. Media errors, short/unknown durations, dense markers and reduced motion remain
   usable; original photo viewer, metadata and permissions still function.

## Ledger

- User approval: prototype approved; proceed to production now.
- Execution ruling: establish shared contracts, then split server and web into
  independent write boundaries under dispatching-parallel-agents. Root owns shared
  schemas, docs and final integration. This avoids concurrent edits to interfaces.

- Shared contract: 290 tests pass; schema validation and legacy comment fixtures updated.
- Server: migration, persistence, visibility, permission and reply tests pass. An
  independent review found no correctness issue; its normalized retry regression
  and test-placement suggestions are addressed.
- Browser integration: saved comments/replies/reactions survive reload, and the
  phone layout accepts whole-video comments. Regression tests reproduced expired
  media URL retry and fullscreen marker-menu defects before their fixes.

## Final verification

- `pnpm check`: passes formatting, lint, types, build and all 3,764 tests.
- `pnpm exec playwright test -c playwright.video.config.ts`: 12/12 pass,
  covering the same six production scenarios in Chromium and WebKit.
- Final desktop (1440px) and phone (390px) captures inspected: no horizontal
  overflow. On the phone, grouped markers have separate hit areas; a 13-event
  menu scrolls to its last entry, which remains visible and receives pointer hits.
- Independent server/shared and client reviews completed. All reported findings
  fixed and re-reviewed, including source refresh, permission recovery, fullscreen
  containment and exact marker spacing at timeline edges.
- Verification captures: `.impeccable/review/video-conversations/desktop.png` and
  `mobile.png` (local review artifacts, not application assets).
- Juan Pablo authorized a local merge to `main` and cleanup of the feature
  branch and worktree after verification. No push or deployment was requested.
  The local review server uses an isolated illustrative catalog.
