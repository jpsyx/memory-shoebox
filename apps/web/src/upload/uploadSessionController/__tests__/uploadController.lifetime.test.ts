import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import {
  readUploadRecoveryHint,
  writeUploadRecoveryHint,
} from "../uploadRecoveryStorage/uploadRecoveryStorage";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "./uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "./uploadSurfaceFixtures";

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

describe("upload controller session lifetime", () => {
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
});
