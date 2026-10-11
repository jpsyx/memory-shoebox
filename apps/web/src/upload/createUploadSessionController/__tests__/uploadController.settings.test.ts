import { afterEach, expect, it, vi } from "vitest";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "./uploadControllerTestHelpers/uploadControllerTestHelpers";

afterEach(() => {
  return vi.unstubAllGlobals();
});

it("refreshes server dates while preserving active Files, transfer progress and engine generation", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const uploading = harness.controller.startUpload({
    mode: "everyone",
    subjects: [],
  });
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
  const before = harness.controller.getSnapshot();
  const fileId = before.detail!.files[0]!.fileId;
  harness.emitEvent({ kind: "file-started", fileId });
  let onFrame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    onFrame = callback;
    return 1;
  });
  harness.emitEvent({
    kind: "file-progress",
    fileId,
    sentBytes: 32,
    totalBytes: 100,
  });
  onFrame!(0);
  const activity = harness.controller.getSnapshot().fileActivityById;
  expect(activity.get(fileId)).toEqual({
    kind: "transferring",
    sentBytes: 32,
    totalBytes: 100,
  });
  harness.api.getUploadSession.mockResolvedValueOnce({
    ...harness.serverDetail,
    files: harness.serverDetail.files.map((file) => {
      return {
        ...file,
        capturedOn: "2026-10-12",
      };
    }),
  });
  await harness.controller.refreshSessionMetadata();
  const after = harness.controller.getSnapshot();
  expect(after.detail!.files[0]!.capturedOn).toBe("2026-10-12");
  expect(after.filesById).toBe(before.filesById);
  expect(after.filesById.get(fileId)).toBe(harness.pickedFiles[0]);
  expect(after.fileActivityById).toBe(activity);
  expect(after.phase).toBe("sending");
  expect(after.isRunning).toBe(true);
  expect(after.isBusy).toBe(before.isBusy);
  expect(harness.engine.cancel).not.toHaveBeenCalled();
  harness.answerRun();
  await uploading;
  expect(harness.controller.getSnapshot().isRunning).toBe(false);
});

it("discards an older metadata answer after another operation changes the session", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const read = makeDeferredAnswer<typeof harness.serverDetail>();
  harness.api.getUploadSession.mockReturnValueOnce(read.promise);
  const refreshing = harness.controller.refreshSessionMetadata();
  harness.controller.reset();
  const resetSnapshot = harness.controller.getSnapshot();
  read.answer(harness.serverDetail);
  await refreshing;
  expect(harness.controller.getSnapshot()).toBe(resetSnapshot);
});

it("coalesces metadata reads and rereads when completion changed server facts in flight", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const uploading = harness.controller.startUpload({
    mode: "everyone",
    subjects: [],
  });
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
  const stale = structuredClone(harness.serverDetail);
  const read = makeDeferredAnswer<typeof harness.serverDetail>();
  harness.api.getUploadSession.mockReturnValueOnce(read.promise);
  const refreshing = harness.controller.refreshSessionMetadata();
  const alsoRefreshing = harness.controller.refreshSessionMetadata();
  const completed = { ...stale.files[0]!, state: "done" as const };
  const completion = {
    file: completed,
    progress: {
      ...stale.progress,
      waitingCount: 0,
      doneCount: 1,
      doneBytes: 1000,
    },
    sessionState: "settled" as const,
    didSettle: true,
  };
  harness.api.completeUploadFile.mockResolvedValueOnce(completion);
  await harness.getEngineOptions()!.api!.completeUploadFile({
    sessionId: stale.sessionId,
    fileId: completed.fileId,
    body: { outcome: "done", contentHash: "a".repeat(64) },
  });
  harness.api.getUploadSession.mockResolvedValueOnce({
    ...stale,
    state: "settled",
    progress: completion.progress,
    files: [{ ...completed, capturedOn: "2026-10-12" }],
  });
  read.answer(stale);
  await Promise.all([refreshing, alsoRefreshing]);
  expect(harness.controller.getSnapshot().detail!.files[0]!.state).toBe("done");
  expect(harness.controller.getSnapshot().detail!.files[0]!.capturedOn).toBe(
    "2026-10-12",
  );
  expect(harness.controller.getSnapshot().detail!.progress.doneCount).toBe(1);
  harness.answerRun();
  await uploading;
});

it("queues a fresh metadata read when another timezone change arrives during the first read", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const firstRead = makeDeferredAnswer<typeof harness.serverDetail>();
  harness.api.getUploadSession.mockReturnValueOnce(firstRead.promise);
  const refreshing = harness.controller.refreshSessionMetadata();
  const refreshingAgain = harness.controller.refreshSessionMetadata();
  harness.api.getUploadSession.mockResolvedValueOnce({
    ...harness.serverDetail,
    files: harness.serverDetail.files.map((file) => {
      return { ...file, capturedOn: "2026-10-13" };
    }),
  });
  firstRead.answer({
    ...harness.serverDetail,
    files: harness.serverDetail.files.map((file) => {
      return { ...file, capturedOn: "2026-10-12" };
    }),
  });
  await Promise.all([refreshing, refreshingAgain]);
  expect(harness.controller.getSnapshot().detail!.files[0]!.capturedOn).toBe(
    "2026-10-13",
  );
});

it("keeps the active snapshot intact when metadata refresh fails", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const uploading = harness.controller.startUpload({
    mode: "everyone",
    subjects: [],
  });
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
  const before = harness.controller.getSnapshot();
  harness.api.getUploadSession.mockRejectedValueOnce(
    new Error("Refresh unavailable"),
  );
  await expect(harness.controller.refreshSessionMetadata()).rejects.toThrow(
    "Refresh unavailable",
  );
  expect(harness.controller.getSnapshot()).toBe(before);
  expect(harness.engine.cancel).not.toHaveBeenCalled();
  harness.answerRun();
  await uploading;
});
