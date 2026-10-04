import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { makeUploadFileFromPosition } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  renderUploadLabelModal,
  typeUploadLabelThroughForm,
} from "./testing/uploadLabelModalTestHelpers";

describe("upload label modal", () => {
  it("a later label failure keeps earlier success and typed input", async () => {
    const harness = await renderUploadLabelModal({ kind: "tag" });
    await waitFor(() => {
      return expect(screen.queryByText(/Loading tags/)).not.toBeInTheDocument();
    });
    await typeUploadLabelThroughForm({ name: "Tags", label: "hospital" });
    await typeUploadLabelThroughForm({ name: "Tags", label: "sleeping" });
    harness.api.createUploadEdit.mockImplementationOnce(async ({ body }) => {
      return {
        editId: makeUploadFileFromPosition(2000).fileId,
        kind: "tag",
        label: body.labelSnapshot!,
        tag: null,
        person: null,
        milestone: null,
        targetCount: 1,
        createdAt: "2026-10-03T00:00:00.000Z",
        undoneAt: null,
        appliedAt: null,
        canUndo: true,
      };
    });
    harness.api.createUploadEdit.mockRejectedValueOnce(
      new ApiRequestError({
        status: 400,
        code: "bad_label",
        message: "Later label failed",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Tag all 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Later label failed",
    );
    expect(screen.getByText("sleeping")).toBeVisible();
    expect(screen.queryByText("hospital")).not.toBeInTheDocument();
    expect(harness.onClose).not.toHaveBeenCalled();
  });
  it("partial label chunk retry retains only unresolved targets", async () => {
    const harness = await renderUploadLabelModal({
      kind: "tag",
      fileCount: 1001,
    });
    await waitFor(() => {
      return expect(screen.queryByText(/Loading tags/)).not.toBeInTheDocument();
    });
    await typeUploadLabelThroughForm({ name: "Tags", label: "hospital" });
    harness.api.createUploadEdit.mockImplementation(async ({ body }) => {
      const edit = {
        editId: makeUploadFileFromPosition(
          2000 + harness.serverDetail.edits.length,
        ).fileId,
        kind: "tag" as const,
        label: "hospital",
        tag: null,
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
    const save = harness.api.createUploadEdit.getMockImplementation()!;
    harness.api.createUploadEdit
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(
        new ApiRequestError({
          status: 429,
          code: "rate_limited",
          message: "Retry later",
        }),
      );
    fireEvent.click(screen.getByRole("button", { name: "Tag all 1001" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Retry later");
    fireEvent.click(screen.getByRole("button", { name: "Tag all 1001" }));
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalledOnce();
    });
    expect(
      harness.api.createUploadEdit.mock.calls.map(([request]) => {
        return request.body.targetFileIds.length;
      }),
    ).toEqual([1000, 1, 1]);
  });
  it("duplicate person names require an explicit id-valued choice", async () => {
    const harness = await renderUploadLabelModal({ kind: "person" });
    await waitFor(() => {
      return expect(
        screen.queryByText(/Loading people/),
      ).not.toBeInTheDocument();
    });
    await typeUploadLabelThroughForm({ name: "Who is in them", label: "Alex" });
    fireEvent.click(screen.getByRole("button", { name: "Tag all 1" }));
    expect(harness.api.createUploadEdit).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Which Alex?" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /11 photographs/ }),
    );
    harness.api.createUploadEdit.mockImplementationOnce(async () => {
      return {
        editId: makeUploadFileFromPosition(2000).fileId,
        kind: "person",
        label: "Alex",
        tag: null,
        person: null,
        milestone: null,
        targetCount: 1,
        createdAt: "2026-10-03T00:00:00.000Z",
        undoneAt: null,
        appliedAt: null,
        canUndo: true,
      };
    });
    fireEvent.click(screen.getByRole("button", { name: "Tag all 1" }));
    await waitFor(() => {
      return expect(harness.api.createUploadEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            personId: makeUploadFileFromPosition(3001).fileId,
          }),
        }),
      );
    });
  });

  it("prevents repeated submit while the write is pending", async () => {
    const harness = await renderUploadLabelModal({ kind: "tag" });
    await waitFor(() => {
      return expect(screen.queryByText(/Loading tags/)).not.toBeInTheDocument();
    });
    await typeUploadLabelThroughForm({ name: "Tags", label: "sleeping" });
    const pending = Promise.withResolvers<never>();
    harness.api.createUploadEdit.mockReturnValueOnce(pending.promise);
    const button = screen.getByRole("button", { name: "Tag all 1" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(harness.api.createUploadEdit).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.reject(new Error("Failed"));
    });
  });
});
