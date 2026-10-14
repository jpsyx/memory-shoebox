import { makePreviewHarnessFromOptions } from "@/upload/createUploadPreviewQueue/__tests__/uploadPreviewTestHelpers";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { makeIdleUploadSnapshot } from "@/upload/createUploadSessionController/uploadIdleSnapshotHelpers";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { UploadTransfer } from "./UploadTransfer";

it.each(["sending", "resume", "partial"] as const)(
  "announces original storage limitations during %s",
  (phase) => {
    const detail = makeUploadSurfaceDetail({
      state: "uploading",
      files: [],
      days: [],
    });
    const { controller } = makeUploadControllerHarness(detail);
    const warning =
      "Keep this tab open. Originals could not be saved on this device.";
    const snapshot = {
      ...makeIdleUploadSnapshot(),
      detail,
      phase,
      isRunning: phase === "sending",
      recoveryStorageWarning: warning,
    };
    const previews = makePreviewHarnessFromOptions();
    render(
      <MantineProvider>
        <UploadTransfer
          snapshot={snapshot}
          controller={controller}
          previews={previews.queue}
          viewer={{ memberId: "member" }}
          onPick={vi.fn()}
          onUploadMore={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(warning);
    previews.queue.destroy();
  },
);
