import { makeWorkerFactoryFromAnswer } from "@/upload/createUploadEngine/__tests__/createUploadEngineTestHelpers";
import type {
  UploadOriginalStore,
  UploadOriginalScope,
} from "@/upload/createUploadOriginalStore/createUploadOriginalStore.types";
import { describe, expect, it, vi } from "vitest";
import { createUploadSessionController } from "../createUploadSessionController";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "./uploadControllerTestHelpers/uploadControllerTestHelpers";

function _makeStore() {
  const batches = new Map<string, Map<string, File>>();
  const getKey = (scope: Readonly<UploadOriginalScope>) => {
    return JSON.stringify([scope.memberId, scope.sessionId]);
  };
  const store = {
    saveFiles: vi.fn<UploadOriginalStore["saveFiles"]>(async (options) => {
      batches.set(
        getKey(options),
        new Map([
          ...(batches.get(getKey(options)) ?? []),
          ...options.filesById,
        ]),
      );
    }),
    readFiles: vi.fn<UploadOriginalStore["readFiles"]>(async (scope) => {
      return new Map(batches.get(getKey(scope)));
    }),
    removeFiles: vi.fn<UploadOriginalStore["removeFiles"]>(async (options) => {
      options.fileIds.forEach((id) => {
        return batches.get(getKey(options))?.delete(id);
      });
    }),
    clearSession: vi.fn<UploadOriginalStore["clearSession"]>(async (scope) => {
      batches.delete(getKey(scope));
    }),
  };
  return store;
}

function _makeController(
  options: Readonly<{
    harness: ReturnType<typeof makeUploadControllerHarness>;
    originalStore: UploadOriginalStore;
  }>,
) {
  return createUploadSessionController({
    memberId: options.harness.serverDetail.uploadedBy.memberId,
    api: options.harness.api,
    storage: options.harness.storage,
    originalStore: options.originalStore,
    getManifestEntryFromFile: options.harness.headerReader,
    createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
    createUploadEngine: () => {
      return options.harness.engine;
    },
  });
}

describe("upload originals across refresh", () => {
  it("persists originals before sending and restores only missing files after controller recreation", async () => {
    const harness = makeUploadControllerHarness();
    const originalStore = _makeStore();
    const controller = _makeController({ harness, originalStore });
    await controller.pickFiles(harness.pickedFiles.slice(0, 2));
    const save = makeDeferredAnswer<void>();
    const saveFiles = originalStore.saveFiles.getMockImplementation()!;
    originalStore.saveFiles.mockImplementationOnce(async (options) => {
      await save.promise;
      await saveFiles(options);
    });
    const running = controller.startUpload({ mode: "everyone", subjects: [] });
    await vi.waitFor(() => {
      return expect(originalStore.saveFiles).toHaveBeenCalledTimes(1);
    });
    expect(harness.engine.start).not.toHaveBeenCalled();
    save.answer();
    await vi.waitFor(() => {
      return expect(harness.engine.start).toHaveBeenCalledTimes(1);
    });
    controller.destroy();
    harness.answerRun();
    await running;
    harness.serverDetail.files[0]!.state = "done";
    const restored = _makeController({ harness, originalStore });
    await restored.loadSession(harness.serverDetail.sessionId);
    expect([...restored.getSnapshot().filesById.keys()]).toEqual([
      harness.serverDetail.files[1]!.fileId,
    ]);
    expect(harness.engine.start).toHaveBeenCalledTimes(1);
    expect(originalStore.removeFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        fileIds: [harness.serverDetail.files[0]!.fileId],
      }),
    );
    const doneId = harness.serverDetail.files[0]!.fileId;
    await restored.retryMissingFiles(
      harness.serverDetail.files.map((file) => {
        return file.fileId;
      }),
    );
    expect(
      harness.engine.start.mock.calls[1]![0].map((file) => {
        return file.fileId;
      }),
    ).not.toContain(doneId);
    restored.destroy();
  });

  it("cleans up successful originals and retains failed ones at the end of a run", async () => {
    const harness = makeUploadControllerHarness();
    const originalStore = _makeStore();
    const controller = _makeController({ harness, originalStore });
    await controller.pickFiles(harness.pickedFiles.slice(0, 2));
    const running = controller.startUpload({ mode: "everyone", subjects: [] });
    await vi.waitFor(() => {
      return expect(harness.engine.start).toHaveBeenCalled();
    });
    harness.serverDetail.files[0]!.state = "done";
    harness.serverDetail.files[1]!.state = "failed";
    harness.serverDetail.state = "settled";
    harness.answerRun();
    await running;
    const stored = await originalStore.readFiles({
      memberId: harness.serverDetail.uploadedBy.memberId,
      sessionId: harness.serverDetail.sessionId,
    });
    expect([...stored.keys()]).toEqual([harness.serverDetail.files[1]!.fileId]);
    controller.reset();
    await vi.waitFor(() => {
      return expect(originalStore.clearSession).toHaveBeenCalled();
    });
    controller.destroy();
  });

  it("continues uploading when persistence fails and explains the refresh limitation", async () => {
    const harness = makeUploadControllerHarness();
    const originalStore = _makeStore();
    originalStore.saveFiles.mockRejectedValue(new Error("QuotaExceededError"));
    const controller = _makeController({ harness, originalStore });
    await controller.pickFiles(harness.pickedFiles.slice(0, 1));
    const running = controller.startUpload({ mode: "everyone", subjects: [] });
    await vi.waitFor(() => {
      return expect(harness.engine.start).toHaveBeenCalled();
    });
    expect(controller.getSnapshot().recoveryStorageWarning).toMatch(
      /keep this tab open/i,
    );
    harness.answerRun();
    await expect(running).resolves.toBeUndefined();
    controller.destroy();
  });

  it("clears an in-flight save after reset without starting a stale transfer", async () => {
    const harness = makeUploadControllerHarness();
    const originalStore = _makeStore();
    const controller = _makeController({ harness, originalStore });
    await controller.pickFiles(harness.pickedFiles.slice(0, 1));
    const save = makeDeferredAnswer<void>();
    const saveFiles = originalStore.saveFiles.getMockImplementation()!;
    originalStore.saveFiles.mockImplementationOnce(async (options) => {
      await save.promise;
      await saveFiles(options);
    });
    const running = controller.startUpload({ mode: "everyone", subjects: [] });
    await vi.waitFor(() => {
      return expect(originalStore.saveFiles).toHaveBeenCalled();
    });
    controller.reset();
    save.answer();
    await running;
    await vi.waitFor(() => {
      return expect(originalStore.clearSession).toHaveBeenCalled();
    });
    expect(
      await originalStore.readFiles({
        memberId: harness.serverDetail.uploadedBy.memberId,
        sessionId: harness.serverDetail.sessionId,
      }),
    ).toEqual(new Map());
    expect(harness.engine.start).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe("idle");
    controller.destroy();
  });

  it("waits for reset cleanup before reopening and retaining retry originals", async () => {
    const harness = makeUploadControllerHarness();
    const originalStore = _makeStore();
    const controller = _makeController({ harness, originalStore });
    const original = harness.pickedFiles[0]!;
    await controller.pickFiles([original]);
    const fileId = harness.serverDetail.files[0]!.fileId;
    const save = makeDeferredAnswer<void>();
    const cleanup = makeDeferredAnswer<void>();
    const saveFiles = originalStore.saveFiles.getMockImplementation()!;
    const clearSession = originalStore.clearSession.getMockImplementation()!;
    originalStore.saveFiles.mockImplementationOnce(async (options) => {
      await save.promise;
      await saveFiles(options);
    });
    originalStore.clearSession.mockImplementationOnce(async (scope) => {
      await cleanup.promise;
      await clearSession(scope);
    });
    const running = controller.startUpload({ mode: "everyone", subjects: [] });
    await vi.waitFor(() => {
      return expect(originalStore.saveFiles).toHaveBeenCalledTimes(1);
    });
    controller.reset();
    const recovering = controller.loadSession(harness.serverDetail.sessionId);
    save.answer();
    await running;
    await vi.waitFor(() => {
      return expect(originalStore.clearSession).toHaveBeenCalledTimes(1);
    });
    expect(originalStore.readFiles).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe("idle");
    cleanup.answer();
    await recovering;
    expect(controller.getSnapshot().filesById.size).toBe(0);
    expect(harness.engine.start).not.toHaveBeenCalled();
    harness.serverDetail.state = "settled";
    const retrying = controller.pickFiles([original]);
    await vi.waitFor(() => {
      return expect(harness.engine.start).toHaveBeenCalledTimes(1);
    });
    harness.answerRun();
    await retrying;
    expect(
      await originalStore.readFiles({
        memberId: harness.serverDetail.uploadedBy.memberId,
        sessionId: harness.serverDetail.sessionId,
      }),
    ).toEqual(new Map([[fileId, original]]));
    controller.destroy();
  });

  it("allows recovery when reset cleanup fails", async () => {
    const harness = makeUploadControllerHarness();
    const originalStore = _makeStore();
    const controller = _makeController({ harness, originalStore });
    await controller.pickFiles(harness.pickedFiles.slice(0, 1));
    harness.serverDetail.state = "uploading";
    originalStore.clearSession.mockRejectedValue(new Error("Storage denied"));
    controller.reset();
    await expect(
      controller.loadSession(harness.serverDetail.sessionId),
    ).resolves.toBeUndefined();
    expect(controller.getSnapshot().phase).toBe("resume");
    expect(controller.getSnapshot().error).toBeUndefined();
    expect(harness.engine.start).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("does not reopen a reset batch when its cleanup finishes", async () => {
    const harness = makeUploadControllerHarness();
    const originalStore = _makeStore();
    const controller = _makeController({ harness, originalStore });
    await controller.pickFiles(harness.pickedFiles.slice(0, 1));
    const cleanup = makeDeferredAnswer<void>();
    originalStore.clearSession.mockReturnValue(cleanup.promise);
    controller.reset();
    const readCount = harness.api.getUploadSession.mock.calls.length;
    const reopening = controller.loadSession(harness.serverDetail.sessionId);
    controller.reset();
    cleanup.answer();
    await reopening;
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(readCount);
    expect(originalStore.readFiles).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("keeps the recovery view available when the browser denies stored originals", async () => {
    const harness = makeUploadControllerHarness();
    harness.serverDetail.state = "uploading";
    const originalStore = _makeStore();
    originalStore.readFiles.mockRejectedValue(new Error("Storage denied"));
    const controller = _makeController({ harness, originalStore });
    await expect(
      controller.loadSession(harness.serverDetail.sessionId),
    ).resolves.toBeUndefined();
    expect(controller.getSnapshot().phase).toBe("resume");
    expect(controller.getSnapshot().recoveryStorageWarning).toMatch(
      /select the same photos again/,
    );
    expect(harness.engine.start).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("does not restore a stale asynchronous read after reset", async () => {
    const harness = makeUploadControllerHarness();
    const originalStore = _makeStore();
    const controller = _makeController({ harness, originalStore });
    await controller.pickFiles(harness.pickedFiles.slice(0, 1));
    const fileId = harness.serverDetail.files[0]!.fileId;
    harness.serverDetail.state = "uploading";
    const read = makeDeferredAnswer<Map<string, File>>();
    originalStore.readFiles.mockReturnValue(read.promise);
    const loading = controller.loadSession(harness.serverDetail.sessionId);
    await vi.waitFor(() => {
      return expect(originalStore.readFiles).toHaveBeenCalled();
    });
    controller.reset();
    read.answer(new Map([[fileId, harness.pickedFiles[0]!]]));
    await loading;
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(controller.getSnapshot().filesById.size).toBe(0);
    controller.destroy();
  });
});
