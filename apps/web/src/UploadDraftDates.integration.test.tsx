import { makePreviewHarnessFromOptions } from "@/upload/createUploadPreviewQueue/__tests__/uploadPreviewTestHelpers";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
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
import { UploadUndated } from "./surfaces/Upload/UploadDraft/UploadUndated/UploadUndated";
import { UploadDraftFooter } from "./surfaces/Upload/UploadDraft/UploadDraftFooter";

afterEach(cleanup);

async function _renderDateReview() {
  const files = ["2026-09-14", null, "2026-09-16", null].map(
    (day, position) => {
      return {
        ...makeUploadFileFromPosition(position),
        capturedOn: day ?? "2026-10-10",
        captureSource: day ? ("exif" as const) : ("file_mtime" as const),
      };
    },
  );
  const detail = makeUploadSurfaceDetail({
    files,
    fileCount: 4,
    undated: {
      fileCount: 2,
      captureSource: "file_mtime",
      files: [files[1]!, files[3]!].map((file) => {
        return {
          fileId: file.fileId,
          originalFilename: file.originalFilename,
          capturedOn: file.capturedOn,
        };
      }),
    },
  });
  const harness = makeUploadControllerHarness(detail);
  const savedDetail = harness.serverDetail;
  harness.api.putUploadManifest.mockImplementation(
    async ({ files: entries }) => {
      const outcomes = entries.map((entry) => {
        const file = savedDetail.files.find((candidate) => {
          return candidate.fileId === entry.fileId;
        })!;
        file.capturedOn = entry.capturedAt!.slice(0, 10);
        file.captureSource = "uploader_set";
        return {
          clientRef: entry.clientRef,
          fileId: file.fileId,
          disposition: "matched" as const,
          state: file.state,
          capturedOn: file.capturedOn,
          captureSource: file.captureSource,
          problemCode: null,
        };
      });
      savedDetail.undated!.files = savedDetail.undated!.files.filter((file) => {
        return !entries.some((entry) => {
          return entry.fileId === file.fileId;
        });
      });
      savedDetail.undated!.fileCount = savedDetail.undated!.files.length;
      return {
        sessionId: detail.sessionId,
        fileCount: 4,
        totalBytes: 4000,
        outcomes,
      };
    },
  );
  await harness.controller.loadSession(detail.sessionId);
  const preview = makePreviewHarnessFromOptions();
  const onStart = vi.fn();
  function DateReview() {
    const snapshot = useSyncExternalStore(
      harness.controller.subscribe,
      harness.controller.getSnapshot,
    );
    return (
      <>
        <UploadUndated
          snapshot={snapshot}
          controller={harness.controller}
          previews={preview.queue}
        />
        <UploadDraftFooter
          snapshot={snapshot}
          controller={harness.controller}
          visibility={{ mode: "everyone", subjects: [] }}
          onStart={onStart}
        />
      </>
    );
  }
  const view = render(
    <MantineProvider env="test">
      <DateReview />
    </MantineProvider>,
  );
  return {
    ...harness,
    preview,
    onStart,
    dispose: () => {
      view.unmount();
      preview.queue.destroy();
    },
  };
}

describe("individual capture date review", () => {
  it("prefills independent neighboring dates and blocks upload until every date is confirmed", async () => {
    const harness = await _renderDateReview();
    const firstRow = screen.getByRole("form", { name: "Date for photo 2" });
    const secondRow = screen.getByRole("form", { name: "Date for photo 4" });
    expect(within(firstRow).getByLabelText("Capture date")).toHaveValue(
      "2026-09-14",
    );
    expect(within(secondRow).getByLabelText("Capture date")).toHaveValue(
      "2026-09-16",
    );
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeDisabled();
    expect(harness.serverDetail.files[1]!.captureSource).toBe("file_mtime");
    fireEvent.change(within(secondRow).getByLabelText("Capture date"), {
      target: { value: "2026-09-18" },
    });
    fireEvent.change(within(firstRow).getByLabelText("Capture date"), {
      target: { value: "2026-09-15" },
    });
    fireEvent.click(
      within(firstRow).getByRole("button", { name: "Confirm date" }),
    );
    await waitFor(() => {
      return expect(
        screen.queryByRole("form", { name: "Date for photo 2" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "1 date needs confirmation" }),
    ).toBeVisible();
    expect(harness.serverDetail.files[1]!.capturedOn).toBe("2026-09-15");
    expect(harness.serverDetail.files[3]!.captureSource).toBe("file_mtime");
    expect(within(secondRow).getByLabelText("Capture date")).toHaveValue(
      "2026-09-18",
    );
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeDisabled();
    expect(harness.api.putUploadManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            fileId: harness.serverDetail.files[1]!.fileId,
            capturedAt: "2026-09-15T00:00:00.000Z",
          }),
        ],
      }),
    );
    fireEvent.click(
      within(secondRow).getByRole("button", { name: "Confirm date" }),
    );
    await waitFor(() => {
      return expect(
        screen.queryByRole("region", { name: "Review capture dates" }),
      ).not.toBeInTheDocument();
    });
    expect(harness.serverDetail.files[3]!.capturedOn).toBe("2026-09-18");
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeEnabled();
    harness.dispose();
  });

  it("retains the thumbnail and edited date after a failed save, then removes only the confirmed photo on retry", async () => {
    const harness = await _renderDateReview();
    const row = screen.getByRole("form", { name: "Date for photo 2" });
    harness.api.putUploadManifest.mockRejectedValueOnce(
      new Error("Could not save. Try again."),
    );
    fireEvent.change(within(row).getByLabelText("Capture date"), {
      target: { value: "2026-09-12" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Confirm date" }));
    await waitFor(() => {
      return expect(within(row).getByRole("alert")).toHaveTextContent(
        "Could not save",
      );
    });
    expect(within(row).getByLabelText("Capture date")).toHaveValue(
      "2026-09-12",
    );
    expect(within(row).getByRole("figure", { name: "Photo 2" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeDisabled();
    fireEvent.click(within(row).getByRole("button", { name: "Confirm date" }));
    await waitFor(() => {
      return expect(
        screen.queryByRole("form", { name: "Date for photo 2" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("form", { name: "Date for photo 4" }),
    ).toBeVisible();
    harness.dispose();
  });

  it("shows thumbnails instead of filenames and keeps an empty date unconfirmed", async () => {
    const harness = await _renderDateReview();
    const file = harness.serverDetail.files[1]!;
    await act(async () => {
      harness.preview.request(`date-review:${file.fileId}`);
    });
    await waitFor(() => {
      return expect(harness.preview.requests).toHaveLength(1);
    });
    await act(async () => {
      harness.preview.answer({ index: 0 });
    });
    const row = screen.getByRole("form", { name: "Date for photo 2" });
    expect(
      within(row).getByRole("img", { name: "Photo 2 to date" }),
    ).toHaveAttribute("src", "blob:preview-1");
    expect(screen.queryByText(file.originalFilename)).not.toBeInTheDocument();
    fireEvent.change(within(row).getByLabelText("Capture date"), {
      target: { value: "" },
    });
    expect(
      within(row).getByRole("button", { name: "Confirm date" }),
    ).toBeDisabled();
    expect(harness.serverDetail.files[1]!.captureSource).toBe("file_mtime");
    harness.dispose();
  });
});
