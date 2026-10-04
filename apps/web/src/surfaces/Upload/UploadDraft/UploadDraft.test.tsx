import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeUploadControllerHarness } from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { createUploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers";
import { UploadDraft } from "./UploadDraft";
import { UploadUndated } from "./UploadUndated";

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
    detail.files[0]!.capturedOn = null;
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
});
