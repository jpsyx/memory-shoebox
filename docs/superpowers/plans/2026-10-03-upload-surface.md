# Upload Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver surface 8 so a parent can upload a whole occasion, apply bulk edits, and recover interruptions without losing the plan or sending another notification after settlement.

**Architecture:** One upload controller lives above the signed-in route outlet and delegates transfer work to step 6a's existing engine. Surface components observe immutable snapshots and invoke explicit actions; the server owns the persisted plan and settlement. A bounded preview queue reuses existing derivative helpers.

**Tech Stack:** TypeScript, React 19, Mantine 9, TanStack Query and Router, Zod, Vite, Vitest/Testing Library, Playwright, and the existing media worker/upload engine. No new dependencies.

**Spec:** [Approved step design](../specs/2026-10-03-upload-surface-design.md). Read it together with [step 7b](../../prds/2026-09-27-memory-shoebox/plan/step-7b.md), the upload contract and repository rules before execution.

## Global Constraints

- Implement surface 8 only. No changes to `apps/server`, generated skill directories, product specs or other surfaces' behavior. Never edit `*.gen.*` by hand.
- Work in the existing `feat/upload-surface` worktree through `using-wt`; do not push, merge, create a PR or publish.
- No product import from `prototypes/`, no new upload transport or derivative implementation, and no video transcoding.
- Every accepted manifest file goes up regardless of selection. Ticks target edits; they never select files for upload.
- Use `UPLOAD_LIMITS`: manifest chunks 500, detail default 100/cap 500, pending reference cap 100, and edit target cap 1,000. Use `appConfig.upload` for transfer concurrency, worker recycling and derivative limits.
- Capture days come from server `capturedOn` in `shoebox.timezone`. A date amendment sends `${date}T00:00:00.000Z` and lets the server preserve the original clock.
- Everyone is pre-filled. Only/Except with zero subjects cannot commit. Save a changed valid rule before `commit` with `intent: "arm"`.
- No GET per completion or progress polling. Record every successful complete response, including failure completions, through the engine's injected API delegate.
- A recovered file with `isIncludedInEmail: false` appears silently. Never assert email delivery from outbox fan-out fields.
- Preserve this exact sending copy: "Keep this tab open while they go up. If you close it, what arrived and everything you added stay saved."
- React components use existing system components, intrinsic image proportions, CSS Modules, tokens and real interactive elements. No em dashes, `any`, barrel files or exported conversion names starting with `resolve`, `build`, `compute` or `create`.
- Keep exported interfaces documented, functions at most 45 lines, one component per file, co-named implementation/test files in their own directory, and type-only modules named `.types.ts`.
- Use red/green TDD for behavior. Docs and styling need direct verification, not tautological tests. Each task receives spec and quality review before the next task.
- Contract mocks do not prove missing milestone/member/group routes work. Keep dependency-bound and manual acceptance checks explicitly outstanding until actually performed.

## Review Focus

1. A delayed first operation resolves after Upload more or member replacement: it must not replace the new batch or expose the previous member's files (Tasks 2 and 8).
2. Local storage is blocked or contains invalid/stale data: uploading and URL-addressed recovery still work, and hints never replay edits (Tasks 1 and 4).
3. An action succeeded but its response was lost: refreshing the server plan must reveal it without automatically applying it a second time; inline milestone attachment retries must retain the created id (Tasks 6 and 7).
4. Several people share a display name: no picker may silently attach the wrong id, and chunking a new-person action must not invent duplicate people (Task 6).
5. The network disappears after bytes arrive but before complete answers: the surface must distinguish unconfirmed files from refused files and never claim notification or settlement without evidence (Tasks 3, 4 and 9).

## Task boundaries and shared interfaces

Tasks run in order. Each implementer reads the spec, this section and their task.
Use direct imports; the paths below do not imply barrel modules.

| Boundary              | Owner                           | Interface                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete session read | Task 1                          | `getWholeUploadSession(options: Readonly<GetWholeUploadSessionOptions>): Promise<UploadSessionDetail>` follows cursors, merges files by id/position, and returns `nextCursor: null`                                                                                                                |
| Shared view model     | Task 1                          | `UploadSnapshot`, `UploadFileActivity`, `UploadEditTargets`, `UploadRecoveryMatches` in `uploadSessionController.types.ts`; use shared DTOs rather than copies                                                                                                                                     |
| Controller            | Task 2, extended by Tasks 3/4/6 | `createUploadSessionController(options: Readonly<CreateUploadSessionControllerOptions>): UploadSessionController`; constructor with injectable upload API, header reader, engine, hash worker and storage; defaults use existing modules                                                           |
| Subscription          | Task 2                          | `getSnapshot(): UploadSnapshot`; `subscribe(listener: () => void): () => void`; publish a new stable snapshot only when state changes                                                                                                                                                              |
| Fresh draft           | Task 2                          | `loadSession(sessionId?: string): Promise<void>`; `pickFiles(files: readonly File[]): Promise<void>`; `toggleFile(fileId: string): void`; `selectDay(capturedOn: string): void`; `selectAll(): void`; `clearSelection(): void`; `cancelDraft(): Promise<void>`; `reset(): void`; `destroy(): void` |
| Transfer              | Task 3                          | `startUpload(visibility: Readonly<SetUploadVisibilityRequest>): Promise<void>`; `closeBatch(): Promise<void>`; both await their complete operation, including the engine run where applicable                                                                                                      |
| Recovery              | Task 4                          | `pickFiles` also resumes; `retryMissingFiles(fileIds: readonly string[]): Promise<void>` uses retained handles; `confirmRecoveryMatch(options: Readonly<{ fileId: string; clientRef: string }>): Promise<void>` settles an ambiguous association before transfer                                   |
| Draft edits           | Task 6                          | `applyEdits(labels: readonly UploadDraftLabel[]): Promise<void>`; `undoEdit(editId: string): Promise<void>`; `amendDates(choices: readonly UploadDateChoice[]): Promise<void>`                                                                                                                     |
| Preview queue         | Task 5                          | `createUploadPreviewQueue(options: Readonly<CreateUploadPreviewQueueOptions>): UploadPreviewQueue` with `getPreview(fileId)`, `subscribe(listener)`, `requestPreview(input)`, `release(fileId)`, `setPaused(isPaused)`, `destroy()`                                                                |
| React owner           | Task 8                          | `UploadSessionProvider({ viewer, children }: Readonly<Props>): ReactNode`; `useUploadSessionController(): UploadSessionController`; `useUploadSnapshot(controller: UploadSessionController): UploadSnapshot`                                                                                       |
| Surface entry         | Task 8                          | `UploadSurface({ sessionId }: Readonly<Props>): ReactNode`, reading viewer/settings and the controller from the signed-in context/provider                                                                                                                                                         |

`UploadSnapshot` carries `phase`, optional complete `detail`, local `filesById`,
`selectedFileIds`, `fileActivityById`, `editTargets`, declaration/checking
counts, `recoveryMatches`, `isBusy`, `isRunning`, and an optional structured
operation error. Phase is `idle | loading | declaring | draft | checking |
resume | sending | partial | done | unavailable`. Modal choice and form inputs
remain component state. `UploadFileActivity` distinguishes preparing,
transferring, confirmed completion, duplicate skip and unconfirmed local
failure; byte counts are browser-only. Include an operation generation in
internal state, not in the HTTP contract.

`UploadDraftLabel` is the upload edit request without `targetFileIds`.
`UploadDateChoice` is `{ fileId: string; capturedOn: string }`.
`UploadRecoveryMatches` contains known matches, ambiguous candidates with
client refs, already-up/refused picks and unmatched extras. Never serialize
`File` objects, blobs or signed URLs to local storage.

The controller type grows with the tasks that implement its actions; do not
create inert production stubs for later tasks. The route remains unchanged
until Task 8. Actions record their error in the snapshot and reject so a
mutation caller can retain the current form on failure.

---

### Task 1: Whole-session reads, progress reduction and recovery hints

**Files:**

- Create: `apps/web/src/api/uploadsHelpers/getWholeUploadSession/getWholeUploadSession.ts` and `.test.ts`.
- Create: `apps/web/src/api/uploadsHelpers/getWholeUploadSession/getWholeUploadSession.types.ts`.
- Create: `apps/web/src/upload/uploadSessionController/uploadSessionController.types.ts`.
- Create: `apps/web/src/upload/uploadSessionController/uploadSnapshotHelpers/uploadSnapshotHelpers.ts` and `.test.ts`.
- Create: `apps/web/src/upload/uploadSessionController/uploadRecoveryStorage/uploadRecoveryStorage.ts` and `.test.ts`.
- Create: `apps/web/src/upload/uploadSessionController/__tests__/uploadSurfaceFixtures.ts`.
- Update: `docs/web.md` with the forthcoming controller/read boundary and limits.

**Interfaces:** Consumes `GetUploadSessionOptions`, `getUploadSession`, shared
DTOs and `makeUploadSessionDetail`. Produces the first two shared boundaries
above, `makeUploadSnapshotFromCompletion({ snapshot, response })`,
`getDayFilesFromSnapshot({ snapshot, capturedOn })`, and storage helpers
`readUploadRecoveryHint({ storage, memberId })`,
`writeUploadRecoveryHint({ storage, memberId, hint })`,
`clearUploadRecoveryHint({ storage, memberId })`. Storage is an injectable
`Pick<Storage, "getItem" | "setItem" | "removeItem">`; exceptions are contained.
`GetWholeUploadSessionOptions` carries the existing read options, readonly
`states`, and optional `read: typeof getUploadSession`. Default to the existing
helper; controller calls pass their injected `api.getUploadSession`, so tests
and real operations share the same dependency boundary.

- [x] **Write failing tests** with a 264-row fixture whose first page has 100 rows, whose second overlaps one id, and whose last page completes the set. Assert paging and stable deduplication, including when `states` filters are provided:

  ```ts
  expect(detail.files).toHaveLength(264);
  expect(new Set(detail.files.map((file) => file.fileId)).size).toBe(264);
  expect(detail.nextCursor).toBeNull();
  expect(
    api.getUploadSession.mock.calls.map(([options]) => options.cursor),
  ).toEqual([undefined, "page-two", "page-three"]);
  expect(
    api.getUploadSession.mock.calls.every(
      ([options]) => options.states?.join(",") === "failed,refused",
    ),
  ).toBe(true);
  ```

  Add named cases `late completion cannot regress confirmed progress`,
  `a fresh retry baseline accepts fewer terminal files`, `a failed file response
updates aggregate progress`, and `hints survive blocked or corrupt storage`.
  Their assertions are respectively:

  ```ts
  expect(reduced.detail?.progress).toMatchObject({
    doneCount: 262,
    doneBytes: 262000,
  });
  expect(reduced.detail?.state).toBe("settled");
  expect(retryBaseline.detail?.progress.waitingCount).toBe(1);
  expect(failedResult.detail?.progress.failedCount).toBe(1);
  expect(
    readUploadRecoveryHint({ storage: brokenStorage, memberId }),
  ).toBeUndefined();
  expect(() =>
    writeUploadRecoveryHint({ storage: brokenStorage, memberId, hint }),
  ).not.toThrow();
  expect(otherMemberHint).toBeUndefined();
  ```

- [x] **Run RED:** `pnpm --filter @memory-shoebox/web test src/api/uploadsHelpers/getWholeUploadSession src/upload/uploadSessionController/uploadSnapshotHelpers src/upload/uploadSessionController/uploadRecoveryStorage`. Confirm missing implementations, rather than malformed fixture failures.
- [x] **Implement** cursor recursion or sequential promise reduction using `limit: UPLOAD_LIMITS.detailPageMax`, detecting a repeated cursor and rejecting instead of looping. Select aggregate snapshots by terminal count within a run; retain each completion's own file row even when its aggregate is older. Store versioned hints under a member-specific key, validating ids/target counts against live edits before restoring markers. Do not let a failed later page replace an already displayed session with incomplete data.
- [x] **Run GREEN** with the same command and `pnpm --filter @memory-shoebox/web type-check`. All focused cases pass.
- [x] **Commit** only this task's files: `feat: add upload session state helpers`.

### Task 2: Fresh-draft declaration and selection controller

**Files:**

- Create: `apps/web/src/upload/uploadSessionController/uploadSessionController.ts`.
- Create: `apps/web/src/upload/uploadSessionController/uploadDeclarationHelpers.ts`.
- Create: `apps/web/src/upload/uploadSessionController/uploadSelectionHelpers.ts`.
- Create: `apps/web/src/upload/uploadSessionController/__tests__/uploadControllerTestHelpers.ts`.
- Create: `apps/web/src/upload/uploadSessionController/__tests__/uploadController.draft.test.ts`.
- Modify: the Task 1 types and fixtures, and `docs/web.md`'s controller description.

**Interfaces:** Consumes Task 1 reads/snapshots/storage and existing
`getManifestEntryFromFile`/upload helpers. Produces the controller's fresh-draft
and subscription methods. `CreateUploadSessionControllerOptions` contains
`memberId`, `api`, `getManifestEntryFromFile`, `createUploadEngine`,
`createMediaWorker`, and `storage`; injected members default to their real
implementations. The test harness returns `{ controller, api, engine,
pickedFiles, emitEvent, answerCompletion }` with deferred API/engine answers.

- [x] **Write failing cases** `opening the surface does not create a draft`,
      `a 1,001-file pick declares 500/500/1`, `outcomes pair by clientRef`,
      `a failed later declaration preserves earlier files`, `ticks never filter
the manifest`, `open conflict finds the existing session`, `reset ignores
late answers`, and `cancel touches only a draft`. Use these assertions:

  ```ts
  await controller.loadSession();
  expect(api.openUploadSession).not.toHaveBeenCalled();
  expect(
    api.putUploadManifest.mock.calls.map(([options]) => options.files.length),
  ).toEqual([500, 500, 1]);
  expect(snapshot.filesById.get(secondOutcome.fileId)).toBe(secondPickedFile);
  expect(snapshot.detail?.files).toHaveLength(500);
  expect(snapshot.error?.operation).toBe("declare");
  expect(snapshot.selectedFileIds.size).toBe(212);
  expect(api.putUploadManifest).not.toHaveBeenCalled(); // after selection alone
  expect(api.getCurrentUploadSession).toHaveBeenCalled(); // after open conflict
  expect(controller.getSnapshot().detail).toBeUndefined(); // old read resolved after reset
  expect(api.cancelUploadSession).toHaveBeenCalledWith(draft.sessionId);
  expect(api.commitUploadSession).not.toHaveBeenCalled();
  ```

- [x] **Run RED:** `pnpm --filter @memory-shoebox/web test src/upload/uploadSessionController/__tests__/uploadController.draft.test.ts`.
- [x] **Implement** the factory/subscription, draft loading and explicit declaration action. Header reads use at most two simultaneous reads; manifest writes are sequential. Keep pending undeclared picks/client refs when a chunk fails so retry continues without creating a second draft. `fileId` deduplicates transfer handles. Read all rows after declaration; group with server `capturedOn`. Only waiting draft files can be ticked. Selection actions operate on all loaded rows, not just rendered previews. Serialize API mutations and reject conflicting actions while busy. Operation generations invalidate late reads on reset/destroy. `destroy` releases local work and never sends cancellation to the server.
- [x] **Run GREEN** with the focused command and web type-check. Add a test that destroying the controller calls neither DELETE nor commit.
- [x] **Commit:** `feat: coordinate upload draft declaration`.

### Task 3: Transfer lifecycle, visibility ordering and honest progress

**Files:**

- Create: `apps/web/src/upload/uploadSessionController/uploadTransferHelpers.ts`.
- Create: `apps/web/src/upload/uploadSessionController/__tests__/uploadController.transfer.test.ts`.
- Create: `apps/web/src/upload/uploadSessionController/__tests__/uploadController.visibility.test.ts`.
- Modify: controller, types, snapshot helpers and their fixtures.
- Update: `docs/web.md` with in-app navigation, progress and tab-close semantics.

**Interfaces:** Produces `startUpload` and `closeBatch`. The engine is the
existing `createUploadEngine`; its injected complete delegate always calls
`completeUploadFile`, records the unchanged response and returns it. Never
replace existing engine event or transport types.

- [x] **Write failing cases** `264 completions need one final refresh`,
      `failure completions move the bar`, `settled event carrying uploading does
not claim success`, `failed complete with no server answer remains
unconfirmed`, `duplicate is not a casualty`, `two start clicks arm once`, `missing restored originals block arm`,
      `everyone skips its write`, `restriction saves before arm`, `empty Only and
Except block arm`, `all refused files cannot arm`, and `close cancels the
local engine and commits close`:

  ```ts
  expect(api.completeUploadFile).toHaveBeenCalledTimes(264);
  expect(api.getUploadSession).toHaveBeenCalledTimes(1); // baseline reset after draft setup
  expect(snapshot.detail?.progress.failedCount).toBe(1);
  expect(snapshot.phase).not.toBe("done"); // run event reports uploading
  expect(snapshot.fileActivityById.get(fileId)?.kind).toBe("unconfirmed");
  expect(snapshot.detail?.notifiedAt).toBeNull();
  expect(snapshot.fileActivityById.get(duplicateId)?.kind).toBe("duplicate");
  expect(api.commitUploadSession).toHaveBeenCalledTimes(1);
  expect(api.setUploadVisibility).not.toHaveBeenCalled(); // Everyone unchanged
  expect(callOrder).toEqual(["visibility", "arm", "engine"]);
  expect(api.commitUploadSession).not.toHaveBeenCalled(); // invalid restriction
  expect(api.commitUploadSession).toHaveBeenCalledWith({
    sessionId,
    intent: "close",
  });
  expect(engine.cancel).toHaveBeenCalledOnce();
  ```

- [x] **Run RED:** `pnpm --filter @memory-shoebox/web test src/upload/uploadSessionController/__tests__/uploadController.transfer.test.ts src/upload/uploadSessionController/__tests__/uploadController.visibility.test.ts`.
- [x] **Implement** visibility validation with the shared request schema, canonical comparison to the saved rule, then arm and a distinct accepted pending queue. Reject a batch with no accepted files or missing accepted original handles before arm; expose a recoverable re-pick error for the latter. Await `engine.start` for the end of a run; `settled` is only an event name. Coalesce byte-event publication using one animation-frame callback and flush terminal events immediately. Fold failed completions through the delegate, reject stale generation events, and refresh once at run end. A duplicate may trigger the engine's existing exceptional read; do not add a read per duplicate/completion. Keep server progress and local wire bytes separately. After a failed final refresh preserve known facts and expose retry/recovery, not an invented done summary. Cancel local work before close and retain already-landed media.
- [x] **Run GREEN** with focused tests and web type-check. Include both response orders for the final two completions.
- [x] **Commit:** `feat: present upload transfer state accurately`.

### Task 4: Resume, settled retry and recovery persistence

**Files:**

- Create: `apps/web/src/upload/uploadSessionController/uploadRecoveryHelpers/uploadRecoveryHelpers.ts` and `.test.ts`.
- Create: `apps/web/src/upload/uploadSessionController/uploadRecoveryHelpers/uploadRecoveryHelpers.types.ts` and `uploadRecoveryActions/uploadRecoveryActions.ts` plus `uploadRecoveryChecking.ts` for orchestration and worker lifetime.
- Create: `apps/web/src/upload/uploadSessionController/__tests__/uploadController.resume.test.ts` and focused `uploadController.reassociation.test.ts` if needed to keep suites below 400 lines.
- Modify: controller, types, storage and declaration helpers; narrowly adjust the existing `uploadController.draft.test.ts` busy-declaration fixture and reuse `uploadControllerTestHelpers.ts` for recovery fixtures.
- Update: `docs/web.md` with addressed settled recovery and hash matching.

**Interfaces:** Produces recovery controller actions and
`getResumeMatchesFromFiles(options: Readonly<ResumeMatchOptions>): Promise<UploadRecoveryMatches>`.
`ResumeMatchOptions` contains picked `{ clientRef, file }` entries, complete
server rows, an existing worker-backed `hashFile(file: Blob): Promise<string>`
and `signal: AbortSignal`. Match exact hashes first; metadata fallback is
limited to unique hashless candidates. Never infer identity from a name alone.

- [x] **Write failing cases** `restored draft re-picks preserve file ids and edits before arm`, `all 264 re-picked sends only 64 missing`,
      `more than 100 missing rows are listed`, `settled recovery never patches
manifest`, `settlement racing retry suppresses email copy`, `hashless
ambiguity waits for confirmation`, `extra files do not poison resume`,
      `refused picks are never retried`, `current batch wins over remembered
settled batch`, and `storage failure still allows addressed recovery`:

  ```ts
  expect(engine.start.mock.calls[0][0]).toHaveLength(64);
  expect(sentIds.some((id) => landedIds.has(id))).toBe(false);
  expect(api.createUploadEdit).not.toHaveBeenCalled();
  expect(api.setUploadVisibility).not.toHaveBeenCalled();
  expect(snapshot.recoveryMatches.ambiguous).toHaveLength(1);
  expect(engine.start).not.toHaveBeenCalled(); // association has not been chosen
  expect(api.putUploadManifest).not.toHaveBeenCalled(); // settled batch
  expect(snapshot.fileActivityById.get(recoveredId)?.isIncludedInEmail).toBe(
    false,
  );
  expect(api.retryUploadFile).not.toHaveBeenCalledWith({
    sessionId,
    fileId: refusedId,
  });
  expect(declaredRefs).not.toContain(extraClientRef);
  expect(snapshot.detail?.sessionId).toBe(currentSessionId);
  ```

- [x] **Run RED:** `pnpm --filter @memory-shoebox/web test src/upload/uploadSessionController/uploadRecoveryHelpers src/upload/uploadSessionController/__tests__/uploadController.resume.test.ts`.
- [x] **Implement** serial worker hashing with checking counts and cancellation. For restored drafts with missing handles, match re-picks against existing rows first, address known ids without capturedAt to preserve corrected days, and keep ambiguous associations explicit; do not create duplicate manifest rows or replay edits. Remain draft after checking and require the normal explicit start action. New unmatched picks may be declared only while the session is still draft. On uploading sessions, preclassify against the complete manifest, re-declare matched picks with hashes, retry matched failed rows, and transfer waiting/sending rows only. For a settled session skip declaration, retry existing failed ids, and use each retry response's email flag. Retain failed rows' identities while retrying. Switch to settled recovery after a manifest conflict and a fresh read proves the sweep won. Resolve ambiguous client refs through an explicit choice before invoking retry/engine. A duplicate pick may match the same hash but enters the queue once. Finish with the original plan intact. Remember addressed sessions under the member's hint; clear on Upload more/cancel. Never treat corrupt hints as permission to write.
- [x] **Run GREEN** with focused tests and web type-check. Cover same filename/size with different hashes, and a failed hash read that leaves the batch recoverable.
- [x] **Commit:** `feat: recover interrupted upload sessions`.

### Task 5: Bounded previews and capture-day prints

**Files:**

- Create: `apps/web/src/upload/uploadPreviewHelpers/uploadPreviewHelpers.ts`, `.types.ts` and `.test.ts`.
- Create: `apps/web/src/surfaces/Upload/UploadDayGroup/UploadDayGroup.tsx` and `.test.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadDayGroup/UploadPrint.tsx`.
- Create: `apps/web/src/surfaces/Upload/upload.module.css`.
- Update: `docs/web.md` with preview ownership and decode fallback.

**Interfaces:** Preview inputs contain file id, `File`, declared content type
and optional post-orientation dimensions. `getPreview(fileId)` returns a
thumbnail URL and dimensions or a preparing/unavailable state. Queue methods
are defined in the shared interface table. `UploadDayGroup({ day, snapshot,
controller, previews }: Readonly<Props>): ReactNode` calls `selectDay` and
`toggleFile`; no API write occurs when ticking. `UploadPrint` takes one file
row, its activity/preview and explicit selection callback.

- [x] **Write failing cases** `only one preview decode is active`, `a preview
decode refusal still allows selection`, `release revokes its URL`, `a
released in-flight decode cannot leak a late URL`, `HEIC recycling follows
config`, `transfer pauses preview work`, and `tick day includes unrendered
rows`:

  ```ts
  expect(maximumActiveDecodes).toBe(1);
  expect(worker.makeImageDerivativesFromFile).toHaveBeenCalledOnce();
  expect(queue.getPreview(fileId)?.kind).toBe("unavailable");
  expect(revokeObjectUrl).toHaveBeenCalledWith(previewUrl);
  expect(worker.terminate).toHaveBeenCalled();
  expect(api.completeUploadFile).not.toHaveBeenCalled(); // preview failure is not upload failure
  expect(controller.getSnapshot().selectedFileIds.size).toBe(212);
  expect(screen.getByRole("button", { name: /IMG_4702/ })).toBeEnabled();
  ```

- [x] **Run RED:** `pnpm --filter @memory-shoebox/web test src/upload/uploadPreviewHelpers src/surfaces/Upload/UploadDayGroup`.
- [x] **Implement** one lazily created image worker through `makeMediaWorkerClientFromPort`, reusing `makeImageDerivativesFromFile` and existing video poster generation. Dispose display blobs and keep only thumbnails; recycle using `appConfig.upload.heicWorkerRecycleCount` and error handling. IntersectionObserver requests visible/near-visible prints and releases offscreen previews, while a filename fallback preserves an undecodable file's intrinsic placeholder and accessible selection button. A resolved helper with an empty derivative list is an unavailable preview, not an upload failure. Pair image sizing and seeded tilt with the existing Print component where its props permit; do not cast pre-ingest rows to `MediaRef`. Reuse existing upload day/file list styles without copying prototype imports. Markers come from known edit targets, not current selection.
- [x] **Run GREEN** with focused tests and web type-check. Ensure paused/aborted video preparation cannot delay teardown indefinitely by using the existing helper's timeout behavior.
- [x] **Commit:** `feat: preview upload files by capture day`.

### Task 6: Draft editing, bulk tags/people and undated files

**Files:**

- Create: `apps/web/src/upload/uploadSessionController/uploadEditHelpers.ts`.
- Create: `apps/web/src/upload/uploadSessionController/__tests__/uploadController.edits.test.ts`.
- Create: `apps/web/src/surfaces/Upload/UploadDraft/UploadDraft.tsx` and `.test.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadDraft/UploadSelectionBar.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadDraft/UploadEdits.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadDraft/UploadUndated.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadLabelModal/UploadLabelModal.tsx` and `.test.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadLabelModal/useUploadLabelForm.ts` and `UploadPersonChoice.tsx` for form bookkeeping and explicit person identity.
- Modify: controller/types, preview CSS and shared test fixtures.
- Update: `docs/web.md` with persisted edits and the optional date-correction affordance.

**Interfaces:** Produces the draft-edit controller methods. `UploadDraft({
snapshot, controller, previews, visibility, onVisibilityChange, onStart,
onOpenMilestone }: Readonly<Props>): ReactNode` is a composition of the draft
pieces; `visibility` is a valid or unfinished local form choice, independent
of the saved rule. `UploadLabelModal({ kind, opened, controller, snapshot,
onClose }: Readonly<Props>): ReactNode` supports tag/person only.

- [x] **Write failing controller/UI cases** `bulk applies to the captured
selection`, `unticking leaves applied markers`, `Undo updates after success`,
      `a later label failure keeps earlier success and typed input`, `lost edit
response refreshes the plan without automatic replay`, `new tag chunks
1,001 targets but a new person does not`, `duplicate person names require a
choice`, and `undated correction sends a calendar date without shifting it`:

  ```ts
  expect(api.createUploadEdit).toHaveBeenCalledWith({
    sessionId,
    body: {
      kind: "tag",
      targetFileIds: selectedIds,
      labelSnapshot: "hospital",
    },
  });
  expect(snapshot.editTargets.get(editId)).toEqual(selectedIds);
  expect(snapshot.selectedFileIds.size).toBe(0);
  expect(snapshot.detail?.edits).toContainEqual(savedEdit);
  expect(screen.getByText("sleeping")).toBeVisible(); // failed label remains selected in the modal
  expect(newPersonCalls).toHaveLength(0); // selection exceeds 1,000
  expect(api.putUploadManifest.mock.calls[0][0].files[0]).toMatchObject({
    fileId,
    capturedAt: "2026-09-15T00:00:00.000Z",
  });
  ```

- [x] **Run RED:** `pnpm --filter @memory-shoebox/web test src/upload/uploadSessionController/__tests__/uploadController.edits.test.ts src/surfaces/Upload/UploadDraft src/surfaces/Upload/UploadLabelModal`.
- [x] **Implement** sequential `createUploadEdit` calls with the captured eligible targets, shared request validation, known-id/new-label conversion and visible partial success. Prevent repeat-submit while pending; after an uncertain lost write, read the saved edits and keep the modal for explicit review rather than blindly repeating it. Store target hints only after obtaining the actual edit id, restore only those corroborated by live edits, and persist successful Undo removal. For repeated person names, add an explicit id-valued disambiguation choice inside this modal; do not change the global PeopleField contract or select the first person silently. Undo honors `canUndo`. Amend dates from known DTO rows without reading files again and refresh grouping/mismatches. Keep tagging/date correction optional and the commit count independent of ticks.
- [x] **Run GREEN** with focused tests and web type-check. Check picker failures keep typed names and allow creation of a new label without pretending a fetched directory is empty.
- [x] **Commit:** `feat: edit upload batches in bulk`.

### Task 7: Inline milestones and pre-ingest reconciliation

**Files:**

- Create: `apps/web/src/api/milestones/milestones.ts`, `milestoneSchemas.constants.ts` and `milestones.test.ts`.
- Create: `apps/web/src/surfaces/Upload/UploadMilestoneModal/UploadMilestoneModal.tsx` and `.test.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadMilestoneModal/UploadMilestoneForm.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadMilestoneFix/UploadMilestoneFix.tsx` and `.test.tsx`.
- Modify: draft composition, upload CSS and fixtures.
- Update: `docs/web.md` with the step 7a dependency and the distinct manifest-date writer.

**Interfaces:** Consume Task 6 edit/date actions. Produce
`milestonesQueryOptions(): ReturnType<typeof queryOptions<MilestoneListResponse, Error, MilestoneListResponse, string[]>>`,
`createMilestone(body: Readonly<CreateMilestoneBody>): Promise<MilestoneDetailResponse>`
and `updateMilestone(options: Readonly<{ milestoneId: string; body: UpdateMilestoneBody }>): Promise<MilestoneDetailResponse>`.
The local Zod schemas compose shared `milestoneRefSchema` and validate the
`MilestoneSummary`/`MilestoneDetail` shape from `apis/milestones.md`; list
reads follow its cursor. The modal takes `opened`, `snapshot`, `controller`
and `onClose`. The fix component takes one mismatch group, snapshot/controller
and `onDismiss`; it never calls post-ingest item reconciliation.

- [ ] **Write failing API tests** for list paging, `POST /api/milestones` and
      encoded PATCH paths, malformed responses and preserved `ApiRequestError`.
      Write UI cases `span prefilled from selected capture days`, `one day sends
equal endpoints`, `attach retries never create a second milestone`, `span
move requires each file's chosen day`, `widen touches no manifest`, and
      `leave retains attachment and original days`:

  ```ts
  expect(postedBody).toMatchObject({
    startsOn: "2026-09-15",
    endsOn: "2026-09-17",
  });
  expect(postedBody).not.toHaveProperty("itemIds");
  expect(singleDayBody.endsOn).toBe(singleDayBody.startsOn);
  expect(createMilestone).toHaveBeenCalledTimes(1);
  expect(api.createUploadEdit).toHaveBeenLastCalledWith({
    sessionId,
    body: {
      kind: "milestone",
      milestoneId: createdId,
      targetFileIds: selectedIds,
    },
  });
  expect(screen.getByRole("button", { name: "Move the 4" })).toBeDisabled();
  expect(updateMilestone).toHaveBeenCalledWith({
    milestoneId,
    body: {
      startsOn: "2026-09-15",
      endsOn: "2026-09-17",
    },
  });
  expect(api.putUploadManifest).not.toHaveBeenCalled(); // widening or leaving
  ```

- [ ] **Run RED:** `pnpm --filter @memory-shoebox/web test src/api/milestones src/surfaces/Upload/UploadMilestoneModal src/surfaces/Upload/UploadMilestoneFix`.
- [ ] **Implement** local schemas only if step 7a's shared contracts are still absent; inspect their exports before introducing duplicates. Use queryOptions and `apiFetch`; no configurable API origin. Keep a successfully created id through an attachment failure and disable another Create action for that attempt. If creation's response is lost, explain the uncertainty and reload the list before another explicit Create; there is no idempotency key in that route's contract. Prefill dates from the selection and allow deliberate overrides. Set name/blurb limits from the actual step 7a schema when available, otherwise its documented request (120/280), noting the temporary client contract. For span moves use unselected native day inputs; for one day use the single date. Patch a widened span, refresh upload detail and invalidate inactive timeline/milestone queries without changing another surface's behavior. Show a truthful unavailable/retry state when routes are absent.
- [ ] **Run GREEN** with focused tests and web type-check. Read server route availability without editing another worktree. Keep missing-route live checks pending.
- [ ] **Commit:** `feat: assign upload milestones inline`.

### Task 8: Complete surface states, shell lifetime and routing

**Files:**

- Create: `apps/web/src/upload/UploadSessionProvider/UploadSessionProvider.tsx`, `.test.tsx` and `useUploadSessionController.ts`.
- Create: `apps/web/src/upload/UploadSessionProvider/useUploadSnapshot.ts`.
- Create: `apps/web/src/surfaces/Upload/UploadSurface/UploadSurface.tsx` and `.test.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadSurface/UploadSelect.tsx`, `UploadLoading.tsx`, `UploadUnavailable.tsx` and `UploadFilePicker.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadVisibility/UploadVisibility.tsx` and `.test.tsx`.
- Create: `apps/web/src/surfaces/Upload/UploadTransfer/UploadTransfer.tsx`, `UploadFileRow.tsx`, `UploadPartial.tsx`, `UploadResume.tsx`, `UploadDone.tsx` and `UploadRecoveryChoices.tsx`.
- Create: `apps/web/src/surfaces/Upload/uploadCopyHelpers/uploadCopyHelpers.ts` and `.test.ts`.
- Modify: `apps/web/src/routes/_app.tsx`, `apps/web/src/routes/_app/upload.tsx`, `apps/web/src/routes/rendering.test.tsx`, `apps/web/src/routes/search.test.ts`, upload CSS.
- Update: `docs/web.md` with surface 8 and its full lifetime/copy decisions.

**Interfaces:** Produces the React provider/surface entries in the shared
table. Provider exposes the headless controller plus one preview queue;
`useUploadSnapshot` uses `useSyncExternalStore`. Picker/drop callbacks pass
`readonly File[]` to `pickFiles`. Transfer components consume the snapshot and
controller, never invoke engine helpers independently. `UploadVisibility`
consumes a local mode/subjects choice, the saved rule, viewer and change
callback; it reuses existing member/group clients and normalization helpers.
Export `useUploadPreviewQueue(): UploadPreviewQueue` alongside the controller
hook in `useUploadSessionController.ts`, so the surface can pass the same queue
to its day groups without creating another one.

- [ ] **Write failing cases** `StrictMode never arms or starts twice`,
      `navigating to the pile leaves the active engine running`, `member
replacement destroys the old controller`, `file picker includes a refused
PDF in declaration`, `only one top bar is rendered`, `viewer has no upload
action`, `invalid session search is rejected`, `saved visibility survives
directory failure`, `expired authentication retains the addressed batch
through sign-in`, and `settled recovery has no second-email promise`:

  ```ts
  expect(engine.start).toHaveBeenCalledTimes(1);
  expect(engine.cancel).not.toHaveBeenCalled(); // route navigation inside the same member's shell
  expect(engine.cancel).toHaveBeenCalledOnce(); // provider really destroyed
  expect(
    api.putUploadManifest.mock.calls[0][0].files.map(
      (file) => file.originalFilename,
    ),
  ).toContain("not-media.pdf");
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Put .* up/ })).toBeNull(); // viewer
  expect(signInSearch.redirect).toBe(`/upload?session=${sessionId}`);
  expect(controller.getSnapshot().detail?.sessionId).toBe(sessionId); // after sign-in and reload
  expect(
    screen.getByText(
      "This photograph will appear on its day without another email.",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/You can close this\. They keep going/)).toBeNull();
  ```

  Add copy cases covering unsupported type, empty/oversized files,
  connection loss, abandonment, checksum/content mismatch, storage rejection
  and storage outage. Assert distinct text and absence of Retry for refusals.

- [ ] **Run RED:** `pnpm --filter @memory-shoebox/web test src/upload/UploadSessionProvider src/surfaces/Upload/UploadSurface src/surfaces/Upload/UploadVisibility src/surfaces/Upload/uploadCopyHelpers src/routes`.
- [ ] **Implement** a provider keyed to `viewer.memberId`, keeping controller/preview identities stable. React's StrictMode effect probe must not permanently destroy the same controller instance that the remount reuses: use a cancellable deferred teardown, while real member replacement/unmount releases it. Effects may idempotently load sessions but never start transfer. Set `hasOwnBar` and parse `session` with shared `idSchema`; update the URL with replace navigation once a session exists. Read `viewer/settings` from signed-in context and offer no upload query/actions to a viewer. Update route smoke stubs with `/current: 204` and the new lede `Put it all up.`.
- [ ] **Compose every state**: initial selection, day grouping, selection bar, tag/person and after states, milestone creation/assignment/fix, Everyone visibility, sending, partial, resume, refusal and done. Local forms use mutation callbacks to retain text on failure. Direct valid submission saves restrictions before arm; unfinished Only/Except has explanatory text and blocks submit. Lazy directory queries offer the viewer/saved subjects on failure with an unavailable notice. Done uses server summary and queued-notification wording; settled retry copy uses the retry flag. Resume pages the whole missing set, shows the persisted edits/visibility, offers one ambiguous-file choice when needed and reports extras without transferring them. Send what did arrive is available only for uploading sessions; draft Cancel is separate. A running engine pauses the preview queue. Announce state changes through a restrained live region and restore focus after modals and state transitions.
- [ ] **Run GREEN** with focused tests, web type-check and `pnpm build` to regenerate the route tree through Vite if required. Run a browser smoke check for actual route navigation before committing.
- [ ] **Commit:** `feat: deliver the upload surface`.

### Task 9: Browser proof, responsive comparison and final verification

**Files:**

- Create: `e2e/upload-surface/upload.surface.spec.ts`, `upload.recovery.spec.ts`, `upload.keyboard.spec.ts`, `upload.responsive.spec.ts`, `upload.contract.spec.ts` and `uploadSurfaceTestHelpers.ts`.
- Create: `e2e/support/makeUploadSurfaceFixtures/makeUploadSurfaceFixtures.ts` and `.test.ts` only for nontrivial fixture-byte transformations.
- Modify: `playwright.config.ts`, `docs/e2e.md`, `docs/web.md`, `docs/prds/2026-09-27-memory-shoebox/plan/step-7b.md`, the plan README and this plan's checkboxes.

**Interfaces:** Reuse `getUploaderStorageStateFromBrowserName`,
`closeOpenUploadSession`, existing fixture paths, catalog readers and fake-S3
request readers. Produce `makeUploadSurfaceFixturePaths({ directory,
count }): string[]` for test-only mixed media with distinct hashes, and
`pickFilesInUploadSurface({ page, paths }): Promise<void>` using the actual
`/upload` native input. Do not drive `upload-proof.html` or introduce a product
global test harness for these tests.

- [ ] **Write browser cases** that extend the earlier unit/component coverage. Any newly uncovered failure is the RED evidence before its fix; cases already passing need no artificial failure. Add the new directory to `upload-chrome`/`upload-webkit` testMatch and to the general chromium project's testIgnore, preserving the existing setup dependency and one catalog worker. Use a fresh uploader context per case and close any open batch in fixture teardown. Run `pnpm exec playwright test --project=upload-chrome --grep 'surface 8'`; inspect every failure before changing implementation.
- [ ] **Verify the real API/engine with the S3 stand-in**: a 264-file unique mixed batch spanning capture days, bulk tag/person edits through UI, untouched Everyone and no curation, deliberate refusal, all accepted files present on their days and one outbox row per eligible recipient. Generate distinct valid media bytes at runtime under `testInfo.outputPath`; copied identical bytes would test deduplication instead of a large batch. Existing EXIF/QuickTime header fixtures must retain their correct capture dates after the uniqueness padding.

  ```ts
  await expect(page.getByRole("heading", { name: /264.*up/ })).toBeVisible();
  expect(
    (await readUploadedFiles(sessionId)).filter(
      (file) => file.state === "done",
    ),
  ).toHaveLength(264);
  await expectOneEmailPerRecipient(sessionId);
  expect(sessionGetRequestsWhileCompleting).toHaveLength(1);
  ```

- [ ] **Verify recovery**: hold a completion with Playwright routing after earlier files landed, close the actual tab, open `/upload`, check preserved edit rows/visibility and the complete missing list, re-pick the folder and assert the fake-S3 log contains no PUT for landed ids. In another case abort PUT/completion requests, allow remaining files to complete, and assert partial distinguishes failure from refusal. Restore the network and recover a settled failed row; read outbox rows before/after and assert their count is unchanged. Keep all timers/retries at product behavior unless a dependency-injected unit case proves the long offline ceiling; do not falsify a browser result by waiting a fixed sleep.
- [ ] **Keep contract tests identifiable**: `upload.contract.spec.ts` fulfills milestone list/create/patch and full member/group directories with real contract-shaped responses, then exercises inline creation, attachment retry, widening and restrictive visibility. This proves UI calls and parsing only. Once 7a is present in this checkout, also run these paths against its actual API and replace temporary schemas where shared exports exist. If it remains absent, mark that live acceptance pending with the exact routes; do not fix it in this step.
- [ ] **Compare every state with its prototype URL** at 1280px, 768px and 400px in Day/Night. Use user actions and controlled API states for product screenshots, not a shipping `?state` debug mode. Store product/reference screenshots under ignored `.playwright-mcp/`; inspect them visually for hierarchy, spacing, print proportions, wrapping and the intentional copy corrections. Test denied/unavailable and undated states as additions to the sixteen prototype URLs. Check contrast using the existing contrast helper, focus trapping/restoration and keyboard-only through tags, people, milestones, visibility and commit. Test 200% zoom with both overflow and clipped-control assertions; reduced motion still shows counts and status words.
- [ ] **Run the required checks:** `pnpm check`, then `pnpm exec playwright test --project=upload-chrome` and `pnpm exec playwright test --project=upload-webkit`. Read complete outputs and resolve only failures within this scope. Existing unrelated failures, an unavailable installed browser or absent dependent routes must be reported with evidence, not called green.
- [ ] **Run the real-bucket acceptance** through `/upload` on the development instance with at least 200 mixed files from a phone, on a phone-sized viewport. Use an available user-provided local media path without exposing credentials or private images in the report; if none is available, obtain that path when this check becomes actionable. Close/reopen and drop the network mid-transfer; inspect server-owned state and queued notifications, including silent recovery. The existing `pnpm upload:proof` headless harness is supplementary and cannot substitute for the surface test.
- [ ] **Record manual checks honestly:** an actual-phone run and an uncoached upload by someone who did not build the surface require those people/devices. Leave them unchecked if unavailable, alongside missing live milestone/directory routes. Use step status `implemented; acceptance pending` when these remain; `done` only when the step's stated acceptance is satisfied. Update web/E2E docs and README consistently, including every deliberate copy correction and the reason uploads stop on tab close.
- [ ] **Request the whole-branch review** under subagent-driven-development, fix findings and re-run affected checks. Verify `git diff --check` and the precise changed-file scope. Commit verified work as `test: verify upload surface and recovery`; leave the branch/worktree available for review and perform no push/merge/PR.

## Plan self-review

- The selected execution method remains subagent-driven development, as step 7b requires.
- Every spec section maps to Tasks 1 through 9; persisted authority, previews, edits, milestone/date correction, visibility, progress, both resume paths, accessibility and real/manual acceptance each have an owner.
- The controller and preview APIs above are the common signatures; later tasks extend the controller type when their implementation exists.
- The five Review Focus conditions have owning tests. Separate read/write, failure and refusal semantics are preserved.
- Required files are within the approved frontend/E2E/docs scope. Existing engine/shared/server implementations stay intact.
- The plan is approved by Juan Pablo. Execution and independent review are tracked in the task checkboxes and SDD ledger.
