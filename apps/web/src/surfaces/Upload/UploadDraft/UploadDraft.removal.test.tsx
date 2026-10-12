import { createUploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadDraft } from "./UploadDraft";

afterEach(cleanup);

async function _renderDraft(hasRefusedFile = false) {
  const complete = makeUploadSurfaceDetail();
  const detail = {
    ...complete,
    files: complete.files.slice(0, 3),
    fileCount: 3,
    totalBytes: 3000,
    days: [{ capturedOn: "2026-10-01", fileCount: 3, milestones: [] }],
  };
  if (hasRefusedFile) {
    detail.files[2]!.state = "refused";
    detail.files[2]!.capturedOn = null;
    detail.days[0]!.fileCount = 2;
  }
  const harness = makeUploadControllerHarness(detail);
  await harness.controller.loadSession(detail.sessionId);
  const previews = createUploadPreviewQueue();
  const onPick = vi.fn();
  function Draft() {
    const snapshot = useSyncExternalStore(
      harness.controller.subscribe,
      harness.controller.getSnapshot,
    );
    return (
      <UploadDraft
        snapshot={snapshot}
        controller={harness.controller}
        previews={previews}
        visibility={{ mode: "everyone", subjects: [] }}
        viewer={detail.uploadedBy}
        onVisibilityChange={vi.fn()}
        onStart={vi.fn()}
        onOpenMilestone={vi.fn()}
        onPick={onPick}
      />
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test">
        <Draft />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { ...harness, previews, onPick };
}

describe("removing draft media", () => {
  it("shows exact archive duplicates in the draft and excludes them from Upload", async () => {
    const harness = await _renderDraft();
    harness.serverDetail.files[2]!.state = "cancelled";
    harness.serverDetail.files[2]!.duplicateReason = "archive";
    await act(async () => {
      await harness.controller.loadSession(harness.serverDetail.sessionId);
    });
    expect(
      screen.getByText(
        "Duplicate: already in the shoebox. This file will be skipped.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Duplicate: already in the shoebox. This file will be skipped.",
      ).parentElement,
    ).toHaveTextContent("IMG_2.jpg");
    expect(screen.getByRole("button", { name: "Put 2 up" })).toBeEnabled();
    harness.previews.destroy();
  });
  it("asks before deleting all and cancellation keeps unticked and refused files", async () => {
    const harness = await _renderDraft(true);
    fireEvent.click(screen.getByRole("button", { name: /^IMG_0.jpg/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    const dialog = screen.getByRole("dialog", { name: "Remove 3 files?" });
    expect(dialog).toHaveTextContent("cannot be undone in this upload");
    expect(dialog).toHaveTextContent(
      "The originals on this device will stay unchanged.",
    );
    expect(harness.api.removeUploadFiles).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(harness.controller.getSnapshot().detail!.files).toHaveLength(3);
    expect(harness.controller.getSnapshot().selectedFileIds.size).toBe(1);
    expect(screen.getByRole("button", { name: "Put 2 up" })).toBeEnabled();
    expect(harness.api.removeUploadFiles).not.toHaveBeenCalled();
    harness.previews.destroy();
  });

  it("deletes every waiting and refused file only after confirmation", async () => {
    const harness = await _renderDraft(true);
    const fileIds = harness.serverDetail.files.map((file) => {
      return file.fileId;
    });
    expect(harness.controller.getSnapshot().filesById.size).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /^IMG_0.jpg/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    expect(harness.api.removeUploadFiles).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 3 files",
      }),
    );
    await waitFor(() => {
      expect(harness.controller.getSnapshot().detail!.files).toHaveLength(0);
    });
    expect(harness.api.removeUploadFiles).toHaveBeenCalledExactlyOnceWith({
      sessionId: harness.serverDetail.sessionId,
      fileIds,
    });
    expect(screen.getByRole("button", { name: "Put 0 up" })).toBeDisabled();
    expect(screen.getByText("Drop photos and videos here")).toBeVisible();
    harness.previews.destroy();
  });

  it("keeps Delete all targets fixed when the manifest grows before confirmation", async () => {
    const harness = await _renderDraft();
    fireEvent.click(screen.getByRole("button", { name: /^IMG_0.jpg/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    harness.serverDetail.files.push(makeUploadFileFromPosition(3));
    await act(async () => {
      await harness.controller.loadSession(harness.serverDetail.sessionId);
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 3 files",
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Put 1 up" })).toBeEnabled();
    });
    expect(harness.controller.getSnapshot().detail!.files).toEqual([
      makeUploadFileFromPosition(3),
    ]);
    harness.previews.destroy();
  });

  it("blocks Delete all and repeat confirmation during pending removal", async () => {
    const harness = await _renderDraft();
    let finishRemoval!: () => void;
    harness.api.removeUploadFiles.mockImplementationOnce(() => {
      return new Promise<void>((settle) => {
        finishRemoval = settle;
      });
    });
    fireEvent.click(screen.getByRole("button", { name: /^IMG_0.jpg/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    const confirmation = within(screen.getByRole("dialog")).getByRole(
      "button",
      { name: "Remove 3 files" },
    );
    fireEvent.click(confirmation);
    expect(screen.getByRole("button", { name: "Delete all" })).toBeDisabled();
    expect(confirmation).toBeDisabled();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    ).toBeDisabled();
    fireEvent.click(confirmation);
    await waitFor(() => {
      expect(harness.api.removeUploadFiles).toHaveBeenCalledTimes(1);
    });
    finishRemoval();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    harness.previews.destroy();
  });

  it("blocks Delete all while a removal result cannot be confirmed", async () => {
    const harness = await _renderDraft();
    harness.api.removeUploadFiles.mockRejectedValueOnce(new Error("Offline"));
    harness.api.getUploadSession.mockRejectedValueOnce(new Error("Offline"));
    fireEvent.click(screen.getByRole("button", { name: /^IMG_0.jpg/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 3 files",
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "could not be removed",
      );
    });
    expect(screen.getByRole("button", { name: "Delete all" })).toBeDisabled();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 3 files",
      }),
    ).toBeDisabled();
    expect(harness.controller.getSnapshot().detail!.files).toHaveLength(3);
    harness.previews.destroy();
  });

  it("asks before individual removal and cancellation preserves the draft", async () => {
    const harness = await _renderDraft();
    fireEvent.click(screen.getByRole("button", { name: "Remove IMG_0.jpg" }));
    const dialog = screen.getByRole("dialog", { name: "Remove 1 file?" });
    expect(harness.api.removeUploadFiles).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Put 3 up" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Remove IMG_0.jpg" }),
    ).toBeVisible();
    harness.previews.destroy();
  });

  it("removes ticked files together and updates the batch count", async () => {
    const harness = await _renderDraft();
    const selectedIds = harness.serverDetail.files.slice(0, 2).map((file) => {
      return file.fileId;
    });
    fireEvent.click(screen.getByRole("button", { name: /^IMG_0.jpg/ }));
    fireEvent.click(screen.getByRole("button", { name: /^IMG_1.jpg/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Remove 2 files?" })).getByRole(
        "button",
        { name: "Remove 2 files" },
      ),
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Put 1 up" })).toBeEnabled();
    });
    expect(harness.api.removeUploadFiles).toHaveBeenCalledWith({
      sessionId: harness.serverDetail.sessionId,
      fileIds: selectedIds,
    });
    expect(
      screen.queryByRole("button", { name: "Remove IMG_0.jpg" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove IMG_2.jpg" }),
    ).toBeVisible();
    expect(harness.controller.getSnapshot().selectedFileIds.size).toBe(0);
    harness.previews.destroy();
  });

  it("retains the files and shows an actionable failure when removal fails", async () => {
    const harness = await _renderDraft();
    harness.api.removeUploadFiles.mockRejectedValueOnce(
      new Error("Storage is offline"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove IMG_0.jpg" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 1 file",
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "could not be removed",
      );
    });
    expect(
      screen.getByRole("button", { name: "Remove IMG_0.jpg" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 1 file",
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Put 2 up" })).toBeEnabled();
    });
    harness.previews.destroy();
  });

  it("keeps the confirmation locked while removal is pending", async () => {
    const harness = await _renderDraft();
    let finishRemoval!: () => void;
    harness.api.removeUploadFiles.mockImplementationOnce(() => {
      return new Promise<void>((settle) => {
        finishRemoval = settle;
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove IMG_0.jpg" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 1 file",
      }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Put 3 up" })).toBeDisabled();
    await waitFor(() => {
      expect(harness.api.removeUploadFiles).toHaveBeenCalledTimes(1);
    });
    finishRemoval();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    harness.previews.destroy();
  });

  it("can remove refused picks and choose fresh files when only refusals remain", async () => {
    const harness = await _renderDraft(true);
    fireEvent.click(screen.getByRole("button", { name: /^IMG_0.jpg/ }));
    fireEvent.click(screen.getByRole("button", { name: /^IMG_1.jpg/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 2 files",
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Put 0 up" })).toBeDisabled();
    });
    expect(screen.getByText("Drop photos and videos here")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove IMG_2.jpg" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 1 file",
      }),
    );
    await waitFor(() => {
      expect(harness.controller.getSnapshot().detail!.files).toHaveLength(0);
    });
    harness.previews.destroy();
  });

  it("allows choosing files after every draft file has been removed", async () => {
    const harness = await _renderDraft();
    harness.serverDetail.files.forEach((file) => {
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`^${file.originalFilename}`),
        }),
      );
    });
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove 3 files",
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Put 0 up" })).toBeDisabled();
    });
    expect(screen.getByText("Drop photos and videos here")).toBeVisible();
    harness.previews.destroy();
  });
});
