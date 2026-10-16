import type {
  PutUploadManifestResponse,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { makeUploadControllerHarness } from "./uploadControllerTestHelpers/uploadControllerTestHelpers";
import type { UploadControllerHarness } from "./uploadControllerTestHelpers/uploadControllerTestHelpers.types";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "./uploadSurfaceFixtureHelpers";

async function _makeDateHarness(): Promise<UploadControllerHarness> {
  const files = [0, 1].map((position) => {
    return {
      ...makeUploadFileFromPosition(position),
      captureSource: "file_mtime" as const,
      capturedOn: "2026-10-01",
    };
  });
  const harness = makeUploadControllerHarness(
    makeUploadSurfaceDetail({
      files,
      fileCount: 2,
      undated: {
        fileCount: 2,
        captureSource: "file_mtime",
        files: files.map(({ fileId, originalFilename, capturedOn }) => {
          return {
            fileId,
            originalFilename,
            capturedOn,
          };
        }),
      },
    }),
  );
  await harness.controller.loadSession(harness.serverDetail.sessionId);
  harness.api.putUploadManifest.mockResolvedValue({
    sessionId: harness.serverDetail.sessionId,
    fileCount: 2,
    totalBytes: 2000,
    outcomes: [],
  });
  return harness;
}

function _makeConfirmedDetailFromDetail(
  options: Readonly<{
    detail: UploadSessionDetail;
    fileId: string;
    capturedOn: string;
  }>,
): UploadSessionDetail {
  const { detail, fileId, capturedOn } = options;
  const undatedFiles = detail.undated!.files.filter((file) => {
    return file.fileId !== fileId;
  });
  return {
    ...detail,
    files: detail.files.map((file) => {
      return file.fileId === fileId
        ? { ...file, captureSource: "uploader_set", capturedOn }
        : file;
    }),
    undated: {
      ...detail.undated!,
      files: undatedFiles,
      fileCount: undatedFiles.length,
    },
  };
}

describe("capture date controller boundary", () => {
  it("sends both calendar choices at UTC midnight and stays busy until the manifest call settles", async () => {
    const harness = await _makeDateHarness();
    const choices = harness.serverDetail.files.map((file, position) => {
      return {
        fileId: file.fileId,
        capturedOn: `2026-09-${15 + position}`,
      };
    });
    const pending = Promise.withResolvers<PutUploadManifestResponse>();
    harness.api.putUploadManifest.mockReturnValueOnce(pending.promise);
    const saving = harness.controller.amendDates(choices);
    expect(harness.controller.getSnapshot().isBusy).toBe(true);
    expect(harness.api.putUploadManifest).toHaveBeenCalledExactlyOnceWith({
      sessionId: harness.serverDetail.sessionId,
      files: choices.map((choice, position) => {
        return {
          clientRef: choice.fileId,
          fileId: choice.fileId,
          originalFilename:
            harness.serverDetail.files[position]!.originalFilename,
          declaredContentType: "image/jpeg",
          declaredBytes: 1000,
          contentHash: null,
          capturedAt: `${choice.capturedOn}T00:00:00.000Z`,
        };
      }),
    });
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(1);
    pending.resolve({
      sessionId: harness.serverDetail.sessionId,
      fileCount: 2,
      totalBytes: 2000,
      outcomes: [],
    });
    await saving;
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(2);
    expect(harness.controller.getSnapshot().isBusy).toBe(false);
    expect(harness.headerReader).not.toHaveBeenCalled();
    harness.controller.destroy();
  });

  it("preserves authoritative dates after rejection and resends the same choices on retry", async () => {
    const harness = await _makeDateHarness();
    const detail = harness.controller.getSnapshot().detail;
    const choices = harness.serverDetail.files.map((file) => {
      return {
        fileId: file.fileId,
        capturedOn: "2026-09-18",
      };
    });
    harness.api.putUploadManifest.mockRejectedValueOnce(
      new Error("Save interrupted"),
    );
    await expect(harness.controller.amendDates(choices)).rejects.toThrow(
      "Save interrupted",
    );
    expect(harness.controller.getSnapshot().detail).toEqual(detail);
    expect(harness.controller.getSnapshot().isBusy).toBe(false);
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(1);
    await harness.controller.amendDates(choices);
    expect(harness.api.putUploadManifest).toHaveBeenCalledTimes(2);
    expect(harness.api.putUploadManifest.mock.calls[1]).toEqual(
      harness.api.putUploadManifest.mock.calls[0],
    );
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(2);
    harness.controller.destroy();
  });

  it("removes only rows confirmed by the detail refresh, including a later final confirmation", async () => {
    const harness = await _makeDateHarness();
    const firstChoice = {
      fileId: harness.serverDetail.files[0]!.fileId,
      capturedOn: "2026-09-18",
    };
    const secondChoice = {
      fileId: harness.serverDetail.files[1]!.fileId,
      capturedOn: "2026-09-19",
    };
    const partial = _makeConfirmedDetailFromDetail({
      detail: harness.serverDetail,
      ...firstChoice,
    });
    harness.api.getUploadSession.mockResolvedValueOnce(partial);
    await harness.controller.amendDates([firstChoice, secondChoice]);
    expect(
      harness.controller.getSnapshot().detail?.undated?.files.map((file) => {
        return file.fileId;
      }),
    ).toEqual([secondChoice.fileId]);
    expect(harness.controller.getSnapshot().detail?.files[0]).toMatchObject({
      capturedOn: firstChoice.capturedOn,
      captureSource: "uploader_set",
    });
    expect(
      harness.controller.getSnapshot().detail?.files[1]?.captureSource,
    ).toBe("file_mtime");
    const complete = _makeConfirmedDetailFromDetail({
      detail: partial,
      ...secondChoice,
    });
    harness.api.getUploadSession.mockResolvedValueOnce(complete);
    await harness.controller.amendDates([secondChoice]);
    expect(harness.controller.getSnapshot().detail?.undated?.fileCount).toBe(0);
    expect(harness.controller.getSnapshot().detail?.files[1]).toMatchObject({
      capturedOn: secondChoice.capturedOn,
      captureSource: "uploader_set",
    });
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(3);
    harness.controller.destroy();
  });
});
