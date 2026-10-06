import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
  makeUploadRecoveryControllerHarness,
} from "../createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "../createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import type { MediaWorkerRequest } from "../mediaWorker/mediaWorkerProtocol.types";
import { createUploadFileIntake } from "./createUploadFileIntake";
import { expect, it, vi } from "vitest";

it("keeps ambiguous originals and drains later drops after a match is chosen", async () => {
  const rows = [
    makeUploadFileFromPosition(0),
    {
      ...makeUploadFileFromPosition(1),
      originalFilename: "IMG_0.jpg",
    },
  ];
  const harness = makeUploadRecoveryControllerHarness({ rows, state: "draft" });
  await harness.controller.loadSession(harness.serverDetail.sessionId);
  const intake = createUploadFileIntake(harness.controller);
  let heldHash: MediaWorkerRequest | undefined;
  vi.mocked(harness.worker.postMessage).mockImplementationOnce((request) => {
    heldHash = request;
  });
  const original = harness.files[0]!;
  const extra = new File(["new"], "extra.jpg", { type: "image/jpeg" });
  intake.stageFiles([original]);
  const picking = intake.loadSession(harness.serverDetail.sessionId);
  await expect
    .poll(() => {
      return heldHash;
    })
    .toBeDefined();
  intake.stageFiles([extra]);
  harness.worker.onmessage?.(
    new MessageEvent("message", {
      data: {
        kind: "hashed",
        requestId: heldHash!.requestId,
        contentHash: "0".repeat(64),
      },
    }),
  );
  await picking;
  const paused = harness.controller.getSnapshot();
  expect(paused.recoveryMatches.ambiguous).toHaveLength(1);
  expect([...paused.recoveryFilesByRef!.values()][0]!.file).toBe(original);
  expect(intake.getPendingFileCount()).toBe(1);
  await harness.controller.confirmRecoveryMatch({
    clientRef: paused.recoveryMatches.ambiguous[0]!.clientRef,
    fileId: rows[0]!.fileId,
  });
  await expect
    .poll(() => {
      return harness.serverDetail.files.map((row) => {
        return row.originalFilename;
      });
    })
    .toEqual(["IMG_0.jpg", "IMG_0.jpg", "extra.jpg"]);
  expect(harness.controller.getSnapshot().filesById.get(rows[0]!.fileId)).toBe(
    original,
  );
  expect([...harness.controller.getSnapshot().filesById.values()]).toContain(
    extra,
  );
  expect(harness.engine.start).not.toHaveBeenCalled();
});

it("drains a later drop staged while the first declaration is pending", async () => {
  const harness = makeUploadControllerHarness(
    makeUploadSurfaceDetail({ files: [], fileCount: 0, totalBytes: 0 }),
  );
  const saved = new File(["saved"], "saved.jpg", { type: "image/jpeg" });
  await harness.controller.pickFiles([saved]);
  const intake = createUploadFileIntake(harness.controller);
  const first = new File(["first"], "first.jpg", { type: "image/jpeg" });
  const second = new File(["second"], "second.jpg", { type: "image/jpeg" });
  const header =
    makeDeferredAnswer<Awaited<ReturnType<typeof harness.headerReader>>>();
  harness.headerReader.mockReturnValueOnce(header.promise);
  intake.stageFiles([first]);
  const picking = intake.loadSession(harness.serverDetail.sessionId);
  await expect
    .poll(() => {
      return harness.headerReader.mock.calls.length;
    })
    .toBe(2);
  intake.stageFiles([second]);
  expect(intake.loadSession(harness.serverDetail.sessionId)).toBe(picking);
  header.answer({
    clientRef: harness.headerReader.mock.calls[1]![0].clientRef,
    originalFilename: first.name,
    declaredBytes: first.size,
    declaredContentType: first.type,
  });
  await picking;
  expect(
    harness.serverDetail.files.map((row) => {
      return row.originalFilename;
    }),
  ).toEqual(["saved.jpg", "first.jpg", "second.jpg"]);
  const handles = [...harness.controller.getSnapshot().filesById.values()];
  expect(handles).toHaveLength(3);
  expect(handles[0]).toBe(saved);
  expect(handles[1]).toBe(first);
  expect(handles[2]).toBe(second);
  expect(intake.getPendingFileCount()).toBe(0);
});
