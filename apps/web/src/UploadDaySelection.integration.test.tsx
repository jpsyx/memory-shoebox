import { createUploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UploadDayGroup } from "./surfaces/Upload/UploadDayGroup/UploadDayGroup";

async function _renderDay(): Promise<
  ReturnType<typeof makeUploadControllerHarness> & {
    previews: ReturnType<typeof createUploadPreviewQueue>;
  }
> {
  const detail = makeUploadSurfaceDetail({
    files: makeUploadSurfaceDetail()
      .files.slice(0, 212)
      .map((file) => {
        return { ...file, capturedOn: "2026-09-14" };
      }),
  });
  const harness = makeUploadControllerHarness(detail);
  await harness.controller.loadSession(detail.sessionId);
  const snapshot = harness.controller.getSnapshot();
  const previews = createUploadPreviewQueue();
  render(
    <MantineProvider>
      <UploadDayGroup
        day={{ capturedOn: "2026-09-14", fileCount: 212, milestones: [] }}
        snapshot={snapshot}
        controller={harness.controller}
        previews={previews}
      />
    </MantineProvider>,
  );
  return { ...harness, previews };
}

describe("capture-day upload prints", () => {
  it("tick day includes unrendered rows without an API write", async () => {
    const harness = await _renderDay();
    expect(screen.getAllByRole("button", { name: /IMG_/ })).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Tick all 212" }));
    expect(harness.controller.getSnapshot().selectedFileIds.size).toBe(212);
    expect(harness.api.createUploadEdit).not.toHaveBeenCalled();
    expect(harness.api.completeUploadFile).not.toHaveBeenCalled();
    harness.previews.destroy();
    harness.controller.destroy();
  });
  it("a preview decode refusal still allows filename selection", async () => {
    const harness = await _renderDay();
    const file = harness.controller.getSnapshot().detail!.files[0]!;
    harness.previews.requestPreview({
      fileId: file.fileId,
      file: new File(["unsupported"], file.originalFilename),
      contentType: file.declaredContentType,
      size: { width: 600, height: 900 },
    });
    await waitFor(() => {
      expect(harness.previews.getPreview(file.fileId)?.kind).toBe(
        "unavailable",
      );
    });
    const button = screen.getByRole("button", { name: /IMG_0.jpg/ });
    expect(button).toBeEnabled();
    expect(button).toHaveStyle({ aspectRatio: "600 / 900" });
    fireEvent.click(button);
    expect(harness.controller.getSnapshot().selectedFileIds.size).toBe(1);
    harness.previews.destroy();
    harness.controller.destroy();
  });
});
