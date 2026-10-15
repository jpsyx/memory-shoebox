import { describe, expect, it, vi } from "vitest";
import { createUploadDecodeCoordinator } from "./createUploadDecodeCoordinator";

function _deferred() {
  return Promise.withResolvers<void>();
}

describe("upload decoder scheduling", () => {
  it("active work overtakes queued previews without preempting the owner", async () => {
    const coordinator = createUploadDecodeCoordinator();
    const held = _deferred();
    const order: string[] = [];
    const run = (
      name: string,
      priority: "active" | "preview",
      work = async () => {},
    ) => {
      return coordinator.run({
        priority,
        signal: new AbortController().signal,
        work: async () => {
          order.push(name);
          await work();
        },
      });
    };
    const first = run("owner", "preview", () => {
      return held.promise;
    });
    const preview = run("preview", "preview");
    const active = run("active", "active");
    expect(order).toEqual(["owner"]);
    held.resolve();
    await Promise.all([first, preview, active]);
    expect(order).toEqual(["owner", "active", "preview"]);
  });

  it("cancels queued work while another file owns the decoder", async () => {
    const coordinator = createUploadDecodeCoordinator();
    const held = _deferred();
    const first = coordinator.run({
      priority: "active",
      signal: new AbortController().signal,
      work: () => {
        return held.promise;
      },
    });
    const controller = new AbortController();
    let hasDecoded = false;
    const queued = coordinator.run({
      priority: "active",
      signal: controller.signal,
      work: async () => {
        hasDecoded = true;
      },
    });
    const rejected = expect(queued).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejected;
    held.resolve();
    await first;
    expect(hasDecoded).toBe(false);
  });

  it("keeps an aborted noncancellable decode's slot until actual settlement", async () => {
    const coordinator = createUploadDecodeCoordinator();
    const held = _deferred();
    const controller = new AbortController();
    const first = coordinator.run({
      priority: "active",
      signal: controller.signal,
      work: () => {
        return held.promise;
      },
    });
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejected;
    let hasStarted = false;
    const second = coordinator.run({
      priority: "active",
      signal: new AbortController().signal,
      work: async () => {
        hasStarted = true;
      },
    });
    await Promise.resolve();
    expect(hasStarted).toBe(false);
    held.resolve();
    await second;
    expect(hasStarted).toBe(true);
  });

  it("failure allows the next job to run and disposal rejects waiting work", async () => {
    const coordinator = createUploadDecodeCoordinator();
    const first = coordinator.run({
      priority: "active",
      signal: new AbortController().signal,
      work: async () => {
        throw new Error("bad decode");
      },
    });
    const second = coordinator.run({
      priority: "preview",
      signal: new AbortController().signal,
      work: async () => {
        return "ready";
      },
    });
    await expect(first).rejects.toThrow("bad decode");
    await expect(second).resolves.toBe("ready");
    const held = _deferred();
    const active = coordinator.run({
      priority: "active",
      signal: new AbortController().signal,
      work: () => {
        return held.promise;
      },
    });
    const queued = coordinator.run({
      priority: "preview",
      signal: new AbortController().signal,
      work: async () => {
        return "stale";
      },
    });
    const rejection = expect(queued).rejects.toMatchObject({
      name: "AbortError",
    });
    coordinator.dispose();
    await rejection;
    held.resolve();
    await active;
    await expect(
      coordinator.run({
        priority: "active",
        signal: new AbortController().signal,
        work: async () => {
          return "stale";
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("three preparation paths share one decoder while hashes and transfers stay concurrent", async () => {
  const { createUploadEngine } =
    await import("../createUploadEngine/createUploadEngine");
  const { createUploadPreviewQueue } =
    await import("../createUploadPreviewQueue/createUploadPreviewQueue");
  const { createUploadSessionController } =
    await import("../createUploadSessionController/createUploadSessionController");
  const { makeUploadControllerHarness } =
    await import("../createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers");
  const {
    makeWorkerFactoryFromAnswer,
    makeWorkerAnswerFromRequest,
    makeUploadEngineFilesFromPhotoCount,
    makeUploadApiFromScenario,
    SESSION_ID,
  } =
    await import("../createUploadEngine/__tests__/createUploadEngineTestHelpers");
  const coordinator = createUploadDecodeCoordinator();
  const paths = new Set<string>();
  let concurrentDecodes = 0;
  let maxConcurrentDecodes = 0;
  let concurrentHashes = 0;
  let maxConcurrentHashes = 0;
  let concurrentTransfers = 0;
  let maxConcurrentTransfers = 0;
  const factory = makeWorkerFactoryFromAnswer(async (request) => {
    if (request.kind === "hash") {
      maxConcurrentHashes = Math.max(maxConcurrentHashes, ++concurrentHashes);
      await new Promise((done) => {
        return setTimeout(done, 1);
      });
      concurrentHashes -= 1;
    } else {
      paths.add(request.kind);
      maxConcurrentDecodes = Math.max(
        maxConcurrentDecodes,
        ++concurrentDecodes,
      );
      await new Promise((done) => {
        return setTimeout(done, 2);
      });
      concurrentDecodes -= 1;
    }
    return makeWorkerAnswerFromRequest(request);
  });
  const harness = makeUploadControllerHarness();
  const controller = createUploadSessionController({
    memberId: "member",
    api: harness.api,
    storage: harness.storage,
    getManifestEntryFromFile: harness.headerReader,
    createMediaWorker: factory.createMediaWorker,
    decodeCoordinator: coordinator,
  });
  const queue = createUploadPreviewQueue({
    createMediaWorker: factory.createMediaWorker,
    decodeCoordinator: coordinator,
  });
  const files = makeUploadEngineFilesFromPhotoCount({ count: 2 });
  const engine = createUploadEngine({
    sessionId: SESSION_ID,
    onEvent: () => {},
    api: makeUploadApiFromScenario({ fileCount: 2 }),
    createMediaWorker: factory.createMediaWorker,
    decodeCoordinator: coordinator,
    transport: {
      putBytes: async () => {
        maxConcurrentTransfers = Math.max(
          maxConcurrentTransfers,
          ++concurrentTransfers,
        );
        await new Promise((done) => {
          return setTimeout(done, 25);
        });
        concurrentTransfers -= 1;
        return { status: 200, etag: undefined };
      },
    },
  });
  const picking = controller.pickFiles(
    files.map(({ file }) => {
      return file;
    }),
  );
  queue.requestPreview({
    fileId: "preview",
    file: files[0]!.file,
    contentType: "image/jpeg",
    size: { width: 4032, height: 3024 },
  });
  const sending = engine.start(files);
  await Promise.all([picking, sending]);
  expect(maxConcurrentDecodes).toBe(1);
  expect(maxConcurrentHashes).toBeGreaterThanOrEqual(2);
  expect(maxConcurrentTransfers).toBe(2);
  expect(paths).toEqual(new Set(["fingerprint", "image-derivatives"]));
  expect(
    factory.workers
      .flatMap((worker) => {
        return worker.requests;
      })
      .filter((request) => {
        return (
          request.kind === "image-derivatives" && request.purposes?.length === 1
        );
      }),
  ).toHaveLength(1);
  queue.destroy();
  controller.destroy();
  coordinator.dispose();
});

it("reset cancels fingerprint requests queued behind another file without touching terminated workers", async () => {
  const { createUploadSessionController } =
    await import("../createUploadSessionController/createUploadSessionController");
  const { makeUploadControllerHarness } =
    await import("../createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers");
  const { makeWorkerFactoryFromAnswer } =
    await import("../createUploadEngine/__tests__/createUploadEngineTestHelpers");
  const coordinator = createUploadDecodeCoordinator();
  const held = _deferred();
  const owner = coordinator.run({
    priority: "active",
    signal: new AbortController().signal,
    work: () => {
      return held.promise;
    },
  });
  const harness = makeUploadControllerHarness();
  const factory = makeWorkerFactoryFromAnswer();
  const controller = createUploadSessionController({
    memberId: "member",
    api: harness.api,
    storage: harness.storage,
    getManifestEntryFromFile: harness.headerReader,
    createMediaWorker: factory.createMediaWorker,
    decodeCoordinator: coordinator,
  });
  const picking = controller.pickFiles(harness.pickedFiles.slice(0, 2));
  await vi.waitFor(() => {
    return expect(
      factory.workers
        .flatMap((worker) => {
          return worker.requests;
        })
        .filter((request) => {
          return request.kind === "hash";
        }),
    ).toHaveLength(2);
  });
  controller.reset();
  held.resolve();
  await Promise.all([owner, picking]);
  expect(
    factory.workers
      .flatMap((worker) => {
        return worker.requests;
      })
      .map((request) => {
        return request.kind;
      }),
  ).toEqual(["hash", "hash"]);
  expect(
    factory.workers.every((worker) => {
      return worker.isTerminated;
    }),
  ).toBe(true);
  expect(harness.api.putUploadManifest).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({
    phase: "idle",
    checkingCount: 0,
  });
  controller.destroy();
  coordinator.dispose();
});

it("abandons a queued preview before allocating its worker and permits reentry", async () => {
  const { createUploadPreviewQueue } =
    await import("../createUploadPreviewQueue/createUploadPreviewQueue");
  const { makeWorkerFactoryFromAnswer } =
    await import("../createUploadEngine/__tests__/createUploadEngineTestHelpers");
  const coordinator = createUploadDecodeCoordinator();
  const held = _deferred();
  const owner = coordinator.run({
    priority: "active",
    signal: new AbortController().signal,
    work: () => {
      return held.promise;
    },
  });
  const factory = makeWorkerFactoryFromAnswer();
  const queue = createUploadPreviewQueue({
    decodeCoordinator: coordinator,
    createMediaWorker: factory.createMediaWorker,
  });
  const input = {
    fileId: "photo",
    file: new File(["photo"], "photo.jpg"),
    contentType: "image/jpeg",
    size: { width: 4000, height: 3000 },
  };
  queue.requestPreview(input);
  queue.deactivate(input.fileId);
  held.resolve();
  await owner;
  await vi.waitFor(() => {
    expect(queue.getPreview(input.fileId)).toBeUndefined();
  });
  expect(factory.workers).toHaveLength(0);
  queue.requestPreview(input);
  await vi.waitFor(() => {
    expect(queue.getPreview(input.fileId)?.kind).toBe("unavailable");
  });
  expect(factory.workers).toHaveLength(1);
  expect(factory.workers[0]!.requests).toHaveLength(1);
  queue.destroy();
  expect(factory.workers[0]!.isTerminated).toBe(true);
  coordinator.dispose();
});
