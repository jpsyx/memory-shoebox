import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import { describe, expect, it, vi } from "vitest";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "./uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "./uploadSurfaceFixtureHelpers";

describe("upload draft controller", () => {
  it("opening the surface does not create a draft", async () => {
    const { controller, api } = makeUploadControllerHarness();
    await controller.loadSession();
    expect(api.openUploadSession).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe("idle");
  });

  it("a 1,001-file pick declares 500/500/1", async () => {
    const { controller, api, pickedFiles } = makeUploadControllerHarness();
    await controller.pickFiles(pickedFiles);
    expect(
      api.putUploadManifest.mock.calls.map(([options]) => {
        return options.files.length;
      }),
    ).toEqual([500, 500, 1]);
    expect(controller.getSnapshot().detail?.files).toHaveLength(1001);
    expect(controller.getSnapshot().declaredCount).toBe(1001);
    expect(controller.getSnapshot().filesById.size).toBe(1001);
  });

  it("outcomes pair by clientRef", async () => {
    const { controller, api, pickedFiles } = makeUploadControllerHarness();
    const declare = api.putUploadManifest.getMockImplementation()!;
    api.putUploadManifest.mockImplementation(async (options) => {
      const response = await declare(options);
      return { ...response, outcomes: response.outcomes.toReversed() };
    });
    await controller.pickFiles(pickedFiles.slice(0, 2));
    const response = await api.putUploadManifest.mock.results[0]!.value;
    const secondOutcome = response.outcomes[0]!;
    const secondPickedFile = pickedFiles[1];
    expect(controller.getSnapshot().filesById.get(secondOutcome.fileId)).toBe(
      secondPickedFile,
    );
  });

  it("a failed later declaration preserves earlier files and retries pending refs", async () => {
    const { controller, api, pickedFiles } = makeUploadControllerHarness();
    const declare = api.putUploadManifest.getMockImplementation()!;
    api.putUploadManifest
      .mockImplementationOnce(declare)
      .mockRejectedValueOnce(new Error("offline"));
    await expect(controller.pickFiles(pickedFiles)).rejects.toThrow("offline");
    const snapshot = controller.getSnapshot();
    expect(snapshot.detail?.files).toHaveLength(500);
    expect(snapshot.error?.operation).toBe("declare");
    expect(snapshot.declaredCount).toBe(500);
    const failedRefs = api.putUploadManifest.mock.calls[1]![0].files.map(
      (file) => {
        return file.clientRef;
      },
    );
    await controller.pickFiles([]);
    expect(
      api.putUploadManifest.mock.calls[2]![0].files.map((file) => {
        return file.clientRef;
      }),
    ).toEqual(failedRefs);
    expect(controller.getSnapshot().detail?.files).toHaveLength(1001);
    expect(api.openUploadSession).toHaveBeenCalledTimes(1);
  });

  it("ticks never filter the manifest and include offscreen waiting rows", async () => {
    const detail = makeUploadSurfaceDetail();
    detail.files.slice(0, 52).forEach((file) => {
      file.state = "refused";
    });
    const { controller, api } = makeUploadControllerHarness(detail);
    await controller.loadSession(detail.sessionId);
    controller.selectAll();
    const snapshot = controller.getSnapshot();
    expect(snapshot.selectedFileIds.size).toBe(212);
    expect(snapshot.detail?.files).toHaveLength(264);
    controller.clearSelection();
    controller.selectDay("2026-10-02");
    expect(controller.getSnapshot().selectedFileIds.size).toBe(164);
    controller.toggleFile(detail.files[263]!.fileId);
    controller.toggleFile(detail.files[0]!.fileId);
    expect(controller.getSnapshot().selectedFileIds.size).toBe(163);
    expect(api.putUploadManifest).not.toHaveBeenCalled();
  });

  it.each(["draft", "uploading"] as const)(
    "open conflict offers the existing %s session without declaring unrelated picks",
    async (state) => {
      const found = makeUploadSurfaceDetail({ state });
      const { controller, api, pickedFiles } =
        makeUploadControllerHarness(found);
      api.openUploadSession.mockRejectedValueOnce(
        new ApiRequestError({
          status: 409,
          code: "upload_session_conflict",
          message: "Found another batch",
        }),
      );
      api.getCurrentUploadSession.mockResolvedValue(found);
      await expect(
        controller.pickFiles(pickedFiles.slice(0, 1)),
      ).rejects.toThrow("Found another batch");
      expect(api.getCurrentUploadSession).toHaveBeenCalled();
      expect(controller.getSnapshot().detail?.sessionId).toBe(found.sessionId);
      expect(controller.getSnapshot().phase).toBe(
        state === "draft" ? "draft" : "resume",
      );
      expect(controller.getSnapshot().error?.code).toBe(
        "upload_session_conflict",
      );
      expect(api.putUploadManifest).not.toHaveBeenCalled();
      expect(controller.getSnapshot().filesById.size).toBe(0);
    },
  );

  it("bounds header reading to two lanes and waits for each manifest answer", async () => {
    const { controller, api, pickedFiles, headerReader } =
      makeUploadControllerHarness();
    const gate = makeDeferredAnswer<void>();
    const read = headerReader.getMockImplementation()!;
    let active = 0;
    let peak = 0;
    headerReader.mockImplementation(async (options) => {
      active += 1;
      peak = Math.max(peak, active);
      await gate.promise;
      active -= 1;
      return read(options);
    });
    const declaration = controller.pickFiles(pickedFiles);
    await vi.waitFor(() => {
      expect(headerReader).toHaveBeenCalledTimes(2);
    });
    expect(api.putUploadManifest).not.toHaveBeenCalled();
    const firstWrite = makeDeferredAnswer<void>();
    const declare = api.putUploadManifest.getMockImplementation()!;
    api.putUploadManifest.mockImplementationOnce(async (options) => {
      const response = await declare(options);
      await firstWrite.promise;
      return response;
    });
    gate.answer();
    await vi.waitFor(() => {
      expect(api.putUploadManifest).toHaveBeenCalledTimes(1);
    });
    expect(peak).toBe(2);
    firstWrite.answer();
    await declaration;
    expect(api.putUploadManifest).toHaveBeenCalledTimes(3);
  });

  it("a failed later detail page retains the previous complete snapshot", async () => {
    const detail = makeUploadSurfaceDetail();
    const { controller, api } = makeUploadControllerHarness(detail);
    await controller.loadSession(detail.sessionId);
    const previousDetail = controller.getSnapshot().detail;
    api.getUploadSession
      .mockResolvedValueOnce({
        ...detail,
        files: detail.files.slice(0, 100),
        nextCursor: "page-two",
      })
      .mockRejectedValueOnce(new Error("later page unavailable"));
    await expect(controller.loadSession(detail.sessionId)).rejects.toThrow(
      "later page unavailable",
    );
    expect(controller.getSnapshot().detail).toBe(previousDetail);
    expect(controller.getSnapshot().detail?.files).toHaveLength(264);
    expect(controller.getSnapshot().error?.operation).toBe("load");
  });

  it("rejects conflicting mutations while busy", async () => {
    const detail = makeUploadSessionDetail();
    const { controller, api, pickedFiles } =
      makeUploadControllerHarness(detail);
    await controller.loadSession(detail.sessionId);
    const write = makeDeferredAnswer<void>();
    const declare = api.putUploadManifest.getMockImplementation()!;
    api.putUploadManifest.mockImplementationOnce(async (options) => {
      const response = await declare(options);
      await write.promise;
      return response;
    });
    const pick = controller.pickFiles(pickedFiles.slice(0, 1));
    await vi.waitFor(() => {
      expect(api.putUploadManifest).toHaveBeenCalledTimes(1);
    });
    await expect(controller.cancelDraft()).rejects.toThrow("busy");
    expect(api.cancelUploadSession).not.toHaveBeenCalled();
    write.answer();
    await pick;
  });

  it("repeated outcome file ids retain just one transfer handle", async () => {
    const { controller, api, pickedFiles } = makeUploadControllerHarness();
    const declare = api.putUploadManifest.getMockImplementation()!;
    api.putUploadManifest.mockImplementation(async (options) => {
      const response = await declare(options);
      return {
        ...response,
        outcomes: response.outcomes.map((outcome) => {
          return { ...outcome, fileId: response.outcomes[0]!.fileId };
        }),
      };
    });
    await controller.pickFiles(pickedFiles.slice(0, 2));
    expect(controller.getSnapshot().filesById.size).toBe(1);
    expect([...controller.getSnapshot().filesById.values()]).toEqual([
      pickedFiles[0],
    ]);
  });

  it("retry after a failed final read refreshes without redeclaring saved picks", async () => {
    const { controller, api, pickedFiles } = makeUploadControllerHarness();
    api.getUploadSession.mockRejectedValueOnce(new Error("read offline"));
    await expect(controller.pickFiles(pickedFiles.slice(0, 1))).rejects.toThrow(
      "read offline",
    );
    await controller.pickFiles([]);
    expect(controller.getSnapshot().detail?.files).toHaveLength(1);
    expect(api.putUploadManifest).toHaveBeenCalledTimes(1);
  });

  it("publishes stable snapshots and allows unsubscribe", async () => {
    const { controller, pickedFiles } = makeUploadControllerHarness();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
    await controller.pickFiles(pickedFiles.slice(0, 1));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    const listenerCallCount = listener.mock.calls.length;
    controller.selectAll();
    expect(listener).toHaveBeenCalledTimes(listenerCallCount);
  });
});
