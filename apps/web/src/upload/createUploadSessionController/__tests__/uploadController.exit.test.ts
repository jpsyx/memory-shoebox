import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import { expect, it } from "vitest";
import { getUploadRecoveryHintFromStorage } from "../uploadRecoveryStorageHelpers/uploadRecoveryStorageHelpers";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "./uploadControllerTestHelpers/uploadControllerTestHelpers";

it("leaving again while cancellation is pending invalidates a queued fresh pick", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const cancellation = makeDeferredAnswer<void>();
  harness.api.cancelUploadSession.mockReturnValueOnce(cancellation.promise);
  const firstExit = harness.controller.discardDraft();
  const freshPick = harness.controller.pickFiles(
    harness.pickedFiles.slice(1, 2),
  );
  const secondExit = harness.controller.discardDraft();
  cancellation.answer();
  await Promise.all([firstExit, freshPick, secondExit]);
  expect(harness.api.openUploadSession).toHaveBeenCalledOnce();
  expect(harness.controller.getSnapshot().phase).toBe("idle");
  expect(harness.controller.getSnapshot().filesById.size).toBe(0);
});

it("late page cleanup after controller teardown preserves armed recovery", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const sending = harness.controller.startUpload({
    mode: "everyone",
    subjects: [],
  });
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
  harness.controller.destroy();
  await harness.controller.discardDraft();
  expect(
    getUploadRecoveryHintFromStorage({
      storage: harness.storage,
      memberId: harness.serverDetail.uploadedBy.memberId,
    })?.sessionId,
  ).toBe(harness.serverDetail.sessionId);
  expect(harness.api.cancelUploadSession).not.toHaveBeenCalled();
  harness.answerRun();
  await sending;
});

it("leaving an unstarted batch immediately releases originals and cancels its draft", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 2));
  const sessionId = harness.controller.getSnapshot().detail!.sessionId;
  const cancellation = makeDeferredAnswer<void>();
  harness.api.cancelUploadSession.mockReturnValueOnce(cancellation.promise);
  const leaving = harness.controller.discardDraft();
  expect(harness.controller.getSnapshot().phase).toBe("idle");
  expect(harness.controller.getSnapshot().filesById.size).toBe(0);
  expect(
    getUploadRecoveryHintFromStorage({
      storage: harness.storage,
      memberId: harness.serverDetail.uploadedBy.memberId,
    }),
  ).toBeUndefined();
  expect(harness.api.cancelUploadSession).toHaveBeenCalledWith(sessionId);
  cancellation.answer();
  await leaving;
  expect(harness.api.commitUploadSession).not.toHaveBeenCalled();
});

it("leaving while a draft opens cancels the late answer without declaring files", async () => {
  const harness = makeUploadControllerHarness();
  const opening =
    makeDeferredAnswer<ReturnType<typeof makeUploadSessionDetail>>();
  harness.api.openUploadSession.mockReturnValueOnce(opening.promise);
  const picking = harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const leaving = harness.controller.discardDraft();
  const draft = makeUploadSessionDetail();
  opening.answer(draft);
  await Promise.all([picking, leaving]);
  expect(harness.api.cancelUploadSession).toHaveBeenCalledWith(draft.sessionId);
  expect(harness.api.putUploadManifest).not.toHaveBeenCalled();
  expect(harness.controller.getSnapshot().phase).toBe("idle");
});

it("a new read waits for the departing draft cancellation", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const cancellation = makeDeferredAnswer<void>();
  harness.api.cancelUploadSession.mockReturnValueOnce(cancellation.promise);
  const leaving = harness.controller.discardDraft();
  const reading = harness.controller.loadSession();
  expect(harness.api.getCurrentUploadSession).not.toHaveBeenCalled();
  cancellation.answer();
  await Promise.all([leaving, reading]);
  expect(harness.api.getCurrentUploadSession).toHaveBeenCalledOnce();
});

it("leaving an armed upload preserves the engine, originals and recovery hint", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const sending = harness.controller.startUpload({
    mode: "everyone",
    subjects: [],
  });
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
  await harness.controller.discardDraft();
  expect(harness.controller.getSnapshot().isRunning).toBe(true);
  expect(harness.controller.getSnapshot().filesById.size).toBe(1);
  expect(harness.engine.cancel).not.toHaveBeenCalled();
  expect(harness.api.cancelUploadSession).not.toHaveBeenCalled();
  expect(
    getUploadRecoveryHintFromStorage({
      storage: harness.storage,
      memberId: harness.serverDetail.uploadedBy.memberId,
    })?.sessionId,
  ).toBe(harness.serverDetail.sessionId);
  harness.answerRun();
  await sending;
});

it("leaving during an arm request preserves an upload that the server may already have started", async () => {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, 1));
  const armed =
    makeDeferredAnswer<ReturnType<typeof makeUploadSessionDetail>>();
  harness.api.commitUploadSession.mockReturnValueOnce(armed.promise);
  const sending = harness.controller.startUpload({
    mode: "everyone",
    subjects: [],
  });
  await harness.controller.discardDraft();
  expect(harness.api.cancelUploadSession).not.toHaveBeenCalled();
  armed.answer({ ...harness.serverDetail, state: "uploading" });
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
  harness.answerRun();
  await sending;
});
