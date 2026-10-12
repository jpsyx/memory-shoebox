import { describe, expect, it, vi } from "vitest";
import { appConfig } from "../../../../../../app.config";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import {
  makeWorkerAnswerFromRequest,
  makeWorkerFactoryFromAnswer,
} from "@/upload/createUploadEngine/__tests__/createUploadEngineTestHelpers";
import {
  makeUploadControllerHarness,
  makeDeferredAnswer,
} from "./uploadControllerTestHelpers/uploadControllerTestHelpers";

const FINGERPRINT = `v1:${"0".repeat(16)}:${"0".repeat(60)}:${"ab".repeat(192)}`;

function _makeFingerprintWorker(): ReturnType<
  typeof makeWorkerFactoryFromAnswer
> {
  return makeWorkerFactoryFromAnswer((request) => {
    return request.kind === "fingerprint"
      ? {
          kind: "fingerprinted",
          requestId: request.requestId,
          visualFingerprint: FINGERPRINT,
          usedWasmDecoder: false,
        }
      : makeWorkerAnswerFromRequest(request);
  });
}

describe("draft visual duplicate checking", () => {
  it("declares every pick with cached photo evidence and a stable independent identity", async () => {
    const factory = _makeFingerprintWorker();
    const { controller, api, pickedFiles } = makeUploadControllerHarness(
      makeUploadSessionDetail(),
      factory.createMediaWorker,
    );
    api.putUploadManifest.mockRejectedValueOnce(new Error("connection lost"));
    await expect(
      controller.pickFiles([pickedFiles[0]!, pickedFiles[0]!]),
    ).rejects.toThrow("connection lost");
    const failedEntries = api.putUploadManifest.mock.calls[0]![0].files;
    expect(
      failedEntries.map((entry) => {
        return entry.visualFingerprint;
      }),
    ).toEqual([FINGERPRINT, FINGERPRINT]);
    expect(
      failedEntries.every((entry) => {
        return entry.pickId === entry.clientRef;
      }),
    ).toBe(true);
    expect(
      new Set(
        failedEntries.map((entry) => {
          return entry.pickId;
        }),
      ).size,
    ).toBe(2);
    await controller.pickFiles([]);
    expect(api.putUploadManifest.mock.calls[1]![0].files).toEqual(
      failedEntries,
    );
    expect(
      factory.workers
        .flatMap((worker) => {
          return worker.requests;
        })
        .map((request) => {
          return request.kind;
        })
        .sort(),
    ).toEqual(["fingerprint", "fingerprint", "hash", "hash"]);
    expect([...controller.getSnapshot().filesById.values()]).toEqual([
      pickedFiles[0],
      pickedFiles[0],
    ]);
  });

  it("declares decoded dimensions when the photo header had none", async () => {
    const factory = makeWorkerFactoryFromAnswer((request) => {
      return request.kind === "fingerprint"
        ? {
            kind: "fingerprinted",
            requestId: request.requestId,
            visualFingerprint: FINGERPRINT,
            usedWasmDecoder: false,
            originalSize: { width: 1200, height: 800 },
          }
        : makeWorkerAnswerFromRequest(request);
    });
    const { controller, api, pickedFiles, headerReader } =
      makeUploadControllerHarness(
        makeUploadSessionDetail(),
        factory.createMediaWorker,
      );
    const readHeader = headerReader.getMockImplementation()!;
    headerReader.mockImplementation(async (options) => {
      return { ...(await readHeader(options)), width: null, height: null };
    });
    await controller.pickFiles(pickedFiles.slice(0, 1));
    expect(api.putUploadManifest.mock.calls[0]![0].files[0]).toMatchObject({
      visualFingerprint: FINGERPRINT,
      width: 1200,
      height: 800,
    });
  });

  it("retains SHA-256 when visual decoding cannot supply a fingerprint", async () => {
    const factory = makeWorkerFactoryFromAnswer((request) => {
      return request.kind === "fingerprint"
        ? {
            kind: "fingerprinted",
            requestId: request.requestId,
            visualFingerprint: undefined,
            usedWasmDecoder: false,
          }
        : makeWorkerAnswerFromRequest(request);
    });
    const { controller, api, pickedFiles } = makeUploadControllerHarness(
      makeUploadSessionDetail(),
      factory.createMediaWorker,
    );
    await controller.pickFiles(pickedFiles.slice(0, 1));
    expect(api.putUploadManifest.mock.calls[0]![0].files[0]).toMatchObject({
      contentHash: "d".repeat(64),
    });
    expect(
      api.putUploadManifest.mock.calls[0]![0].files[0]?.visualFingerprint,
    ).toBeUndefined();
    expect(
      api.putUploadManifest.mock.calls[0]![0].files[0]?.width,
    ).toBeUndefined();
    expect(
      api.putUploadManifest.mock.calls[0]![0].files[0]?.height,
    ).toBeUndefined();
    expect(
      factory.workers
        .flatMap((worker) => {
          return worker.requests;
        })
        .map((request) => {
          return request.kind;
        }),
    ).toEqual(["hash", "fingerprint"]);
  });

  it("does not decode video or refused files and still hashes accepted video", async () => {
    const factory = _makeFingerprintWorker();
    const { controller, api } = makeUploadControllerHarness(
      makeUploadSessionDetail(),
      factory.createMediaWorker,
    );
    await controller.pickFiles([
      new File(["video"], "clip.mp4", { type: "video/mp4" }),
      new File(["text"], "notes.txt", { type: "text/plain" }),
      new File([], "empty.jpg", { type: "image/jpeg" }),
    ]);
    expect(
      factory.workers
        .flatMap((worker) => {
          return worker.requests;
        })
        .map((request) => {
          return request.kind;
        }),
    ).toEqual(["hash"]);
    expect(api.putUploadManifest.mock.calls[0]![0].files).toHaveLength(3);
  });

  it("ends a fingerprint in flight on reset without publishing late results", async () => {
    const gate = makeDeferredAnswer<void>();
    const factory = makeWorkerFactoryFromAnswer(async (request) => {
      if (request.kind !== "fingerprint") {
        return makeWorkerAnswerFromRequest(request);
      }
      await gate.promise;
      return {
        kind: "fingerprinted",
        requestId: request.requestId,
        visualFingerprint: FINGERPRINT,
        usedWasmDecoder: false,
      };
    });
    const { controller, api, pickedFiles } = makeUploadControllerHarness(
      makeUploadSessionDetail(),
      factory.createMediaWorker,
    );
    const picking = controller.pickFiles(pickedFiles.slice(0, 1));
    await vi.waitFor(() => {
      expect(
        factory.workers
          .flatMap((worker) => {
            return worker.requests;
          })
          .some((request) => {
            return request.kind === "fingerprint";
          }),
      ).toBe(true);
    });
    controller.reset();
    gate.answer();
    await picking;
    expect(api.putUploadManifest).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(
      factory.workers.every((worker) => {
        return worker.isTerminated;
      }),
    ).toBe(true);
  });

  it("recycles each checking lane after bounded successful or failed HEIC decodes", async () => {
    const factory = makeWorkerFactoryFromAnswer((request) => {
      return request.kind === "fingerprint"
        ? {
            kind: "fingerprinted",
            requestId: request.requestId,
            visualFingerprint: undefined,
            usedWasmDecoder: true,
          }
        : makeWorkerAnswerFromRequest(request);
    });
    const { controller } = makeUploadControllerHarness(
      makeUploadSessionDetail(),
      factory.createMediaWorker,
    );
    await controller.pickFiles(
      Array.from(
        { length: appConfig.upload.heicWorkerRecycleCount * 2 + 1 },
        (_, index) => {
          return new File(["heic"], `${index}.heic`, { type: "image/heic" });
        },
      ),
    );
    expect(factory.workers.length).toBeGreaterThan(2);
    expect(
      factory.workers.every((worker) => {
        return (
          worker.requests.filter((request) => {
            return request.kind === "fingerprint";
          }).length <= appConfig.upload.heicWorkerRecycleCount
        );
      }),
    ).toBe(true);
    expect(
      factory.workers.every((worker) => {
        return worker.isTerminated;
      }),
    ).toBe(true);
  });
});
