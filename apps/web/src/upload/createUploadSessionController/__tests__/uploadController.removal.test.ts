import { UPLOAD_LIMITS } from "@memory-shoebox/shared";
import { describe, expect, it, vi } from "vitest";
import { makeUploadControllerHarness } from "./uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "./uploadSurfaceFixtureHelpers";

function _makeRemovalHarness(
  fileCount = 3,
): ReturnType<typeof makeUploadControllerHarness> {
  const detail = makeUploadSurfaceDetail();
  detail.files = detail.files.slice(0, fileCount);
  detail.edits = [
    {
      editId: "018f0000-0000-7000-8000-000000001001",
      kind: "tag",
      label: "Family",
      tag: null,
      person: null,
      milestone: null,
      targetCount: fileCount,
      createdAt: detail.createdAt,
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    },
  ];
  const harness = makeUploadControllerHarness(detail);
  harness.api.removeUploadFiles = vi.fn(async ({ fileIds }) => {
    harness.serverDetail.files = harness.serverDetail.files.filter((file) => {
      return !fileIds.includes(file.fileId);
    });
    harness.serverDetail.fileCount = harness.serverDetail.files.length;
    harness.serverDetail.totalBytes = harness.serverDetail.fileCount * 1000;
    harness.serverDetail.edits = harness.serverDetail.edits.map((edit) => {
      return { ...edit, targetCount: harness.serverDetail.files.length };
    });
  });
  return harness;
}

async function _loadLocalOriginals(
  harness: ReturnType<typeof _makeRemovalHarness>,
): Promise<void> {
  await harness.controller.loadSession(harness.serverDetail.sessionId);
  const snapshot = harness.controller.getSnapshot();
  snapshot.editTargets.set(
    snapshot.detail!.edits[0]!.editId,
    snapshot.detail!.files.map((file) => {
      return file.fileId;
    }),
  );
  snapshot.detail!.files.forEach((file) => {
    snapshot.filesById.set(
      file.fileId,
      new File(["photo"], file.originalFilename),
    );
    snapshot.fileActivityById.set(file.fileId, { kind: "preparing" });
    harness.controller.toggleFile(file.fileId);
  });
}

describe("draft file removal", () => {
  it("removes confirmed rows, handles, ticks and markers while keeping the surviving edit targets", async () => {
    const harness = _makeRemovalHarness();
    await _loadLocalOriginals(harness);
    const originalRows = harness.serverDetail.files;
    const edit = harness.serverDetail.edits[0]!;
    harness.controller.getSnapshot().editTargets.set(
      edit.editId,
      originalRows.map((file) => {
        return file.fileId;
      }),
    );
    await harness.controller.removeFiles([
      originalRows[0]!.fileId,
      originalRows[1]!.fileId,
    ]);
    const snapshot = harness.controller.getSnapshot();
    expect(
      snapshot.detail!.files.map((file) => {
        return file.fileId;
      }),
    ).toEqual([originalRows[2]!.fileId]);
    expect([...snapshot.filesById.keys()]).toEqual([originalRows[2]!.fileId]);
    expect([...snapshot.selectedFileIds]).toEqual([originalRows[2]!.fileId]);
    expect([...snapshot.fileActivityById.keys()]).toEqual([
      originalRows[2]!.fileId,
    ]);
    expect(snapshot.editTargets.get(edit.editId)).toEqual([
      originalRows[2]!.fileId,
    ]);
    expect(snapshot.detail!.state).toBe("draft");
    expect(snapshot.detail!.fileCount).toBe(1);
    expect(snapshot.hasUnconfirmedRemoval).toBe(false);
    expect(harness.engine.start).not.toHaveBeenCalled();
  });

  it("keeps files when removal is rejected and reports the error", async () => {
    const harness = _makeRemovalHarness();
    await _loadLocalOriginals(harness);
    harness.api.removeUploadFiles.mockRejectedValue(
      new Error("Removal failed"),
    );
    await expect(
      harness.controller.removeFiles([harness.serverDetail.files[0]!.fileId]),
    ).rejects.toThrow("Removal failed");
    expect(harness.controller.getSnapshot().detail!.files).toHaveLength(3);
    expect(harness.controller.getSnapshot().filesById.size).toBe(3);
    expect(harness.controller.getSnapshot().error?.operation).toBe("remove");
  });

  it("recovers a removal whose successful server answer was lost", async () => {
    const harness = _makeRemovalHarness();
    await _loadLocalOriginals(harness);
    const fileId = harness.serverDetail.files[0]!.fileId;
    const remove = harness.api.removeUploadFiles.getMockImplementation()!;
    harness.api.removeUploadFiles.mockImplementation(async (options) => {
      await remove(options);
      throw new Error("Lost answer");
    });
    await expect(harness.controller.removeFiles([fileId])).rejects.toThrow(
      "Lost answer",
    );
    expect(harness.controller.getSnapshot().detail!.files).toHaveLength(2);
    expect(harness.controller.getSnapshot().filesById.has(fileId)).toBe(false);
    expect(harness.controller.getSnapshot().selectedFileIds.has(fileId)).toBe(
      false,
    );
    expect(harness.controller.getSnapshot().hasUnconfirmedRemoval).toBe(false);
  });

  it("blocks submission after an uncertain removal until an authoritative read succeeds", async () => {
    const harness = _makeRemovalHarness();
    await _loadLocalOriginals(harness);
    const fileId = harness.serverDetail.files[0]!.fileId;
    const remove = harness.api.removeUploadFiles.getMockImplementation()!;
    harness.api.removeUploadFiles.mockImplementation(async (options) => {
      await remove(options);
      throw new Error("Lost answer");
    });
    harness.api.getUploadSession.mockRejectedValue(new Error("Offline"));
    await expect(
      harness.controller.removeFiles([harness.serverDetail.files[0]!.fileId]),
    ).rejects.toThrow("Lost answer");
    expect(harness.controller.getSnapshot().hasUnconfirmedRemoval).toBe(true);
    await expect(
      harness.controller.startUpload({ mode: "everyone", subjects: [] }),
    ).rejects.toThrow("Read this batch again");
    expect(harness.api.commitUploadSession).not.toHaveBeenCalled();
    harness.api.getUploadSession.mockResolvedValue(
      structuredClone(harness.serverDetail),
    );
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const recovered = harness.controller.getSnapshot();
    expect(recovered.hasUnconfirmedRemoval).toBe(false);
    expect(recovered.filesById.has(fileId)).toBe(false);
    expect(recovered.fileActivityById.has(fileId)).toBe(false);
    expect([...recovered.editTargets.values()].flat()).not.toContain(fileId);
    expect([...recovered.editTargets.values()].flat()).toHaveLength(2);
  });

  it("rejects removal from committed batches before making a request", async () => {
    const harness = _makeRemovalHarness();
    harness.serverDetail.state = "uploading";
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await expect(
      harness.controller.removeFiles([harness.serverDetail.files[0]!.fileId]),
    ).rejects.toThrow("draft");
    expect(harness.api.removeUploadFiles).not.toHaveBeenCalled();
  });

  it("removes selections larger than one request without losing successful chunks", async () => {
    const harness = makeUploadControllerHarness();
    await harness.controller.pickFiles(harness.pickedFiles);
    const fileIds = harness.serverDetail.files.map((file) => {
      return file.fileId;
    });
    let requestCount = 0;
    harness.api.removeUploadFiles = vi.fn(async (options) => {
      requestCount += 1;
      expect(options.fileIds.length).toBeLessThanOrEqual(
        UPLOAD_LIMITS.manifestEntriesPerRequest,
      );
      if (requestCount === 2) {
        throw new Error("Second chunk failed");
      }
      harness.serverDetail.files = harness.serverDetail.files.filter((file) => {
        return !options.fileIds.includes(file.fileId);
      });
    });
    await expect(harness.controller.removeFiles(fileIds)).rejects.toThrow(
      "Second chunk failed",
    );
    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.detail!.files).toHaveLength(
      fileIds.length - UPLOAD_LIMITS.manifestEntriesPerRequest,
    );
    expect(snapshot.filesById.has(fileIds[0]!)).toBe(false);
    expect(snapshot.filesById.has(fileIds.at(-1)!)).toBe(true);
  });
});
