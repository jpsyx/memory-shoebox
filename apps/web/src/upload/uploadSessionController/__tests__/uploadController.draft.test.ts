import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import {
  makeUploadControllerHarness,
  makeDeferredAnswer,
} from "./uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "./uploadSurfaceFixtures";
import {
  readUploadRecoveryHint,
  writeUploadRecoveryHint,
} from "../uploadRecoveryStorage/uploadRecoveryStorage";
import type { UploadSessionDetail } from "@memory-shoebox/shared";

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

  it("reset ignores late answers and permits a new operation", async () => {
    const { controller, api } = makeUploadControllerHarness();
    const oldRead = makeDeferredAnswer<UploadSessionDetail>();
    api.getUploadSession.mockReturnValueOnce(oldRead.promise);
    const read = controller.loadSession("old-session");
    controller.reset();
    oldRead.answer(makeUploadSurfaceDetail());
    await read;
    expect(controller.getSnapshot().detail).toBeUndefined();
    expect(controller.getSnapshot().phase).toBe("idle");
  });

  it("cancel touches only a draft", async () => {
    const draft = makeUploadSurfaceDetail();
    const { controller, api } = makeUploadControllerHarness(draft);
    await controller.loadSession(draft.sessionId);
    await controller.cancelDraft();
    expect(api.cancelUploadSession).toHaveBeenCalledWith(draft.sessionId);
    expect(api.commitUploadSession).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe("idle");
  });

  it("a committed batch cannot be cancelled or receive fresh picks", async () => {
    const found = makeUploadSurfaceDetail({ state: "uploading" });
    const { controller, api, pickedFiles } = makeUploadControllerHarness(found);
    await controller.loadSession(found.sessionId);
    await expect(controller.cancelDraft()).rejects.toThrow();
    await expect(
      controller.pickFiles(pickedFiles.slice(0, 1)),
    ).rejects.toThrow();
    controller.selectAll();
    expect(controller.getSnapshot().selectedFileIds.size).toBe(0);
    expect(api.cancelUploadSession).not.toHaveBeenCalled();
    expect(api.putUploadManifest).not.toHaveBeenCalled();
  });

  it("destroy calls neither DELETE nor commit and ignores late answers", async () => {
    const { controller, api } = makeUploadControllerHarness();
    const oldRead = makeDeferredAnswer<UploadSessionDetail>();
    api.getUploadSession.mockReturnValueOnce(oldRead.promise);
    const read = controller.loadSession("old-session");
    controller.destroy();
    oldRead.answer(makeUploadSurfaceDetail());
    await read;
    expect(controller.getSnapshot().detail).toBeUndefined();
    expect(api.cancelUploadSession).not.toHaveBeenCalled();
    expect(api.commitUploadSession).not.toHaveBeenCalled();
    await expect(controller.loadSession()).rejects.toThrow();
  });

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

  it("reset stops late opening from declaring into a replaced batch", async () => {
    const { controller, api, pickedFiles } = makeUploadControllerHarness();
    const opening = makeDeferredAnswer<UploadSessionDetail>();
    api.openUploadSession.mockReturnValueOnce(opening.promise);
    const oldPick = controller.pickFiles(pickedFiles.slice(0, 1));
    controller.reset();
    const newerRead = makeDeferredAnswer<UploadSessionDetail>();
    api.getUploadSession.mockReturnValueOnce(newerRead.promise);
    const newLoad = controller.loadSession("new-session");
    opening.answer(makeUploadSessionDetail());
    await oldPick;
    expect(api.putUploadManifest).not.toHaveBeenCalled();
    expect(controller.getSnapshot().isBusy).toBe(true);
    newerRead.answer(makeUploadSurfaceDetail({ sessionId: "new-session" }));
    await newLoad;
    expect(controller.getSnapshot().detail?.sessionId).toBe("new-session");
    expect(controller.getSnapshot().filesById.size).toBe(0);
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

  it("destroy preserves the remembered batch while reset clears it", async () => {
    const detail = makeUploadSurfaceDetail();
    const { controller, storage } = makeUploadControllerHarness(detail);
    const hintOptions = { storage, memberId: detail.uploadedBy.memberId };
    await controller.loadSession(detail.sessionId);
    controller.destroy();
    expect(readUploadRecoveryHint(hintOptions)?.sessionId).toBe(
      detail.sessionId,
    );
    const replacement = makeUploadControllerHarness(detail);
    await replacement.controller.loadSession(detail.sessionId);
    replacement.controller.reset();
    expect(
      readUploadRecoveryHint({
        storage: replacement.storage,
        memberId: detail.uploadedBy.memberId,
      }),
    ).toBeUndefined();
  });

  it("loads a remembered settled batch when there is no current open batch", async () => {
    const detail = makeUploadSurfaceDetail({ state: "settled" });
    const { controller, api, storage } = makeUploadControllerHarness(detail);
    writeUploadRecoveryHint({
      storage,
      memberId: detail.uploadedBy.memberId,
      hint: { version: 1, sessionId: detail.sessionId, editTargets: {} },
    });
    await controller.loadSession();
    expect(controller.getSnapshot().detail?.sessionId).toBe(detail.sessionId);
    expect(api.openUploadSession).not.toHaveBeenCalled();
  });

  it("prefers a current batch to a remembered batch and uses complete paged rows", async () => {
    const detail = makeUploadSurfaceDetail();
    const { controller, api, storage } = makeUploadControllerHarness(detail);
    writeUploadRecoveryHint({
      storage,
      memberId: detail.uploadedBy.memberId,
      hint: {
        version: 1,
        sessionId: "018f0000-0000-7000-8000-00000000c999",
        editTargets: {},
      },
    });
    api.getCurrentUploadSession.mockResolvedValue(detail);
    api.getUploadSession
      .mockResolvedValueOnce({
        ...detail,
        files: detail.files.slice(0, 100),
        nextCursor: "more-files",
      })
      .mockResolvedValueOnce({
        ...detail,
        files: detail.files.slice(100),
        nextCursor: null,
      });
    await controller.loadSession();
    controller.selectAll();
    expect(controller.getSnapshot().detail?.files).toHaveLength(264);
    expect(controller.getSnapshot().selectedFileIds.size).toBe(264);
    expect(api.getUploadSession.mock.calls).toHaveLength(2);
    expect(api.getUploadSession).toHaveBeenLastCalledWith({
      sessionId: detail.sessionId,
      cursor: "more-files",
      limit: 500,
    });
  });

  it("loading another batch releases undeclared picks from the previous draft", async () => {
    const { controller, api, pickedFiles } = makeUploadControllerHarness();
    api.putUploadManifest.mockRejectedValueOnce(new Error("offline"));
    await expect(controller.pickFiles(pickedFiles.slice(0, 1))).rejects.toThrow(
      "offline",
    );
    const replacement = makeUploadSessionDetail({
      sessionId: "018f0000-0000-7000-8000-00000000c002",
    });
    api.getUploadSession.mockResolvedValue(replacement);
    await controller.loadSession(replacement.sessionId);
    await controller.pickFiles(pickedFiles.slice(1, 2));
    expect(
      api.putUploadManifest.mock.calls[1]![0].files.map((file) => {
        return file.originalFilename;
      }),
    ).toEqual(["IMG_1.jpg"]);
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

  it("no-session loading clears saved counts, activity and pending picks", async () => {
    const harness = makeUploadControllerHarness();
    const { controller, api, pickedFiles } = harness;
    const declare = api.putUploadManifest.getMockImplementation()!;
    api.putUploadManifest
      .mockImplementationOnce(declare)
      .mockRejectedValueOnce(new Error("offline"));
    await expect(
      controller.pickFiles(pickedFiles.slice(0, 501)),
    ).rejects.toThrow("offline");
    const previousActivity = controller.getSnapshot().fileActivityById;
    expect(controller.getSnapshot().declaredCount).toBe(500);
    const idleBusyStates: boolean[] = [];
    const unsubscribe = controller.subscribe(() => {
      const snapshot = controller.getSnapshot();
      if (snapshot.phase === "idle") {
        idleBusyStates.push(snapshot.isBusy);
      }
    });
    await _loadAfterDraftDisappears(harness);
    unsubscribe();
    expect(idleBusyStates).toEqual([true, false]);
    const snapshot = controller.getSnapshot();
    expect(snapshot.phase).toBe("idle");
    expect(snapshot.detail).toBeUndefined();
    expect(snapshot.declaredCount).toBe(0);
    expect(snapshot.declarationTotal).toBe(0);
    expect(snapshot.filesById.size).toBe(0);
    expect(snapshot.fileActivityById.size).toBe(0);
    expect(snapshot.fileActivityById).not.toBe(previousActivity);
    const freshDraft = makeUploadSessionDetail({
      sessionId: "018f0000-0000-7000-8000-00000000c002",
    });
    api.openUploadSession.mockResolvedValueOnce(freshDraft);
    api.getUploadSession.mockResolvedValueOnce(freshDraft);
    await controller.pickFiles(pickedFiles.slice(501, 502));
    expect(
      api.putUploadManifest.mock.calls[2]![0].files.map((file) => {
        return file.originalFilename;
      }),
    ).toEqual(["IMG_501.jpg"]);
    expect(api.putUploadManifest.mock.calls[2]![0].sessionId).toBe(
      freshDraft.sessionId,
    );
  });

  it("no-session loading clears a pending declaration read", async () => {
    const harness = makeUploadControllerHarness();
    const { controller, api, pickedFiles } = harness;
    api.getUploadSession.mockRejectedValueOnce(new Error("read offline"));
    await expect(controller.pickFiles(pickedFiles.slice(0, 1))).rejects.toThrow(
      "read offline",
    );
    await _loadAfterDraftDisappears(harness);
    await controller.pickFiles([]);
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(controller.getSnapshot().detail).toBeUndefined();
    expect(api.openUploadSession).toHaveBeenCalledTimes(1);
    expect(api.getUploadSession).toHaveBeenCalledTimes(2);
  });

  it("publishes stable snapshots and allows unsubscribe", async () => {
    const { controller, pickedFiles } = makeUploadControllerHarness();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
    await controller.pickFiles(pickedFiles.slice(0, 1));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    const count = listener.mock.calls.length;
    controller.selectAll();
    expect(listener).toHaveBeenCalledTimes(count);
  });
});

async function _loadAfterDraftDisappears(
  harness: Readonly<ReturnType<typeof makeUploadControllerHarness>>,
): Promise<void> {
  harness.api.getCurrentUploadSession.mockResolvedValueOnce(null);
  harness.api.getUploadSession.mockRejectedValueOnce(
    new ApiRequestError({
      status: 404,
      code: "not_found",
      message: "The draft was cancelled elsewhere.",
    }),
  );
  await harness.controller.loadSession();
}
