import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import {
  makeWorkerAnswerFromRequest,
  makeWorkerFactoryFromAnswer,
} from "@/upload/createUploadEngine/__tests__/createUploadEngineTestHelpers";
import { makeSha256HexFromBlob } from "@/upload/makeSha256HexFromBlob/makeSha256HexFromBlob";
import {
  makeUploadControllerHarness,
  makeDeferredAnswer,
} from "./uploadControllerTestHelpers/uploadControllerTestHelpers";

describe("draft checksum checking", () => {
  it("declares original checksums before Upload, independent of filenames", async () => {
    const factory = makeWorkerFactoryFromAnswer(async (request) => {
      if (request.kind === "fingerprint") {
        return makeWorkerAnswerFromRequest(request);
      }
      if (request.kind !== "hash") {
        throw new Error("Draft checking must not generate derivatives.");
      }
      return {
        kind: "hashed",
        requestId: request.requestId,
        contentHash: await makeSha256HexFromBlob(request.file),
      };
    });
    const { controller, api, engine, serverDetail } =
      makeUploadControllerHarness(
        makeUploadSessionDetail(),
        factory.createMediaWorker,
      );
    const files = [
      new File(["same bytes"], "first.jpg", { type: "image/jpeg" }),
      new File(["same bytes"], "renamed.jpg", { type: "image/jpeg" }),
      new File(["other data"], "first.jpg", { type: "image/jpeg" }),
    ];
    const declare = api.putUploadManifest.getMockImplementation()!;
    api.putUploadManifest.mockImplementation(async (options) => {
      const response = await declare(options);
      serverDetail.files[0]!.state = "cancelled";
      serverDetail.files[0]!.duplicateReason = "archive";
      return response;
    });
    await controller.pickFiles(files);
    expect(
      api.putUploadManifest.mock.calls[0]![0].files.map((entry) => {
        return entry.contentHash;
      }),
    ).toEqual(
      ["same bytes", "same bytes", "other data"].map((bytes) => {
        return createHash("sha256").update(bytes).digest("hex");
      }),
    );
    expect(controller.getSnapshot().detail?.files[0]).toMatchObject({
      state: "cancelled",
      duplicateReason: "archive",
    });
    expect(controller.getSnapshot().phase).toBe("draft");
    expect(engine.start).not.toHaveBeenCalled();
    expect(api.commitUploadSession).not.toHaveBeenCalled();
  });

  it("keeps a failed checksum read retryable without declaring unchecked files", async () => {
    let attempts = 0;
    const factory = makeWorkerFactoryFromAnswer((request) => {
      if (request.kind === "fingerprint") {
        return makeWorkerAnswerFromRequest(request);
      }
      attempts += 1;
      return attempts === 1
        ? {
            kind: "failed",
            requestId: request.requestId,
            detail: "file unavailable",
          }
        : {
            kind: "hashed",
            requestId: request.requestId,
            contentHash: "a".repeat(64),
          };
    });
    const { controller, api, pickedFiles } = makeUploadControllerHarness(
      makeUploadSessionDetail(),
      factory.createMediaWorker,
    );
    await expect(controller.pickFiles(pickedFiles.slice(0, 1))).rejects.toThrow(
      "file unavailable",
    );
    expect(api.putUploadManifest).not.toHaveBeenCalled();
    await controller.pickFiles([]);
    expect(api.putUploadManifest.mock.calls[0]![0].files[0]?.contentHash).toBe(
      "a".repeat(64),
    );
    expect(
      factory.workers.every((worker) => {
        return worker.isTerminated;
      }),
    ).toBe(true);
  });

  it("ends pending checksum work on reset without publishing a late draft", async () => {
    const gate = makeDeferredAnswer<void>();
    const factory = makeWorkerFactoryFromAnswer(async (request) => {
      await gate.promise;
      return {
        kind: "hashed",
        requestId: request.requestId,
        contentHash: "b".repeat(64),
      };
    });
    const { controller, api, pickedFiles } = makeUploadControllerHarness(
      makeUploadSessionDetail(),
      factory.createMediaWorker,
    );
    const checking = controller.pickFiles(pickedFiles.slice(0, 1));
    await vi.waitFor(() => {
      return expect(factory.workers[0]?.requests).toHaveLength(1);
    });
    expect(controller.getSnapshot().phase).toBe("checking");
    controller.reset();
    gate.answer();
    await checking;
    expect(factory.workers[0]?.isTerminated).toBe(true);
    expect(api.putUploadManifest).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe("idle");
  });
});
