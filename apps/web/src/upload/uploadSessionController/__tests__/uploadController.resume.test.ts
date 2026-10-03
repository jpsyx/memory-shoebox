import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { createUploadSessionController } from "../uploadSessionController";
import { makeUploadRecoveryControllerHarness } from "./uploadControllerTestHelpers";
import { makeUploadFileFromPosition } from "./uploadSurfaceFixtures";
import type { UploadFileDto } from "@memory-shoebox/shared";

function _row(
  position: number,
  state: UploadFileDto["state"] = "waiting",
): UploadFileDto {
  return {
    ...makeUploadFileFromPosition(position),
    state,
    contentHash: position.toString(16).padStart(64, "0"),
  };
}

async function _waitForEngine(
  harness: ReturnType<typeof makeUploadRecoveryControllerHarness>,
) {
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
}

describe("upload recovery", () => {
  it("all 264 re-picked sends only 64 missing and ignores ticks", async () => {
    const harness = makeUploadRecoveryControllerHarness(
      Array.from({ length: 264 }, (_, position) => {
        return _row(position, position < 200 ? "done" : "waiting");
      }),
    );
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles(harness.files);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    const sentIds = harness.engine.start.mock.calls[0]![0].map((file) => {
      return file.fileId;
    });
    expect(sentIds).toHaveLength(64);
    expect(sentIds).not.toContain(harness.serverDetail.files[0]!.fileId);
    expect(harness.api.createUploadEdit).not.toHaveBeenCalled();
    expect(harness.api.setUploadVisibility).not.toHaveBeenCalled();
    harness.answerRun();
    await recovering;
  });

  it("more than 100 missing rows are listed", async () => {
    const harness = makeUploadRecoveryControllerHarness(
      Array.from({ length: 264 }, (_, position) => {
        return _row(position, "failed");
      }),
      "settled",
    );
    harness.api.getUploadSession
      .mockResolvedValueOnce({
        ...structuredClone(harness.serverDetail),
        files: harness.serverDetail.files.slice(0, 100),
        nextCursor: "second",
      })
      .mockResolvedValueOnce({
        ...structuredClone(harness.serverDetail),
        files: harness.serverDetail.files.slice(100),
        nextCursor: null,
      });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    expect(harness.controller.getSnapshot().detail?.files).toHaveLength(264);
  });

  it("settled recovery never patches manifest and preserves silent recovery through transfer", async () => {
    const harness = makeUploadRecoveryControllerHarness(
      [_row(1, "failed")],
      "settled",
    );
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles(harness.files);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    const fileId = harness.serverDetail.files[0]!.fileId;
    expect(harness.api.putUploadManifest).not.toHaveBeenCalled();
    expect(
      harness.controller.getSnapshot().fileActivityById.get(fileId)
        ?.isIncludedInEmail,
    ).toBe(false);
    harness.getEngineOptions()!.onEvent({ kind: "file-started", fileId });
    harness.getEngineOptions()!.onEvent({
      kind: "file-progress",
      fileId,
      sentBytes: 1,
      totalBytes: 1000,
    });
    harness.serverDetail.files[0]!.state = "done";
    const response = {
      file: structuredClone(harness.serverDetail.files[0]!),
      progress: harness.serverDetail.progress,
      sessionState: "settled" as const,
      didSettle: false,
    };
    harness.api.completeUploadFile.mockResolvedValueOnce(response);
    await harness.getEngineOptions()!.api!.completeUploadFile({
      sessionId: harness.serverDetail.sessionId,
      fileId,
      body: { outcome: "done", contentHash: "1".padStart(64, "0") },
    });
    expect(
      harness.controller.getSnapshot().fileActivityById.get(fileId)
        ?.isIncludedInEmail,
    ).toBe(false);
    harness.answerRun();
    await recovering;
    expect(
      harness.controller.getSnapshot().fileActivityById.get(fileId)
        ?.isIncludedInEmail,
    ).toBe(false);
  });

  it("settlement racing manifest reloads then uses silent retry", async () => {
    const harness = makeUploadRecoveryControllerHarness([_row(1, "failed")]);
    harness.api.putUploadManifest.mockImplementationOnce(async () => {
      harness.serverDetail.state = "settled";
      throw new ApiRequestError({
        status: 409,
        code: "upload_session_conflict",
        message: "settled",
      });
    });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles(harness.files);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    expect(
      harness.controller
        .getSnapshot()
        .fileActivityById.get(harness.serverDetail.files[0]!.fileId)
        ?.isIncludedInEmail,
    ).toBe(false);
    harness.answerRun();
    await recovering;
  });

  it("extra files do not poison resume and refused picks are never retried", async () => {
    const harness = makeUploadRecoveryControllerHarness([
      _row(1, "failed"),
      _row(2, "refused"),
    ]);
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles([
      ...harness.files,
      new File(["extra"], "extra.jpg", { type: "image/jpeg" }),
    ]);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    expect(harness.api.putUploadManifest.mock.calls[0]![0].files).toHaveLength(
      1,
    );
    expect(harness.api.retryUploadFile).not.toHaveBeenCalledWith({
      sessionId: harness.serverDetail.sessionId,
      fileId: harness.serverDetail.files[1]!.fileId,
    });
    expect(
      harness.controller.getSnapshot().recoveryMatches.unmatchedClientRefs,
    ).toHaveLength(1);
    harness.answerRun();
    await recovering;
  });

  it("storage failure still allows addressed recovery", async () => {
    const harness = makeUploadRecoveryControllerHarness(
      [_row(1, "failed")],
      "settled",
    );
    vi.spyOn(harness.storage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(harness.storage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles(harness.files);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    harness.answerRun();
    await recovering;
    expect(harness.controller.getSnapshot().detail?.sessionId).toBe(
      harness.serverDetail.sessionId,
    );
  });

  it("current batch wins over remembered settled batch", async () => {
    const harness = makeUploadRecoveryControllerHarness([_row(1)], "draft");
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    harness.controller.destroy();
    harness.api.getCurrentUploadSession.mockResolvedValueOnce({
      ...harness.serverDetail,
      sessionId: "current",
    });
    harness.api.getUploadSession.mockResolvedValueOnce({
      ...harness.serverDetail,
      sessionId: "current",
    });
    const controller = createUploadSessionController({
      memberId: harness.serverDetail.uploadedBy.memberId,
      api: harness.api,
      storage: harness.storage,
    });
    await controller.loadSession();
    expect(controller.getSnapshot().detail?.sessionId).toBe("current");
  });
  it("settlement racing retry suppresses email copy from the retry answer", async () => {
    const harness = makeUploadRecoveryControllerHarness([_row(1, "failed")]);
    harness.api.retryUploadFile.mockImplementationOnce(async ({ fileId }) => {
      harness.serverDetail.state = "settled";
      const row = harness.serverDetail.files.find((file) => {
        return file.fileId === fileId;
      })!;
      row.state = "waiting";
      return { file: structuredClone(row), isIncludedInEmail: false };
    });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles(harness.files);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    expect(harness.controller.getSnapshot().detail?.state).toBe("settled");
    expect(
      harness.controller
        .getSnapshot()
        .fileActivityById.get(harness.serverDetail.files[0]!.fileId)
        ?.isIncludedInEmail,
    ).toBe(false);
    harness.answerRun();
    await recovering;
  });

  it("duplicate picks enter the queue and retry only once", async () => {
    const harness = makeUploadRecoveryControllerHarness(
      [_row(1, "failed")],
      "settled",
    );
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles([
      harness.files[0]!,
      harness.files[0]!,
    ]);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    expect(harness.engine.start.mock.calls[0]![0]).toHaveLength(1);
    expect(harness.api.retryUploadFile).toHaveBeenCalledTimes(1);
    harness.answerRun();
    await recovering;
  });

  it("failed hash reads leave the batch recoverable with an empty re-pick", async () => {
    const harness = makeUploadRecoveryControllerHarness(
      [_row(1, "failed")],
      "settled",
    );
    vi.mocked(harness.worker.postMessage).mockImplementationOnce((request) => {
      queueMicrotask(() => {
        return harness.worker.onmessage?.(
          new MessageEvent("message", {
            data: {
              kind: "failed",
              requestId: request.requestId,
              detail: "cannot read",
            },
          }),
        );
      });
    });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await expect(harness.controller.pickFiles(harness.files)).rejects.toThrow(
      "cannot read",
    );
    expect(harness.engine.start).not.toHaveBeenCalled();
    expect(harness.api.retryUploadFile).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().phase).toBe("partial");
    const recovering = harness.controller.pickFiles([]);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    harness.answerRun();
    await recovering;
  });

  it.each(["draft", "uploading"] as const)(
    "reset cancels %s hashing and rejects stale publication",
    async (state) => {
      const harness = makeUploadRecoveryControllerHarness(
        [_row(1, state === "draft" ? "waiting" : "failed")],
        state,
      );
      vi.mocked(harness.worker.postMessage).mockImplementationOnce(() => {});
      await harness.controller.loadSession(harness.serverDetail.sessionId);
      const recovering = harness.controller.pickFiles(harness.files);
      await expect
        .poll(() => {
          return harness.controller.getSnapshot().phase;
        })
        .toBe("checking");
      harness.controller.reset();
      await recovering;
      expect(harness.worker.terminate).toHaveBeenCalled();
      expect(harness.controller.getSnapshot().phase).toBe("idle");
      expect(harness.api.retryUploadFile).not.toHaveBeenCalled();
      expect(harness.engine.start).not.toHaveBeenCalled();
    },
  );

  it("close interrupts checking and never starts the stale transfer", async () => {
    const harness = makeUploadRecoveryControllerHarness([_row(1, "failed")]);
    vi.mocked(harness.worker.postMessage).mockImplementationOnce(() => {});
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles(harness.files);
    await expect
      .poll(() => {
        return harness.controller.getSnapshot().phase;
      })
      .toBe("checking");
    await harness.controller.closeBatch();
    await recovering;
    expect(harness.worker.terminate).toHaveBeenCalled();
    expect(harness.controller.getSnapshot().detail?.state).toBe("settled");
    expect(harness.engine.start).not.toHaveBeenCalled();
  });

  it("retryMissingFiles uses retained failed ids without replaying declaration", async () => {
    const harness = makeUploadRecoveryControllerHarness(
      [_row(1, "failed")],
      "settled",
    );
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles(harness.files);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    harness.serverDetail.files[0]!.state = "failed";
    harness.answerRun();
    await recovering;
    harness.api.retryUploadFile.mockClear();
    const retrying = harness.controller.retryMissingFiles([
      harness.serverDetail.files[0]!.fileId,
    ]);
    await retrying;
    expect(harness.api.retryUploadFile).toHaveBeenCalledTimes(1);
    expect(harness.engine.start).toHaveBeenCalledTimes(2);
    expect(harness.api.putUploadManifest).not.toHaveBeenCalled();
  });
  it("addressing another batch releases the previous recovery handles", async () => {
    const harness = makeUploadRecoveryControllerHarness(
      [_row(1, "failed")],
      "settled",
    );
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovering = harness.controller.pickFiles(harness.files);
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    harness.answerRun();
    await recovering;
    harness.serverDetail.sessionId = "018f0000-0000-7000-8000-00000000c002";
    harness.serverDetail.state = "uploading";
    harness.serverDetail.files[0]!.state = "waiting";
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await harness.controller.pickFiles([]);
    expect(harness.controller.getSnapshot().filesById.size).toBe(0);
    expect(harness.engine.start).toHaveBeenCalledTimes(1);
  });
});
