import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeUploadControllerHarness } from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { createUploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers";
import { UploadDayGroup } from "./UploadDayGroup";

async function _renderDay() {
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
  it("reveals every remaining print through the explicit Show all button", async () => {
    const harness = await _renderDay();
    fireEvent.click(screen.getByRole("button", { name: "Show all 212" }));
    expect(screen.getAllByRole("button", { name: /IMG_/ })).toHaveLength(212);
    harness.previews.destroy();
    harness.controller.destroy();
  });
  it("requests near-visible local previews and releases offscreen and unmounted prints", async () => {
    const harness = await _renderDay();
    const snapshot = harness.controller.getSnapshot();
    const first = snapshot.detail!.files[0]!;
    snapshot.filesById.set(
      first.fileId,
      new File(["photo"], first.originalFilename),
    );
    let onIntersection: IntersectionObserverCallback | undefined;
    const OriginalObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends OriginalObserver {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        super(callback, options);
        onIntersection = callback;
      }
    };
    harness.previews.setPaused(true);
    const request = vi.spyOn(harness.previews, "requestPreview");
    const release = vi.spyOn(harness.previews, "release");
    const view = render(
      <MantineProvider>
        <UploadDayGroup
          day={{ capturedOn: "2026-09-14", fileCount: 212, milestones: [] }}
          snapshot={snapshot}
          controller={harness.controller}
          previews={harness.previews}
        />
      </MantineProvider>,
    );
    const observer = new OriginalObserver(() => {});
    onIntersection?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer,
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: first.fileId,
        file: snapshot.filesById.get(first.fileId),
      }),
    );
    onIntersection?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      observer,
    );
    expect(release).toHaveBeenCalledWith(first.fileId);
    view.unmount();
    expect(release).toHaveBeenCalledTimes(2);
    window.IntersectionObserver = OriginalObserver;
    harness.previews.destroy();
    harness.controller.destroy();
  });
  it("shows known edit markers independently of ticks", async () => {
    const harness = await _renderDay();
    const snapshot = harness.controller.getSnapshot();
    snapshot.detail!.edits = [
      {
        editId: "saved",
        kind: "tag",
        label: "Home",
        tag: null,
        person: null,
        milestone: null,
        targetCount: 1,
        createdAt: "2026-10-03T00:00:00.000Z",
        undoneAt: null,
        appliedAt: null,
        canUndo: true,
      },
    ];
    snapshot.editTargets.set("saved", [snapshot.detail!.files[0]!.fileId]);
    render(
      <MantineProvider>
        <UploadDayGroup
          day={{ capturedOn: "2026-09-14", fileCount: 212, milestones: [] }}
          snapshot={snapshot}
          controller={harness.controller}
          previews={harness.previews}
        />
      </MantineProvider>,
    );
    expect(screen.getByText("1 saved label")).toBeInTheDocument();
    expect(snapshot.selectedFileIds.size).toBe(0);
    harness.previews.destroy();
    harness.controller.destroy();
  });
});
