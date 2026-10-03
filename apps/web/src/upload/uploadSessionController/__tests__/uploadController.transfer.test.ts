import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CompleteUploadFileResponse,
  SetUploadVisibilityRequest,
} from "@memory-shoebox/shared";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "./uploadControllerTestHelpers";
import { makeUploadFileFromPosition } from "./uploadSurfaceFixtures";

const EVERYONE: SetUploadVisibilityRequest = { mode: "everyone", subjects: [] };
type Harness = ReturnType<typeof makeUploadControllerHarness>;

async function _startTransfer(
  count = 1,
): Promise<{ harness: Harness; uploading: Promise<void> }> {
  const harness = makeUploadControllerHarness();
  await harness.controller.pickFiles(harness.pickedFiles.slice(0, count));
  harness.api.getUploadSession.mockClear();
  const uploading = harness.controller.startUpload(EVERYONE);
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
  return { harness, uploading };
}

function _makeCompletion(position = 0, count = 1): CompleteUploadFileResponse {
  return {
    file: { ...makeUploadFileFromPosition(position), state: "done" },
    progress: {
      waitingCount: 0,
      sendingCount: 0,
      doneCount: count,
      failedCount: 0,
      refusedCount: 0,
      cancelledCount: 0,
      doneBytes: count * 1000,
    },
    sessionState: "settled",
    didSettle: true,
  };
}

async function _complete(
  harness: Harness,
  response: CompleteUploadFileResponse,
): Promise<void> {
  harness.api.completeUploadFile.mockResolvedValueOnce(response);
  const answer = await harness.getEngineOptions()!.api!.completeUploadFile({
    sessionId: harness.serverDetail.sessionId,
    fileId: response.file.fileId,
    body: {
      outcome: response.file.state === "failed" ? "failed" : "done",
      contentHash: "a".repeat(64),
    },
  });
  expect(answer).toBe(response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upload transfer lifecycle", () => {
  it("264 completions need one final refresh", async () => {
    const { harness, uploading } = await _startTransfer(264);
    await Promise.all(
      Array.from({ length: 264 }, (_, position) => {
        return _complete(harness, _makeCompletion(position, position + 1));
      }),
    );
    expect(harness.api.completeUploadFile).toHaveBeenCalledTimes(264);
    expect(harness.api.getUploadSession).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().detail?.progress.doneCount).toBe(
      264,
    );
    expect(harness.controller.getSnapshot().isRunning).toBe(true);
    harness.answerRun();
    await uploading;
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(1);
  });

  it("failure completions move the bar without marking failure unconfirmed", async () => {
    const { harness, uploading } = await _startTransfer();
    const response = _makeCompletion();
    response.file.state = "failed";
    response.progress = {
      ...response.progress,
      doneCount: 0,
      doneBytes: 0,
      failedCount: 1,
    };
    await _complete(harness, response);
    harness.emitEvent({
      kind: "file-failed",
      fileId: response.file.fileId,
      problemCode: "connection_lost",
      detail: "Offline",
    });
    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.detail?.progress.failedCount).toBe(1);
    expect(snapshot.fileActivityById.get(response.file.fileId)).toEqual({
      kind: "confirmed",
      state: "failed",
    });
    expect(snapshot.phase).toBe("sending");
    harness.answerRun();
    await uploading;
  });

  it("settled event carrying uploading does not claim success", async () => {
    const { harness, uploading } = await _startTransfer();
    harness.emitEvent({ kind: "settled", sessionState: "uploading" });
    expect(harness.controller.getSnapshot().phase).not.toBe("done");
    expect(harness.controller.getSnapshot().isRunning).toBe(true);
    harness.answerRun();
    await uploading;
    expect(harness.controller.getSnapshot().phase).toBe("resume");
  });

  it("failed complete with no server answer remains unconfirmed", async () => {
    const { harness, uploading } = await _startTransfer();
    const fileId = harness.serverDetail.files[0]!.fileId;
    harness.api.completeUploadFile.mockRejectedValueOnce(new Error("Offline"));
    await expect(
      harness.getEngineOptions()!.api!.completeUploadFile({
        sessionId: harness.serverDetail.sessionId,
        fileId,
        body: { outcome: "failed", problemCode: "connection_lost" },
      }),
    ).rejects.toThrow("Offline");
    harness.emitEvent({
      kind: "file-failed",
      fileId,
      problemCode: "connection_lost",
      detail: "Offline",
    });
    harness.answerRun();
    await uploading;
    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.fileActivityById.get(fileId)?.kind).toBe("unconfirmed");
    expect(snapshot.detail?.notifiedAt).toBeNull();
    expect(snapshot.detail?.progress.failedCount).toBe(0);
    expect(snapshot.phase).toBe("resume");
  });

  it("duplicate is not a casualty", async () => {
    const { harness, uploading } = await _startTransfer();
    const duplicateId = harness.serverDetail.files[0]!.fileId;
    harness.emitEvent({
      kind: "file-skipped",
      fileId: duplicateId,
      reason: "duplicate",
    });
    harness.serverDetail.files[0]!.state = "cancelled";
    harness.serverDetail.state = "settled";
    harness.answerRun();
    await uploading;
    expect(
      harness.controller.getSnapshot().fileActivityById.get(duplicateId)?.kind,
    ).toBe("duplicate");
    expect(harness.controller.getSnapshot().phase).toBe("done");
  });

  it.each([false, true])(
    "final two completion order reversed=%s retains all facts",
    async (isReversed) => {
      const { harness, uploading } = await _startTransfer(2);
      const older = _makeCompletion(0, 1);
      older.sessionState = "uploading";
      older.didSettle = false;
      const latest = _makeCompletion(1, 2);
      const responses = isReversed ? [latest, older] : [older, latest];
      await _complete(harness, responses[0]!);
      await _complete(harness, responses[1]!);
      expect(harness.controller.getSnapshot().detail?.progress.doneCount).toBe(
        2,
      );
      expect(harness.controller.getSnapshot().detail?.state).toBe("settled");
      expect(
        harness.controller.getSnapshot().detail?.files.map((file) => {
          return file.state;
        }),
      ).toEqual(["done", "done"]);
      harness.answerRun();
      await uploading;
    },
  );

  it("failed final refresh preserves known facts and exposes recovery", async () => {
    const { harness, uploading } = await _startTransfer();
    await _complete(harness, _makeCompletion());
    harness.api.getUploadSession.mockRejectedValueOnce(new Error("Offline"));
    harness.answerRun();
    await expect(uploading).rejects.toThrow("Offline");
    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.detail?.progress.doneCount).toBe(1);
    expect(snapshot.detail?.files[0]?.state).toBe("done");
    expect(snapshot.phase).toBe("partial");
    expect(snapshot.error?.operation).toBe("upload");
    expect(snapshot.isRunning).toBe(false);
  });

  it("same-session loads during in-app navigation preserve the engine generation", async () => {
    const { harness, uploading } = await _startTransfer();
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await harness.controller.loadSession();
    expect(harness.engine.cancel).not.toHaveBeenCalled();
    expect(harness.api.getUploadSession).not.toHaveBeenCalled();
    await _complete(harness, _makeCompletion());
    expect(harness.controller.getSnapshot().detail?.progress.doneCount).toBe(1);
    expect(harness.controller.getSnapshot().phase).toBe("sending");
    harness.controller.selectAll();
    expect(harness.controller.getSnapshot().selectedFileIds.size).toBe(0);
    harness.answerRun();
    await uploading;
  });

  it("close cancels the local engine and commits close ahead of late completion", async () => {
    const { harness, uploading } = await _startTransfer();
    const response = _makeCompletion();
    const completion = harness.getEngineOptions()!.api!.completeUploadFile({
      sessionId: harness.serverDetail.sessionId,
      fileId: response.file.fileId,
      body: { outcome: "done", contentHash: "a".repeat(64) },
    });
    await harness.controller.closeBatch();
    expect(harness.engine.cancel).toHaveBeenCalledOnce();
    expect(harness.api.commitUploadSession).toHaveBeenLastCalledWith({
      sessionId: harness.serverDetail.sessionId,
      intent: "close",
    });
    const closedSnapshot = harness.controller.getSnapshot();
    harness.answerCompletion(response);
    await completion;
    harness.emitEvent({
      kind: "file-done",
      fileId: response.file.fileId,
      response,
    });
    harness.emitEvent({ kind: "settled", sessionState: "settled" });
    harness.answerRun();
    await uploading;
    expect(harness.controller.getSnapshot()).toBe(closedSnapshot);
    expect(harness.api.getUploadSession).not.toHaveBeenCalled();
  });

  it("close wins over an already pending final refresh", async () => {
    const { harness, uploading } = await _startTransfer();
    const read = makeDeferredAnswer<typeof harness.serverDetail>();
    harness.api.getUploadSession.mockReturnValueOnce(read.promise);
    harness.answerRun();
    await expect
      .poll(() => {
        return harness.api.getUploadSession.mock.calls.length;
      })
      .toBe(1);
    await harness.controller.closeBatch();
    const closedSnapshot = harness.controller.getSnapshot();
    read.answer({ ...harness.serverDetail, state: "uploading" });
    await uploading;
    expect(harness.controller.getSnapshot()).toBe(closedSnapshot);
  });

  it("final read confirms a file whose complete response was lost", async () => {
    const { harness, uploading } = await _startTransfer();
    const fileId = harness.serverDetail.files[0]!.fileId;
    harness.emitEvent({
      kind: "file-failed",
      fileId,
      problemCode: "connection_lost",
      detail: "Offline",
    });
    harness.serverDetail.files[0]!.state = "done";
    harness.serverDetail.state = "settled";
    harness.answerRun();
    await uploading;
    expect(
      harness.controller.getSnapshot().fileActivityById.get(fileId),
    ).toEqual({ kind: "confirmed", state: "done" });
    expect(harness.controller.getSnapshot().phase).toBe("done");
  });

  it("rejected close of a settled active run does not invalidate its final refresh", async () => {
    const { harness, uploading } = await _startTransfer();
    await _complete(harness, _makeCompletion());
    await expect(harness.controller.closeBatch()).rejects.toThrow();
    harness.answerRun();
    await uploading;
    expect(harness.controller.getSnapshot().isRunning).toBe(false);
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(1);
  });

  it("close follows its detail cursor before publishing the full cancelled manifest", async () => {
    const { harness, uploading } = await _startTransfer(264);
    const closedFiles = harness.serverDetail.files.map((file) => {
      return {
        ...file,
        state: "cancelled" as const,
        problemCode: "cancelled_by_uploader" as const,
      };
    });
    harness.api.commitUploadSession.mockResolvedValueOnce({
      ...harness.serverDetail,
      state: "settled",
      files: closedFiles.slice(0, 100),
      nextCursor: "close-page",
    });
    harness.api.getUploadSession.mockResolvedValueOnce({
      ...harness.serverDetail,
      state: "settled",
      files: closedFiles.slice(100),
      nextCursor: null,
    });
    await harness.controller.closeBatch();
    expect(harness.controller.getSnapshot().detail?.files).toHaveLength(264);
    expect(harness.controller.getSnapshot().detail?.files[263]?.state).toBe(
      "cancelled",
    );
    expect(harness.api.getUploadSession).toHaveBeenCalledWith({
      sessionId: harness.serverDetail.sessionId,
      limit: 500,
      cursor: "close-page",
    });
    harness.answerRun();
    await uploading;
  });

  it("byte events coalesce into one frame and terminal activity flushes immediately", async () => {
    let onFrame: FrameRequestCallback | undefined;
    const scheduleFrame = vi.fn((callback: FrameRequestCallback) => {
      onFrame = callback;
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", scheduleFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { harness, uploading } = await _startTransfer();
    const listener = vi.fn();
    harness.controller.subscribe(listener);
    const fileId = harness.serverDetail.files[0]!.fileId;
    harness.emitEvent({ kind: "file-started", fileId });
    listener.mockClear();
    [10, 20, 30].forEach((sentBytes) => {
      return harness.emitEvent({
        kind: "file-progress",
        fileId,
        sentBytes,
        totalBytes: 100,
      });
    });
    expect(listener).not.toHaveBeenCalled();
    expect(scheduleFrame).toHaveBeenCalledOnce();
    onFrame!(0);
    expect(listener).toHaveBeenCalledOnce();
    expect(
      harness.controller.getSnapshot().fileActivityById.get(fileId),
    ).toEqual({ kind: "transferring", sentBytes: 30, totalBytes: 100 });
    expect(harness.controller.getSnapshot().detail?.progress.doneBytes).toBe(0);
    harness.emitEvent({ kind: "file-skipped", fileId, reason: "duplicate" });
    expect(
      harness.controller.getSnapshot().fileActivityById.get(fileId)?.kind,
    ).toBe("duplicate");
    harness.answerRun();
    await uploading;
  });
});
