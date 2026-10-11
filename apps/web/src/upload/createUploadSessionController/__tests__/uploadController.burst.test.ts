import type { UploadSessionDetail } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { createUploadSessionController } from "../createUploadSessionController";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "./uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "./uploadSurfaceFixtureHelpers";

function _makeBurstHarness(
  state: "draft" | "settled" = "draft",
): ReturnType<typeof makeUploadControllerHarness> {
  return makeUploadControllerHarness(
    makeUploadSurfaceDetail({
      state,
      files: [0, 1, 2].map((position) => {
        return {
          ...makeUploadFileFromPosition(position),
          state: state === "draft" ? "waiting" : "done",
          burst: { groupId: "burst-one", photoCount: 3, isExcluded: false },
        };
      }),
    }),
  );
}

describe("upload burst membership", () => {
  it("notifies the shell only after a saved burst change", async () => {
    const harness = _makeBurstHarness("settled");
    let savedChanges = 0;
    const controller = createUploadSessionController({
      memberId: harness.serverDetail.uploadedBy.memberId,
      api: harness.api,
      storage: harness.storage,
      onBurstChanged: () => {
        savedChanges += 1;
      },
    });
    await controller.loadSession(harness.serverDetail.sessionId);
    const fileId = harness.serverDetail.files[0]!.fileId;
    await controller.setFileBurst({ fileId, excluded: true });
    expect(savedChanges).toBe(1);
    harness.api.setUploadFileBurst.mockRejectedValueOnce(new Error("offline"));
    await expect(
      controller.setFileBurst({ fileId, excluded: false }),
    ).rejects.toThrow("offline");
    expect(savedChanges).toBe(1);
    controller.destroy();
    harness.controller.destroy();
  });

  it.each(["draft", "settled"] as const)(
    "removes and returns a photo in a %s batch without losing files or picks",
    async (state) => {
      const harness = _makeBurstHarness(state);
      await harness.controller.loadSession(harness.serverDetail.sessionId);
      const fileId = harness.serverDetail.files[0]!.fileId;
      const localFile = new File(["photo"], "photo.jpg");
      harness.controller.getSnapshot().filesById.set(fileId, localFile);
      if (state === "draft") {
        harness.controller.toggleFile(fileId);
      }

      await harness.controller.setFileBurst({ fileId, excluded: true });
      expect(
        harness.controller.getSnapshot().detail!.files[0]!.burst?.isExcluded,
      ).toBe(true);
      expect(harness.controller.getSnapshot().detail!.files).toHaveLength(3);
      expect(harness.controller.getSnapshot().filesById.get(fileId)).toBe(
        localFile,
      );
      expect(harness.controller.getSnapshot().selectedFileIds.has(fileId)).toBe(
        state === "draft",
      );

      await harness.controller.setFileBurst({ fileId, excluded: false });
      expect(
        harness.controller.getSnapshot().detail!.files[0]!.burst?.isExcluded,
      ).toBe(false);
      harness.controller.destroy();
    },
  );

  it("blocks commit while the burst change is pending", async () => {
    const harness = _makeBurstHarness();
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const pending = makeDeferredAnswer<UploadSessionDetail>();
    harness.api.setUploadFileBurst.mockReturnValueOnce(pending.promise);
    const update = harness.controller.setFileBurst({
      fileId: harness.serverDetail.files[0]!.fileId,
      excluded: true,
    });
    expect(harness.controller.getSnapshot().isBusy).toBe(true);
    await expect(
      harness.controller.startUpload({ mode: "everyone", subjects: [] }),
    ).rejects.toThrow("busy");
    expect(harness.serverDetail.state).toBe("draft");
    pending.answer(structuredClone(harness.serverDetail));
    await update;
    expect(harness.controller.getSnapshot().isBusy).toBe(false);
    harness.controller.destroy();
  });

  it("keeps the previous membership and exposes a retryable error when the write fails", async () => {
    const harness = _makeBurstHarness();
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    harness.api.setUploadFileBurst.mockRejectedValueOnce(new Error("offline"));
    await expect(
      harness.controller.setFileBurst({
        fileId: harness.serverDetail.files[0]!.fileId,
        excluded: true,
      }),
    ).rejects.toThrow("offline");
    expect(harness.controller.getSnapshot()).toMatchObject({
      isBusy: false,
      error: { operation: "burst" },
    });
    expect(
      harness.controller.getSnapshot().detail!.files[0]!.burst?.isExcluded,
    ).toBe(false);
    harness.controller.destroy();
  });

  it("reads every page after a change so later burst photos are retained", async () => {
    const harness = _makeBurstHarness();
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const changed = structuredClone(harness.serverDetail);
    changed.files[0]!.burst!.isExcluded = true;
    harness.api.setUploadFileBurst.mockResolvedValueOnce({
      ...changed,
      files: changed.files.slice(0, 1),
      nextCursor: "page-two",
    });
    harness.api.getUploadSession.mockImplementation(async ({ cursor }) => {
      return {
        ...changed,
        files: cursor ? changed.files.slice(1) : changed.files.slice(0, 1),
        nextCursor: cursor ? null : "page-two",
      };
    });

    await harness.controller.setFileBurst({
      fileId: changed.files[0]!.fileId,
      excluded: true,
    });

    expect(harness.controller.getSnapshot().detail!.files).toHaveLength(3);
    expect(
      harness.controller.getSnapshot().detail!.files[0]!.burst!.isExcluded,
    ).toBe(true);
    harness.controller.destroy();
  });
});
