import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadMilestoneDetail,
} from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UploadMilestoneModal } from "./UploadMilestoneModal";
import { renderUploadMilestoneModal } from "./uploadMilestoneModalTestHelpers";

function _rerender(
  harness: Awaited<ReturnType<typeof renderUploadMilestoneModal>>,
): void {
  harness.rendered.rerender(
    <QueryClientProvider client={harness.queryClient}>
      <MantineProvider>
        <UploadMilestoneModal
          memberId={harness.serverDetail.uploadedBy.memberId}
          opened
          snapshot={harness.controller.getSnapshot()}
          controller={harness.controller}
          onClose={harness.onClose}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
}
function _rejectAttachment(): ApiRequestError {
  return new ApiRequestError({
    status: 429,
    code: "rate_limited",
    message: "Retry attachment later",
  });
}
function _saveMilestoneEdits(
  options: Readonly<{
    harness: Awaited<ReturnType<typeof renderUploadMilestoneModal>>;
    milestones: Array<ReturnType<typeof makeUploadMilestoneDetail>>;
  }>,
): void {
  const { harness, milestones } = options;
  harness.api.createUploadEdit.mockImplementation(async ({ body }) => {
    const milestone = milestones.find((entry) => {
      return entry.milestone.milestoneId === body.milestoneId;
    })!.milestone;
    const edit = {
      editId: makeUploadFileFromPosition(
        9000 + harness.serverDetail.edits.length,
      ).fileId,
      kind: "milestone" as const,
      label: milestone.name,
      tag: null,
      person: null,
      milestone,
      targetCount: body.targetFileIds.length,
      createdAt: "2026-10-03T00:00:00.000Z",
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    };
    harness.serverDetail.edits.push(edit);
    return edit;
  });
}
async function _attach(count: number): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: `Attach ${count}` }));
  await waitFor(() => {
    return expect(
      screen.getByRole("button", { name: `Attach ${count}` }),
    ).toBeEnabled();
  });
}

describe("existing upload occasion retries", () => {
  it("a changed occasion submits the new id and current selection after rejection", async () => {
    const first = makeUploadMilestoneDetail();
    const second = {
      ...first,
      milestone: {
        ...first.milestone,
        milestoneId: makeUploadFileFromPosition(8001).fileId,
        name: "A second occasion",
      },
    };
    const harness = await renderUploadMilestoneModal({
      milestones: [first, second],
    });
    _saveMilestoneEdits({ harness, milestones: [first, second] });
    harness.api.createUploadEdit.mockRejectedValueOnce(_rejectAttachment());
    fireEvent.click(
      screen.getByRole("button", { name: /Home from the hospital/ }),
    );
    await _attach(2);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Retry attachment later",
    );
    harness.controller.clearSelection();
    harness.controller.toggleFile(harness.serverDetail.files[1]!.fileId);
    _rerender(harness);
    fireEvent.click(screen.getByRole("button", { name: /A second occasion/ }));
    fireEvent.click(screen.getByRole("button", { name: "Attach 1" }));
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalledOnce();
    });
    expect(
      harness.api.createUploadEdit.mock.calls.map(([request]) => {
        return {
          milestoneId: request.body.milestoneId,
          targets: request.body.targetFileIds,
        };
      }),
    ).toEqual([
      {
        milestoneId: first.milestone.milestoneId,
        targets: harness.serverDetail.files.map((file) => {
          return file.fileId;
        }),
      },
      {
        milestoneId: second.milestone.milestoneId,
        targets: [harness.serverDetail.files[1]!.fileId],
      },
    ]);
    expect(
      harness.controller.getSnapshot().detail!.edits.map((edit) => {
        return edit.milestone?.milestoneId;
      }),
    ).toEqual([second.milestone.milestoneId]);
  });
  it("the same occasion keeps original targets and skips its acknowledged chunk", async () => {
    const harness = await renderUploadMilestoneModal({
      days: Array.from({ length: 1002 }, () => {
        return "2026-09-17";
      }),
    });
    harness.controller.toggleFile(harness.serverDetail.files[1001]!.fileId);
    _rerender(harness);
    const submitted = [...harness.controller.getSnapshot().selectedFileIds];
    _saveMilestoneEdits({ harness, milestones: [makeUploadMilestoneDetail()] });
    const save = harness.api.createUploadEdit.getMockImplementation()!;
    harness.api.createUploadEdit
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(_rejectAttachment());
    fireEvent.click(
      screen.getByRole("button", { name: /Home from the hospital/ }),
    );
    await _attach(1001);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Retry attachment later",
    );
    harness.controller.clearSelection();
    harness.controller.toggleFile(harness.serverDetail.files[1001]!.fileId);
    _rerender(harness);
    fireEvent.click(screen.getByRole("button", { name: "Attach 1" }));
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalledOnce();
    });
    expect(
      harness.api.createUploadEdit.mock.calls.map(([request]) => {
        return request.body.targetFileIds;
      }),
    ).toEqual([
      submitted.slice(0, 1000),
      submitted.slice(1000),
      submitted.slice(1000),
    ]);
    expect([...harness.controller.getSnapshot().selectedFileIds]).toEqual([
      harness.serverDetail.files[1001]!.fileId,
    ]);
  });
});
