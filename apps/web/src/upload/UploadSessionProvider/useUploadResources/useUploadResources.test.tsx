import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makePreviewHarnessFromOptions } from "@/upload/createUploadPreviewQueue/__tests__/makePreviewHarnessFromOptions";
import * as controllerModule from "@/upload/createUploadSessionController/createUploadSessionController";
import * as previewModule from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useUploadResources } from "./useUploadResources";

afterEach(() => {
  return vi.restoreAllMocks();
});

it("prepares a newly visible preview while the upload is running", async () => {
  const harness = makeUploadControllerHarness();
  const previews = makePreviewHarnessFromOptions();
  vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
    harness.controller,
  );
  vi.spyOn(previewModule, "createUploadPreviewQueue").mockReturnValue(
    previews.queue,
  );
  const queryClient = new QueryClient();
  const view = renderHook(
    () => {
      return useUploadResources("member");
    },
    {
      wrapper: ({ children }) => {
        return (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        );
      },
    },
  );
  await act(async () => {
    await harness.controller.pickFiles([new File(["photo"], "original.jpg")]);
  });
  act(() => {
    void harness.controller.startUpload({ mode: "everyone", subjects: [] });
  });
  await waitFor(() => {
    return expect(harness.controller.getSnapshot().isRunning).toBe(true);
  });
  act(() => {
    return previews.request("visible-during-transfer");
  });
  await waitFor(() => {
    return expect(previews.requests).toHaveLength(1);
  });
  act(() => {
    return previews.answer({ index: 0 });
  });
  await waitFor(() => {
    return expect(
      previews.queue.getPreview("visible-during-transfer")?.kind,
    ).toBe("ready");
  });
  view.unmount();
});
