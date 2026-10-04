import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import type { UploadBatchEditDto } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "./uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "./uploadSurfaceFixtures";

function _savedEdit(position = 1): UploadBatchEditDto {
  return {
    editId: makeUploadFileFromPosition(position + 2000).fileId,
    kind: "tag",
    label: "hospital",
    tag: null,
    person: null,
    milestone: null,
    targetCount: 2,
    createdAt: "2026-10-03T00:00:00.000Z",
    undoneAt: null,
    appliedAt: null,
    canUndo: true,
  };
}
async function _harness(count = 2) {
  const harness = makeUploadControllerHarness(
    makeUploadSurfaceDetail({
      files: Array.from({ length: count }, (_, position) => {
        return makeUploadFileFromPosition(position);
      }),
      fileCount: count,
    }),
  );
  await harness.controller.loadSession(harness.serverDetail.sessionId);
  harness.controller.selectAll();
  harness.api.createUploadEdit.mockImplementation(async ({ body }) => {
    const edit = {
      ..._savedEdit(harness.serverDetail.edits.length),
      kind: body.kind,
      label: body.labelSnapshot ?? "known",
      targetCount: body.targetFileIds.length,
    };
    harness.serverDetail.edits.push(edit);
    return edit;
  });
  return harness;
}

async function _milestonePartialHarness() {
  const harness = await _harness(1001);
  const milestone = {
    milestoneId: makeUploadFileFromPosition(4000).fileId,
    name: "Home",
    startsOn: "2026-10-01",
    endsOn: "2026-10-01",
    blurb: null,
  };
  const savedEdit = {
    ..._savedEdit(),
    kind: "milestone" as const,
    label: milestone.name,
    milestone,
    targetCount: 1000,
  };
  const rejection = new ApiRequestError({
    status: 429,
    code: "rate_limited",
    message: "Try again later",
  });
  const file = harness.serverDetail.files[100]!;
  const updatedDays = [
    { capturedOn: "2026-10-01", fileCount: 100, milestones: [milestone] },
  ];
  const updatedMismatches = [
    {
      milestone,
      files: [
        {
          fileId: file.fileId,
          originalFilename: file.originalFilename,
          capturedOn: file.capturedOn!,
        },
      ],
    },
  ];
  harness.api.createUploadEdit.mockImplementationOnce(async () => {
    harness.serverDetail.edits.push(savedEdit);
    harness.serverDetail.days = updatedDays;
    harness.serverDetail.mismatches = updatedMismatches;
    return savedEdit;
  });
  harness.api.createUploadEdit.mockRejectedValueOnce(rejection);
  return {
    ...harness,
    milestone,
    savedEdit,
    rejection,
    updatedDays,
    updatedMismatches,
  };
}

describe("draft bulk edits", () => {
  it("retries only unresolved chunks and Undo leaves no duplicate labels", async () => {
    const harness = await _harness(1001);
    const attempt = {
      sessionId: harness.serverDetail.sessionId,
      targetFileIds: [...harness.controller.getSnapshot().selectedFileIds],
      labels: [{ kind: "tag" as const, labelSnapshot: "hospital" }],
    };
    const save = harness.api.createUploadEdit.getMockImplementation()!;
    harness.api.createUploadEdit.mockImplementationOnce(save);
    harness.api.createUploadEdit.mockRejectedValueOnce(
      new ApiRequestError({
        status: 429,
        code: "rate_limited",
        message: "Retry later",
      }),
    );
    await expect(harness.controller.applyEditAttempt(attempt)).rejects.toThrow(
      "Retry later",
    );
    await harness.controller.applyEditAttempt(attempt);
    expect(
      harness.api.createUploadEdit.mock.calls.map(([request]) => {
        return request.body.targetFileIds.length;
      }),
    ).toEqual([1000, 1, 1]);
    const edits = harness.controller.getSnapshot().detail!.edits;
    expect(edits).toHaveLength(2);
    for (const edit of edits) {
      harness.api.undoUploadEdit.mockResolvedValueOnce({
        ...edit,
        undoneAt: "2026-10-04T00:00:00Z",
        canUndo: false,
      });
      await harness.controller.undoEdit(edit.editId);
    }
    expect(harness.controller.getSnapshot().editTargets.size).toBe(0);
    expect(
      harness.controller.getSnapshot().detail!.edits.every((edit) => {
        return edit.undoneAt !== null;
      }),
    ).toBe(true);
  });
  it("explicit attachment keeps its original targets and the newer selection", async () => {
    const harness = await _harness();
    const [first, second] = harness.serverDetail.files;
    harness.controller.clearSelection();
    harness.controller.toggleFile(second!.fileId);
    await harness.controller.applyEditAttempt({
      sessionId: harness.serverDetail.sessionId,
      targetFileIds: [first!.fileId],
      labels: [{ kind: "tag", labelSnapshot: "submitted" }],
    });
    expect(
      harness.api.createUploadEdit.mock.calls[0]![0].body.targetFileIds,
    ).toEqual([first!.fileId]);
    expect([...harness.controller.getSnapshot().selectedFileIds]).toEqual([
      second!.fileId,
    ]);
  });

  it("bulk applies to the captured selection and stores actual response ids", async () => {
    const harness = await _harness();
    const ids = [...harness.controller.getSnapshot().selectedFileIds];
    const answer = makeDeferredAnswer<UploadBatchEditDto>();
    harness.api.createUploadEdit.mockReturnValueOnce(answer.promise);
    const saving = harness.controller.applyEdits([
      { kind: "tag", labelSnapshot: "hospital" },
    ]);
    harness.controller.toggleFile(ids[0]!);
    answer.answer(_savedEdit());
    await saving;
    expect(harness.api.createUploadEdit).toHaveBeenCalledWith({
      sessionId: harness.serverDetail.sessionId,
      body: { kind: "tag", labelSnapshot: "hospital", targetFileIds: ids },
    });
    expect(
      harness.controller.getSnapshot().editTargets.get(_savedEdit().editId),
    ).toEqual(ids);
    expect(harness.controller.getSnapshot().detail?.edits).toContainEqual(
      _savedEdit(),
    );
    expect(harness.controller.getSnapshot().selectedFileIds.size).toBe(0);
    harness.controller.selectAll();
    harness.controller.clearSelection();
    expect(
      harness.controller.getSnapshot().editTargets.get(_savedEdit().editId),
    ).toEqual(ids);
  });
  it("a later label failure keeps earlier success and its target hint", async () => {
    const harness = await _harness();
    harness.api.createUploadEdit.mockRejectedValueOnce(
      new ApiRequestError({
        status: 400,
        code: "bad_label",
        message: "Try another label",
      }),
    );
    await expect(
      harness.controller.applyEdits([
        { kind: "tag", labelSnapshot: "sleeping" },
      ]),
    ).rejects.toThrow();
    harness.api.createUploadEdit.mockImplementationOnce(async () => {
      return _savedEdit();
    });
    harness.api.createUploadEdit.mockRejectedValueOnce(
      new ApiRequestError({
        status: 400,
        code: "bad_label",
        message: "Try another label",
      }),
    );
    await expect(
      harness.controller.applyEdits([
        { kind: "tag", labelSnapshot: "hospital" },
        { kind: "tag", labelSnapshot: "sleeping" },
      ]),
    ).rejects.toThrow();
    expect(harness.controller.getSnapshot().detail?.edits).toContainEqual(
      _savedEdit(),
    );
    expect(
      harness.controller.getSnapshot().editTargets.get(_savedEdit().editId),
    ).toHaveLength(2);
    expect(harness.controller.getSnapshot().selectedFileIds.size).toBe(2);
  });
  it("lost edit response refreshes the plan without automatic replay or guessed targets", async () => {
    const harness = await _harness();
    const readCount = harness.api.getUploadSession.mock.calls.length;
    harness.api.createUploadEdit.mockImplementationOnce(async () => {
      harness.serverDetail.edits.push(_savedEdit());
      throw new TypeError("Lost response");
    });
    await expect(
      harness.controller.applyEdits([
        { kind: "tag", labelSnapshot: "hospital" },
      ]),
    ).rejects.toThrow();
    expect(harness.api.createUploadEdit).toHaveBeenCalledTimes(1);
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(readCount + 1);
    expect(harness.controller.getSnapshot().detail?.edits).toContainEqual(
      _savedEdit(),
    );
    expect(harness.controller.getSnapshot().editTargets.size).toBe(0);
    expect(harness.controller.getSnapshot().error?.operation).toBe("edit");
  });
  it("new tag chunks 1,001 targets but a new person does not", async () => {
    const harness = await _harness(1001);
    await expect(
      harness.controller.applyEdits([
        { kind: "person", labelSnapshot: "Alex" },
      ]),
    ).rejects.toThrow(/1,000/);
    expect(harness.api.createUploadEdit).not.toHaveBeenCalled();
    await harness.controller.applyEdits([
      { kind: "tag", labelSnapshot: "hospital" },
    ]);
    expect(
      harness.api.createUploadEdit.mock.calls.map(([call]) => {
        return call.body.targetFileIds.length;
      }),
    ).toEqual([1000, 1]);
  });
  it("refreshes milestone grouping after a confirmed chunk and definitive rejection without replay", async () => {
    const harness = await _milestonePartialHarness();
    const readCount = harness.api.getUploadSession.mock.calls.length;
    await expect(
      harness.controller.applyEdits([
        { kind: "milestone", milestoneId: harness.milestone.milestoneId },
      ]),
    ).rejects.toBe(harness.rejection);
    const snapshot = harness.controller.getSnapshot();
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(readCount + 1);
    expect(snapshot.detail?.days).toEqual(harness.updatedDays);
    expect(snapshot.detail?.mismatches).toEqual(harness.updatedMismatches);
    expect(snapshot.detail?.edits).toContainEqual(harness.savedEdit);
    expect(snapshot.editTargets.get(harness.savedEdit.editId)).toHaveLength(
      1000,
    );
    expect(snapshot.selectedFileIds.size).toBe(1001);
    expect(snapshot.error?.code).toBe("rate_limited");
    expect(harness.api.createUploadEdit).toHaveBeenCalledTimes(2);
  });
  it("preserves the original chunk error and confirmed milestone edit if its refresh fails", async () => {
    const harness = await _milestonePartialHarness();
    const readCount = harness.api.getUploadSession.mock.calls.length;
    harness.api.getUploadSession.mockRejectedValueOnce(
      new Error("Read unavailable"),
    );
    await expect(
      harness.controller.applyEdits([
        { kind: "milestone", milestoneId: harness.milestone.milestoneId },
      ]),
    ).rejects.toBe(harness.rejection);
    const snapshot = harness.controller.getSnapshot();
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(readCount + 1);
    expect(snapshot.detail?.edits).toContainEqual(harness.savedEdit);
    expect(snapshot.editTargets.get(harness.savedEdit.editId)).toHaveLength(
      1000,
    );
    expect(snapshot.error).toMatchObject({
      code: "rate_limited",
      message: "Try again later",
    });
    expect(snapshot.phase).toBe("draft");
    expect(snapshot.isBusy).toBe(false);
    expect(harness.api.createUploadEdit).toHaveBeenCalledTimes(2);
  });
  it("Undo updates after success and honors canUndo", async () => {
    const harness = await _harness();
    await harness.controller.applyEdits([
      { kind: "tag", labelSnapshot: "hospital" },
    ]);
    const edit = harness.controller.getSnapshot().detail!.edits[0]!;
    const answer = makeDeferredAnswer<UploadBatchEditDto>();
    harness.api.undoUploadEdit.mockReturnValueOnce(answer.promise);
    const undoing = harness.controller.undoEdit(edit.editId);
    expect(harness.controller.getSnapshot().editTargets.has(edit.editId)).toBe(
      true,
    );
    answer.answer({
      ...edit,
      undoneAt: "2026-10-03T01:00:00.000Z",
      canUndo: false,
    });
    await undoing;
    expect(harness.controller.getSnapshot().editTargets.has(edit.editId)).toBe(
      false,
    );
    expect(harness.controller.getSnapshot().detail!.edits[0]!.canUndo).toBe(
      false,
    );
    await expect(harness.controller.undoEdit(edit.editId)).rejects.toThrow();
    expect(harness.api.undoUploadEdit).toHaveBeenCalledTimes(1);
  });
  it("undated correction sends a calendar date without shifting it or rereading Files", async () => {
    const harness = await _harness();
    const row = harness.serverDetail.files[0]!;
    await harness.controller.amendDates([
      { fileId: row.fileId, capturedOn: "2026-09-15" },
    ]);
    expect(
      harness.api.putUploadManifest.mock.calls[0]![0].files[0],
    ).toMatchObject({
      fileId: row.fileId,
      capturedAt: "2026-09-15T00:00:00.000Z",
      originalFilename: row.originalFilename,
      declaredBytes: row.declaredBytes,
    });
    expect(harness.headerReader).not.toHaveBeenCalled();
  });
});
