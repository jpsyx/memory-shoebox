import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadMilestoneDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderUploadMilestoneModal } from "./uploadMilestoneModalTestHelpers";

function _rejectAttachment(): ApiRequestError {
  return new ApiRequestError({
    status: 429,
    code: "rate_limited",
    message: "Retry attachment later",
  });
}
async function _attach(selectedFileCount: number): Promise<void> {
  fireEvent.click(
    screen.getByRole("button", { name: `Attach ${selectedFileCount}` }),
  );
  await waitFor(() => {
    return expect(
      screen.getByRole("button", { name: `Attach ${selectedFileCount}` }),
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
    harness.controller.applyEditAttempt.mockRejectedValueOnce(
      _rejectAttachment(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Home from the hospital/ }),
    );
    await _attach(2);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Retry attachment later",
    );
    harness.renderSnapshot({
      snapshot: {
        ...harness.controller.getSnapshot(),
        selectedFileIds: new Set([
          harness.controller.getSnapshot().detail!.files[1]!.fileId,
        ]),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /A second occasion/ }));
    fireEvent.click(screen.getByRole("button", { name: "Attach 1" }));
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalledOnce();
    });
    expect(
      harness.controller.applyEditAttempt.mock.calls.map(([request]) => {
        return {
          milestoneId: request.labels[0]!.milestoneId,
          targets: request.targetFileIds,
        };
      }),
    ).toEqual([
      {
        milestoneId: first.milestone.milestoneId,
        targets: harness.controller.getSnapshot().detail!.files.map((file) => {
          return file.fileId;
        }),
      },
      {
        milestoneId: second.milestone.milestoneId,
        targets: [harness.controller.getSnapshot().detail!.files[1]!.fileId],
      },
    ]);
  });
  it("the same occasion retries its original attempt after the selection changes", async () => {
    const harness = await renderUploadMilestoneModal({
      days: Array.from({ length: 1002 }, () => {
        return "2026-09-17";
      }),
    });
    harness.renderSnapshot({
      snapshot: {
        ...harness.controller.getSnapshot(),
        selectedFileIds: new Set(
          harness.controller
            .getSnapshot()
            .detail!.files.slice(0, 1001)
            .map((file) => {
              return file.fileId;
            }),
        ),
      },
    });
    const submitted = [...harness.controller.getSnapshot().selectedFileIds];
    harness.controller.applyEditAttempt.mockRejectedValueOnce(
      _rejectAttachment(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Home from the hospital/ }),
    );
    await _attach(1001);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Retry attachment later",
    );
    harness.renderSnapshot({
      snapshot: {
        ...harness.controller.getSnapshot(),
        selectedFileIds: new Set([
          harness.controller.getSnapshot().detail!.files[1001]!.fileId,
        ]),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach 1" }));
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalledOnce();
    });
    expect(
      harness.controller.applyEditAttempt.mock.calls.map(([request]) => {
        return request.targetFileIds;
      }),
    ).toEqual([submitted, submitted]);
    expect(harness.controller.applyEditAttempt.mock.calls[1]![0]).toBe(
      harness.controller.applyEditAttempt.mock.calls[0]![0],
    );
    expect([...harness.controller.getSnapshot().selectedFileIds]).toEqual([
      harness.controller.getSnapshot().detail!.files[1001]!.fileId,
    ]);
  });
});
