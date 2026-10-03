import {
  SESSION_ID,
  makeUploadEngineFilesFromPhotoCount,
  makeUploadApiFromScenario,
  createLandingUploadTransport,
  makeWorkerFactoryFromAnswer,
} from "./createUploadEngineTestHelpers";

import { describe, expect, it } from "vitest";

import { createUploadEngine } from "@/upload/createUploadEngine/createUploadEngine";

describe("createUploadEngine", () => {
  it("refuses a second start while the first is running", async () => {
    const engine = createUploadEngine({
      sessionId: SESSION_ID,
      api: makeUploadApiFromScenario({ fileCount: 1 }),
      onEvent: () => {},
      createMediaWorker: makeWorkerFactoryFromAnswer().createMediaWorker,
      transport: createLandingUploadTransport(),
    });

    const running = engine.start(
      makeUploadEngineFilesFromPhotoCount({ count: 1 }),
    );

    await expect(
      engine.start(makeUploadEngineFilesFromPhotoCount({ count: 1 })),
    ).rejects.toThrow("already running");
    await running;
  });
});
