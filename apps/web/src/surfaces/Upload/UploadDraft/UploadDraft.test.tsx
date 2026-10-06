import { createUploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSnapshotFromDetail,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadDraft } from "./UploadDraft";
import { UploadDraftOverview } from "./UploadDraftOverview";
import { UploadEdits } from "./UploadEdits";

function _renderOverview(files: readonly UploadFileDto[]): void {
  const detail = makeUploadSurfaceDetail({
    files: [...files],
    fileCount: 0,
    totalBytes: 0,
  });
  const snapshot = makeUploadSnapshotFromDetail(detail);
  snapshot.phase = "draft";
  if (files[0]) {
    snapshot.selectedFileIds.add(files[0].fileId);
  }
  render(
    <MantineProvider>
      <UploadDraftOverview snapshot={snapshot} />
    </MantineProvider>,
  );
}

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

  it("splits four photos and one video across complete picks independently of edit ticks", () => {
    _renderOverview(
      ["image/jpeg", "image/png", "image/heic", "image/webp", "video/mp4"].map(
        (declaredContentType, position) => {
          return {
            ...makeUploadFileFromPosition(position),
            declaredContentType,
          };
        },
      ),
    );
    expect(
      within(screen.getByText("Photos").parentElement!).getByText("4", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      within(screen.getByText("Video").parentElement!).getByText("1", {
        exact: true,
      }),
    ).toBeVisible();
    expect(screen.queryByText("Chosen")).not.toBeInTheDocument();
    expect(screen.queryByText("Days")).not.toBeInTheDocument();
    expect(screen.queryByText("To send")).not.toBeInTheDocument();
    expect(screen.getByText("To upload")).toBeVisible();
  });

  it.each([
    { declaredContentType: "image/jpeg", count: 1, label: "Photo" },
    { declaredContentType: "image/jpeg", count: 2, label: "Photos" },
    { declaredContentType: "video/mp4", count: 1, label: "Video" },
    { declaredContentType: "video/mp4", count: 2, label: "Videos" },
  ])(
    "uses $label for $count $declaredContentType picks and omits the other media count",
    ({ declaredContentType, count, label }) => {
      _renderOverview(
        Array.from({ length: count }, (_, position) => {
          return {
            ...makeUploadFileFromPosition(position),
            declaredContentType,
          };
        }),
      );
      expect(
        within(screen.getByText(label).parentElement!).getByText(
          String(count),
          {
            exact: true,
          },
        ),
      ).toBeVisible();
      ["Photo", "Photos", "Video", "Videos"]
        .filter((otherLabel) => {
          return otherLabel !== label;
        })
        .forEach((otherLabel) => {
          expect(screen.queryByText(otherLabel)).not.toBeInTheDocument();
        });
    },
  );

  it("counts refused and cancelled media picks but excludes their bytes and non-media counts", () => {
    const files = Array.from({ length: 5 }, (_, position) => {
      return makeUploadFileFromPosition(position);
    });
    files[0]!.declaredBytes = 2 * 1024 * 1024;
    files[1]!.declaredContentType = "image/bmp";
    files[1]!.state = "refused";
    files[1]!.declaredBytes = 3 * 1024 * 1024;
    files[2]!.declaredContentType = "video/quicktime";
    files[2]!.declaredBytes = 5 * 1024 * 1024;
    files[3]!.declaredContentType = "video/mp4";
    files[3]!.state = "cancelled";
    files[3]!.declaredBytes = 7 * 1024 * 1024;
    files[4]!.declaredContentType = "text/plain";
    files[4]!.state = "refused";
    files[4]!.declaredBytes = 11 * 1024 * 1024;
    _renderOverview(files);
    ["Photos", "Videos"].forEach((label) => {
      expect(
        within(screen.getByText(label).parentElement!).getByText("2", {
          exact: true,
        }),
      ).toBeVisible();
    });
    expect(
      within(screen.getByText("To upload").parentElement!).getByText("7 MB", {
        exact: true,
      }),
    ).toBeVisible();
  });

  it("omits both media counts for only non-media picks", () => {
    _renderOverview([
      {
        ...makeUploadFileFromPosition(0),
        declaredContentType: "application/octet-stream",
        state: "refused",
      },
    ]);
    expect(screen.queryByText(/^Photos?$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Videos?$/)).not.toBeInTheDocument();
    expect(screen.getByText("0 MB", { exact: true })).toBeVisible();
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
