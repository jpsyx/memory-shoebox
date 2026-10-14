# Upload progress and recovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Recognizable upload progress and one-click recovery after interruption or refresh.

**Architecture:** Existing controller and retry API remain authoritative. The UI adds local/server thumbnails and batch retry; an injectable IndexedDB store retains only unfinished originals across page reloads.

**Tech Stack:** React, Mantine, TypeScript, native IndexedDB, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-10-14-upload-resume-design.md

## Global Constraints

- No server/API contract changes; never resend done/refused/cancelled/duplicate rows.
- Preserve File bytes, name, type and lastModified across refresh.
- Scope retained files by member, session and file id; prune after seven days.
- Storage errors must not block upload; no signed URLs in persistent storage.
- Use existing tokens and uncropped thumbnails; keep controls usable at 320px.
- No real emails, no push, merge or publication without applicable authorization.

## Review Focus

- Interrupted read/write followed by controller teardown must not publish stale state.
- Quota failures must retain whatever cache was saved and still allow current-tab upload.
- A fresh manifest may already mark an attempted file done: Resume must skip it.
- Restored failures from a settled batch must reuse retry semantics and not send another email.
- Preview preparation must actually continue during an active upload.

### Task 1: Visual progress and recovery actions

**Files:** Modify apps/web/src/surfaces/Upload/UploadTransfer/**, UploadSurface/UploadFilePicker/**, and upload/UploadSessionProvider/useUploadResources.ts. Add focused tests beside new components or in existing UploadRecovery/UploadSending integration tests. Do not edit controller modules or docs/web.md (owned by Task 2).

**Interfaces:** Consume UploadSnapshot.filesById, file.media, existing UploadPreviewQueue and UploadSessionController.retryMissingFiles(fileIds). Later Task 2 adds optional UploadSnapshot.recoveryStorageWarning; Task 1 need not render it yet.

- [ ] Write tests asserting ready local thumbnails are visible beside status; completed media renders after reload; active upload still allows previews; batch resume targets only retained waiting/sending/failed ids; incomplete local files expose file selection; busy and ambiguous states disable resume.
- [ ] Run focused Vitest tests and observe intended failures.
- [ ] Implement bounded thumbnail/status rows, prominent Resume upload/Retry upload action, truthful missing counts, and clear fallback selection wording. Ensure no retry controls on refused/duplicate files, all existing call sites retain functionality, and file rows stay responsive. Render server media through existing authorized media primitives. Enable the bounded preview queue during transfer, preserving cleanup and lazy viewport requests.
- [ ] Run focused tests; report exact commands, changed files, design decisions and remaining concerns. Commit only task files.

### Task 2: Durable originals and controller integration

**Files:** Add apps/web/src/upload/createUploadOriginalStore/** and apps/web/src/upload/createUploadSessionController/uploadOriginalRecoveryHelpers/**. Modify controller dependency/types, transfer start/completion/read/reset paths and recovery UI warning. Update docs/web.md and docs/architecture.md.

**Interfaces:** Store saveFiles({memberId,sessionId,filesById}), readFiles({memberId,sessionId}), removeFiles({memberId,sessionId,fileIds}), clearSession({memberId,sessionId}), each async, injectable as originalStore. readFiles returns Map<string,File>. Default native IndexedDB store; fake store injection for controller tests. Add optional recoveryStorageWarning to snapshot.

- [ ] Add failing controller tests for save-before-engine, recreation restore, done cleanup/failed retention, fresh manifest filtering, storage failure, stale generation and member/session isolation. Add store behavior tests using real IndexedDB in browser or a faithful test adapter, including seven-day pruning and File metadata/bytes.
- [ ] Implement store and wire helpers into transfer/read/cleanup boundaries. Save serially in per-file transactions, so a later quota failure preserves earlier files. Store File/Blob plus metadata and reconstruct File on reads. Await persistence before starting the engine; guard every async publication by generation. Cleanup must never turn a confirmed upload into a failure.
- [ ] Restore only fresh authorized manifest ids eligible for retry, without replacing retained in-memory files or triggering automatic upload. Publish a warning on save/read failure. Delete completed/excluded cache entries; keep originals across ordinary destroy and remove them on explicit reset/discard.
- [ ] Run focused tests, browser reload proof and update docs to replace the former memory-only guarantee. Document cache lifetime, quota fallback, missing-original handling and retry behavior.

### Task 3: Integrated verification and review

- [ ] Review Task 1 and Task 2 against the spec; fix substantive findings.
- [ ] Run browser checks for progress thumbnails, mobile layout and real reload/resume.
- [ ] Run pnpm check and git diff --check; review the whole change independently.
- [ ] Commit verified changes in the worktree and report the result and any remaining integration action.
