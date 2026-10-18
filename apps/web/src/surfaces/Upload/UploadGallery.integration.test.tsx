import { makePreviewHarnessFromOptions } from "@/upload/createUploadPreviewQueue/__tests__/makePreviewHarnessFromOptions";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSnapshotFromDetail,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { UploadDraftDays } from "./UploadDraft/UploadDraftDays";
import { UploadDuplicateFiles } from "./UploadTransfer/UploadDone/UploadDuplicateFiles";

function _makeGalleryFiles(): UploadFileDto[] {
  return Array.from({ length: 16 }, (_, position) => {
    const file = makeUploadFileFromPosition(position);
    if (position < 2) {
      return {
        ...file,
        state: "cancelled",
        duplicateReason: position === 0 ? "archive" : "batch",
      };
    }
    // A cancelled non-duplicate remains visible; state alone is not identity.
    return position === 3 ? { ...file, state: "cancelled" } : file;
  });
}

function _renderGallery(
  options: Readonly<{
    files: UploadFileDto[];
    state: "draft" | "settled";
  }>,
) {
  const day = {
    capturedOn: "2026-10-01",
    fileCount: options.files.length,
    milestones: [],
  };
  const detail = makeUploadSurfaceDetail({ ...options, days: [day] });
  const snapshot = makeUploadSnapshotFromDetail(detail);
  snapshot.phase = options.state === "draft" ? "draft" : "done";
  snapshot.isRunning = false;
  snapshot.fileActivityById.set(options.files[2]!.fileId, {
    kind: "duplicate",
  });
  const { controller } = makeUploadControllerHarness(detail);
  const previews = makePreviewHarnessFromOptions();
  const view = render(
    <MantineProvider env="test">
      <UploadDuplicateFiles snapshot={snapshot} previews={previews.queue} />
      <UploadDraftDays
        snapshot={snapshot}
        controller={controller}
        previews={previews.queue}
      />
    </MantineProvider>,
  );
  return {
    dispose: () => {
      view.unmount();
      previews.queue.destroy();
      controller.destroy();
    },
  };
}

it.each(["draft", "settled"] as const)(
  "keeps duplicates only in their list and counts non-duplicate gallery prints in %s",
  (state) => {
    const files = _makeGalleryFiles();
    const harness = _renderGallery({ files, state });
    try {
      const gallery = within(
        screen.getByRole("region", { name: "The days in this batch" }),
      );
      files.slice(0, 3).forEach((file) => {
        expect(screen.getByText(file.originalFilename)).toBeVisible();
        expect(
          gallery.queryByRole("button", {
            name: new RegExp(file.originalFilename),
          }),
        ).not.toBeInTheDocument();
      });
      expect(gallery.getByText("13", { exact: true })).toBeVisible();
      expect(gallery.getAllByRole("button", { name: /IMG_/ })).toHaveLength(12);
      fireEvent.click(gallery.getByRole("button", { name: "Show all 13" }));
      expect(gallery.getAllByRole("button", { name: /IMG_/ })).toHaveLength(13);
      files.slice(3).forEach((file) => {
        expect(
          gallery.getByRole("button", {
            name: new RegExp(file.originalFilename),
          }),
        ).toBeVisible();
      });
      expect(
        gallery.queryByRole("button", { name: /Show all/ }),
      ).not.toBeInTheDocument();
    } finally {
      harness.dispose();
    }
  },
);

it("omits a capture day containing only duplicates while retaining their notices", () => {
  const files = _makeGalleryFiles().slice(0, 3);
  const harness = _renderGallery({ files, state: "draft" });
  try {
    expect(
      screen.queryByRole("region", { name: "2026-10-01" }),
    ).not.toBeInTheDocument();
    files.forEach((file) => {
      expect(screen.getByText(file.originalFilename)).toBeVisible();
    });
  } finally {
    harness.dispose();
  }
});
