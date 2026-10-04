import type { TagCount } from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { makeUploadFileFromPosition } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  renderUploadLabelModal,
  typeUploadLabelThroughForm,
} from "./testing/uploadLabelModalTestHelpers";

const TAGS: TagCount[] = [
  {
    tag: { tagId: makeUploadFileFromPosition(8000).fileId, name: "hospital" },
    itemCount: 2,
  },
  {
    tag: { tagId: makeUploadFileFromPosition(8001).fileId, name: "sleeping" },
    itemCount: 2,
  },
];
function _rejectLabel(): ApiRequestError {
  return new ApiRequestError({
    status: 429,
    code: "rate_limited",
    message: "Retry label later",
  });
}
function _saveEdits(
  harness: Readonly<Awaited<ReturnType<typeof renderUploadLabelModal>>>,
): void {
  harness.api.createUploadEdit.mockImplementation(async ({ body }) => {
    const tag = TAGS.find((entry) => {
      return entry.tag.tagId === body.tagId;
    })!.tag;
    const edit = {
      editId: makeUploadFileFromPosition(
        9000 + harness.serverDetail.edits.length,
      ).fileId,
      kind: "tag" as const,
      label: tag.name,
      tag,
      person: null,
      milestone: null,
      targetCount: body.targetFileIds.length,
      createdAt: "2026-10-03T00:00:00Z",
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    };
    harness.serverDetail.edits.push(edit);
    return edit;
  });
  harness.api.undoUploadEdit.mockImplementation(async ({ editId }) => {
    const edit = harness.serverDetail.edits.find((saved) => {
      return saved.editId === editId;
    })!;
    edit.undoneAt = "2026-10-04T00:00:00Z";
    edit.canUndo = false;
    return { ...edit };
  });
}
async function _submitWithFailure(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Tag all 1001" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Retry label later",
  );
  await waitFor(() => {
    return expect(
      screen.getByRole("button", { name: "Tag all 1001" }),
    ).toBeEnabled();
  });
}

describe("upload label action completion", () => {
  it("a completed partial label stays removed through a later rejection and Undo", async () => {
    const harness = await renderUploadLabelModal({
      kind: "tag",
      fileCount: 1001,
      tags: TAGS,
    });
    await waitFor(() => {
      return expect(screen.queryByText(/Loading tags/)).not.toBeInTheDocument();
    });
    await typeUploadLabelThroughForm({ name: "Tags", label: "hospital" });
    await typeUploadLabelThroughForm({ name: "Tags", label: "sleeping" });
    _saveEdits(harness);
    const save = harness.api.createUploadEdit.getMockImplementation()!;
    harness.api.createUploadEdit
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(_rejectLabel());
    await _submitWithFailure();
    expect(screen.getByText("hospital", { exact: true })).toBeVisible();
    harness.api.createUploadEdit
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(_rejectLabel());
    await _submitWithFailure();
    expect(
      within(screen.getByRole("dialog")).queryByText("hospital", {
        exact: true,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("sleeping", { exact: true })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Tag all 1001" }));
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalledOnce();
    });
    expect(
      harness.api.createUploadEdit.mock.calls.map(([request]) => {
        return [request.body.tagId, request.body.targetFileIds.length];
      }),
    ).toEqual([
      [TAGS[0]!.tag.tagId, 1000],
      [TAGS[0]!.tag.tagId, 1],
      [TAGS[0]!.tag.tagId, 1],
      [TAGS[1]!.tag.tagId, 1000],
      [TAGS[1]!.tag.tagId, 1000],
      [TAGS[1]!.tag.tagId, 1],
    ]);
    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.detail!.edits).toHaveLength(4);
    expect([...snapshot.editTargets.values()].flat()).toHaveLength(2002);
    const writes = harness.api.createUploadEdit.mock.calls.map(([request]) => {
      return request.body;
    });
    const submitted = harness.serverDetail.files.map((file) => {
      return file.fileId;
    });
    expect(writes[0]!.targetFileIds).toEqual(submitted.slice(0, 1000));
    expect(writes[2]!.targetFileIds).toEqual(submitted.slice(1000));
    expect(writes[4]!.targetFileIds).toEqual(submitted.slice(0, 1000));
    expect(writes[5]!.targetFileIds).toEqual(submitted.slice(1000));
    await act(async () => {
      await snapshot.detail!.edits.reduce(async (previousUndo, edit) => {
        await previousUndo;
        await harness.controller.undoEdit(edit.editId);
      }, Promise.resolve());
    });
    expect(
      harness.controller.getSnapshot().detail!.edits.filter((edit) => {
        return edit.undoneAt === null;
      }),
    ).toEqual([]);
    expect(harness.controller.getSnapshot().editTargets.size).toBe(0);
  });
});
