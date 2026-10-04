import type { UploadFileDto } from "@memory-shoebox/shared";
import { describe, expect, it, vi } from "vitest";
import { makeUploadRecoveryControllerHarness } from "./uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadFileFromPosition } from "./uploadSurfaceFixtureHelpers";

function _row({
  position,
  state = "waiting",
}: Readonly<{
  position: number;
  state?: UploadFileDto["state"];
}>): UploadFileDto {
  return {
    ...makeUploadFileFromPosition(position),
    state,
    contentHash: position.toString(16).padStart(64, "0"),
  };
}

async function _waitForEngine(
  harness: Readonly<ReturnType<typeof makeUploadRecoveryControllerHarness>>,
): Promise<void> {
  await expect
    .poll(() => {
      return harness.engine.start.mock.calls.length;
    })
    .toBe(1);
}

describe("upload reassociation", () => {
  it("restored draft re-picks preserve file ids and edits before arm", async () => {
    const harness = makeUploadRecoveryControllerHarness({
      rows: [_row({ position: 1 })],
      state: "draft",
    });
    const corrected = harness.serverDetail.files[0]!;
    corrected.capturedAt = "2020-01-01T10:00:00.000Z";
    corrected.capturedOn = "2020-01-01";
    harness.serverDetail.edits = [
      {
        editId: "018f0000-0000-7000-8000-00000000e001",
        kind: "tag",
        label: "Birthday",
        tag: null,
        person: null,
        milestone: null,
        targetCount: 1,
        createdAt: "2026-10-01T10:00:00.000Z",
        undoneAt: null,
        appliedAt: null,
        canUndo: true,
      },
    ];

    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await harness.controller.pickFiles(harness.files);
    expect(
      harness.controller.getSnapshot().filesById.has(corrected.fileId),
    ).toBe(true);
    expect(
      harness.api.putUploadManifest.mock.calls[0]![0].files[0],
    ).toMatchObject({ fileId: corrected.fileId });
    expect(
      harness.api.putUploadManifest.mock.calls[0]![0].files[0],
    ).not.toHaveProperty("capturedAt");
    expect(harness.controller.getSnapshot().detail?.files[0]?.capturedOn).toBe(
      "2020-01-01",
    );
    expect(harness.controller.getSnapshot().detail?.edits).toMatchObject([
      { label: "Birthday", targetCount: 1 },
    ]);
    expect(harness.controller.getSnapshot().phase).toBe("draft");
    expect(harness.engine.start).not.toHaveBeenCalled();
    expect(harness.api.commitUploadSession).not.toHaveBeenCalled();
    expect(harness.api.createUploadEdit).not.toHaveBeenCalled();
  });

  it("restored drafts add unrelated extras without copying known rows", async () => {
    const harness = makeUploadRecoveryControllerHarness({
      rows: [_row({ position: 0 })],
      state: "draft",
    });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await harness.controller.pickFiles([
      ...harness.files,
      new File(["new photo"], "extra.jpg", { type: "image/jpeg" }),
    ]);
    expect(harness.controller.getSnapshot().detail?.files).toHaveLength(2);
    expect(harness.controller.getSnapshot().detail?.files[0]?.fileId).toBe(
      harness.serverDetail.files[0]!.fileId,
    );
    const declarations = harness.api.putUploadManifest.mock.calls.flatMap(
      ([request]) => {
        return request.files;
      },
    );
    expect(declarations[0]?.fileId).toBe(harness.serverDetail.files[0]!.fileId);
    expect(declarations[1]?.originalFilename).toBe("extra.jpg");
    expect(
      harness.controller.getSnapshot().recoveryMatches.unmatchedClientRefs,
    ).toEqual([]);
    expect(harness.controller.getSnapshot().phase).toBe("draft");
    expect(harness.engine.start).not.toHaveBeenCalled();
  });

  it("hashless ambiguity waits for confirmation before any retry", async () => {
    const rows = [
      _row({ position: 1, state: "failed" }),
      {
        ..._row({ position: 2, state: "failed" }),
        originalFilename: "IMG_1.jpg",
      },
    ].map((row) => {
      return { ...row, contentHash: null };
    });
    const harness = makeUploadRecoveryControllerHarness({
      rows: rows,
      state: "settled",
    });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await harness.controller.pickFiles(harness.files.slice(0, 1));
    const ambiguous =
      harness.controller.getSnapshot().recoveryMatches.ambiguous[0]!;
    expect(ambiguous.fileIds).toHaveLength(2);
    expect(harness.engine.start).not.toHaveBeenCalled();
    expect(harness.api.retryUploadFile).not.toHaveBeenCalled();
    const recovering = harness.controller.confirmRecoveryMatch({
      fileId: rows[1]!.fileId,
      clientRef: ambiguous.clientRef,
    });
    void recovering.catch(() => {});
    await _waitForEngine(harness);
    expect(harness.engine.start.mock.calls[0]![0][0]!.fileId).toBe(
      rows[1]!.fileId,
    );
    harness.answerRun();
    await recovering;
  });

  it("choosing a file excludes a different hash competing for the same row", async () => {
    const harness = makeUploadRecoveryControllerHarness({
      rows: [{ ..._row({ position: 1, state: "failed" }), contentHash: null }],
      state: "settled",
    });
    const otherFile = new File([new Uint8Array(1000).fill(1)], "IMG_1.jpg", {
      type: "image/jpeg",
    });
    vi.mocked(harness.worker.postMessage).mockImplementation((request) => {
      if (request.kind === "hash") {
        queueMicrotask(() => {
          return harness.worker.onmessage?.(
            new MessageEvent("message", {
              data: {
                kind: "hashed",
                requestId: request.requestId,
                contentHash:
                  request.file === otherFile ? "b".repeat(64) : "a".repeat(64),
              },
            }),
          );
        });
      }
    });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await harness.controller.pickFiles([harness.files[0]!, otherFile]);
    const ambiguous =
      harness.controller.getSnapshot().recoveryMatches.ambiguous[0]!;
    expect(
      harness.controller.getSnapshot().recoveryMatches.ambiguous,
    ).toHaveLength(2);
    const recovering = harness.controller.confirmRecoveryMatch({
      clientRef: ambiguous.clientRef,
      fileId: ambiguous.fileIds[0]!,
    });
    void recovering.catch(() => {});
    await expect
      .poll(() => {
        return harness.controller.getSnapshot().recoveryMatches.ambiguous
          .length;
      })
      .toBe(0);
    await _waitForEngine(harness);
    expect(
      harness.controller.getSnapshot().recoveryMatches.unmatchedClientRefs,
    ).toHaveLength(1);
    expect(harness.engine.start.mock.calls[0]![0]).toHaveLength(1);
    expect(harness.engine.start.mock.calls[0]![0][0]?.file).toBe(
      harness.files[0],
    );
    harness.answerRun();
    await recovering;
  });
  it("a chosen association covers duplicate handles with the same hash", async () => {
    const rows = [
      _row({ position: 1, state: "failed" }),
      {
        ..._row({ position: 2, state: "failed" }),
        originalFilename: "IMG_1.jpg",
      },
    ].map((row) => {
      return { ...row, contentHash: null };
    });
    const harness = makeUploadRecoveryControllerHarness({
      rows: rows,
      state: "settled",
    });
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    await harness.controller.pickFiles([harness.files[0]!, harness.files[0]!]);
    const candidate =
      harness.controller.getSnapshot().recoveryMatches.ambiguous[0]!;
    const recovering = harness.controller.confirmRecoveryMatch({
      fileId: candidate.fileIds[0]!,
      clientRef: candidate.clientRef,
    });
    void recovering.catch(() => {});
    await expect
      .poll(() => {
        return harness.controller.getSnapshot().recoveryMatches.ambiguous
          .length;
      })
      .toBe(0);
    await _waitForEngine(harness);
    expect(harness.engine.start.mock.calls[0]![0]).toHaveLength(1);
    expect(harness.api.retryUploadFile).toHaveBeenCalledTimes(1);
    harness.answerRun();
    await recovering;
  });
});
