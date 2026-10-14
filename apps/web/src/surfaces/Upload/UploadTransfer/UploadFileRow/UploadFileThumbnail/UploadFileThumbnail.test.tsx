import { makePreviewHarnessFromOptions } from "@/upload/createUploadPreviewQueue/__tests__/uploadPreviewTestHelpers";
import { makeUploadFileFromPosition } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UploadFileThumbnail } from "./UploadFileThumbnail";

afterEach(() => {
  return vi.unstubAllGlobals();
});

it("requests only visible previews and releases transfer ownership without touching day-group previews", async () => {
  const harness = makePreviewHarnessFromOptions();
  const file = makeUploadFileFromPosition(0);
  let onIntersection: IntersectionObserverCallback | undefined;
  let observedElement: Element | undefined;
  class RecordingObserver extends IntersectionObserver {
    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      super(callback, options);
      onIntersection = callback;
    }
    override observe(element: Element): void {
      observedElement = element;
    }
  }
  vi.stubGlobal("IntersectionObserver", RecordingObserver);
  const view = render(
    <UploadFileThumbnail
      file={file}
      localFile={new File(["photo"], file.originalFilename)}
      previews={harness.queue}
    />,
  );
  expect(harness.requests).toHaveLength(0);
  const rectangle = observedElement!.getBoundingClientRect();
  act(() => {
    return onIntersection!(
      [
        {
          target: observedElement!,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: rectangle,
          intersectionRect: rectangle,
          rootBounds: null,
          time: 0,
        },
      ],
      new RecordingObserver(() => {}),
    );
  });
  expect(harness.requests).toHaveLength(1);
  act(() => {
    return harness.answer({ index: 0 });
  });
  await screen.findByRole("img", { name: file.originalFilename });
  harness.request(file.fileId);
  harness.answer({ index: 1 });
  await waitFor(() => {
    return expect(harness.queue.getPreview(file.fileId)?.kind).toBe("ready");
  });
  view.unmount();
  expect(harness.queue.getPreview(`transfer:${file.fileId}`)).toBeUndefined();
  expect(harness.queue.getPreview(file.fileId)?.kind).toBe("ready");
  harness.queue.destroy();
});
