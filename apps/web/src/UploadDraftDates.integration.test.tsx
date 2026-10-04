import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UploadUndated } from "./surfaces/Upload/UploadDraft/UploadUndated/UploadUndated";

describe("upload draft composition", () => {
  it("undated correction sends the chosen calendar day for the known row", async () => {
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
});
