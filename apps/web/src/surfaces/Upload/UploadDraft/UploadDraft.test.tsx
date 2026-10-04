import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeUploadControllerHarness } from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { createUploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers";
import { UploadDraft } from "./UploadDraft";
import { UploadUndated } from "./UploadUndated";
import { UploadDraftOverview } from "./UploadDraftOverview";
import { UploadEdits } from "./UploadEdits";

describe("upload draft composition", () => {
  it("counts the whole accepted batch independently of edit ticks", async () => {
    const harness = makeUploadControllerHarness(makeUploadSurfaceDetail());
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    harness.controller.toggleFile(harness.serverDetail.files[0]!.fileId);
    const onStart = vi.fn();
    const previews = createUploadPreviewQueue();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MantineProvider>
          <UploadDraft
            snapshot={harness.controller.getSnapshot()}
            controller={harness.controller}
            previews={previews}
            visibility={{ mode: "everyone", subjects: [] }}
            viewer={harness.serverDetail.uploadedBy}
            onVisibilityChange={vi.fn()}
            onStart={onStart}
            onOpenMilestone={vi.fn()}
          />
        </MantineProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Put 264 up" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.getByText("ticked")).toBeVisible();
    previews.destroy();
  });
  it("undated correction uses known rows and remains optional", async () => {
    const detail = makeUploadSurfaceDetail();
    const file = detail.files[0]!;
    file.captureSource = "file_mtime";
    detail.undated = {
      fileCount: 1,
      captureSource: "file_mtime",
      files: [
        {
          fileId: file.fileId,
          originalFilename: file.originalFilename,
          capturedOn: file.capturedOn!,
        },
      ],
    };
    const harness = makeUploadControllerHarness(detail);
    await harness.controller.loadSession(detail.sessionId);
    render(
      <MantineProvider>
        <UploadUndated
          snapshot={harness.controller.getSnapshot()}
          controller={harness.controller}
        />
      </MantineProvider>,
    );
    fireEvent.change(screen.getByLabelText("Capture date"), {
      target: { value: "2026-09-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set date for 1" }));
    await waitFor(() => {
      return expect(harness.api.putUploadManifest).toHaveBeenCalledWith(
        expect.objectContaining({
          files: [
            expect.objectContaining({
              fileId: detail.files[0]!.fileId,
              capturedAt: "2026-09-15T00:00:00.000Z",
            }),
          ],
        }),
      );
    });
  });
  it("draft figures count complete picks and eligible bytes before committed totals exist", async () => {
    const detail = makeUploadSurfaceDetail({ fileCount: 0, totalBytes: 0 });
    detail.files[0]!.state = "refused";
    const harness = makeUploadControllerHarness(detail);
    await harness.controller.loadSession(detail.sessionId);
    render(
      <MantineProvider>
        <UploadDraftOverview snapshot={harness.controller.getSnapshot()} />
      </MantineProvider>,
    );
    expect(screen.getByText("264", { exact: true })).toBeVisible();
    expect(screen.getByText("0.3 MB", { exact: true })).toBeVisible();
  });
  it("saved draft edits use the complete manifest denominator before commit", async () => {
    const detail = makeUploadSurfaceDetail({ fileCount: 0 });
    detail.edits = [
      {
        editId: "018f0000-0000-7000-8000-000000009000",
        kind: "tag",
        label: "hospital",
        tag: null,
        person: null,
        milestone: null,
        targetCount: 12,
        createdAt: detail.createdAt,
        undoneAt: null,
        appliedAt: null,
        canUndo: true,
      },
    ];
    detail.edits.push({
      ...detail.edits[0]!,
      editId: "018f0000-0000-7000-8000-000000009001",
      label: "sleeping",
    });
    const errors = vi.spyOn(console, "error");
    const harness = makeUploadControllerHarness(detail);
    harness.api.undoUploadEdit.mockImplementation(async ({ editId }) => {
      const edit = harness.serverDetail.edits.find((saved) => {
        return saved.editId === editId;
      })!;
      edit.undoneAt = detail.createdAt;
      edit.canUndo = false;
      return { ...edit };
    });
    await harness.controller.loadSession(detail.sessionId);
    const view = render(
      <MantineProvider>
        <UploadEdits
          snapshot={harness.controller.getSnapshot()}
          controller={harness.controller}
        />
      </MantineProvider>,
    );
    expect(screen.getAllByText("on 12 of 264")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Undo hospital" }));
    await waitFor(() => {
      return expect(
        harness.controller.getSnapshot().detail!.edits.find((edit) => {
          return edit.label === "hospital";
        })!.undoneAt,
      ).not.toBeNull();
    });
    view.rerender(
      <MantineProvider>
        <UploadEdits
          snapshot={harness.controller.getSnapshot()}
          controller={harness.controller}
        />
      </MantineProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Undo hospital" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo sleeping" })).toBeEnabled();
    expect(
      errors.mock.calls.filter(([message]) => {
        return String(message).includes('unique "key"');
      }),
    ).toEqual([]);
  });
});
