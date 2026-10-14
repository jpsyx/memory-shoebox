import { makePreviewHarnessFromOptions } from "@/upload/createUploadPreviewQueue/__tests__/uploadPreviewTestHelpers";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { makeIdleUploadSnapshot } from "@/upload/createUploadSessionController/uploadIdleSnapshotHelpers";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { UploadTransfer } from "./UploadTransfer";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...original,
    Link: ({ children }: Readonly<{ children: ReactNode }>) => {
      return <a href="/">{children}</a>;
    },
  };
});

it("omits keep-tab-open storage guidance once every original completed", () => {
  const detail = makeUploadSurfaceDetail({
    state: "settled",
    files: [],
    days: [],
  });
  const { controller } = makeUploadControllerHarness(detail);
  const warning =
    "Keep this tab open. Originals could not be saved on this device.";
  const snapshot = {
    ...makeIdleUploadSnapshot(),
    detail,
    phase: "done" as const,
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
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText(warning)).not.toBeInTheDocument();
  previews.queue.destroy();
});

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

it("places batch resume before the missing rows when 21 of 47 originals arrived", () => {
  const files = Array.from({ length: 47 }, (_, position) => {
    return {
      ...makeUploadFileFromPosition(position),
      state: position < 21 ? ("done" as const) : ("waiting" as const),
    };
  });
  const detail = makeUploadSurfaceDetail({
    state: "uploading",
    files,
    days: [],
    fileCount: 47,
  });
  const { controller } = makeUploadControllerHarness(detail);
  const snapshot = {
    ...makeIdleUploadSnapshot(),
    detail,
    phase: "resume" as const,
  };
  for (const file of files.slice(21)) {
    snapshot.filesById.set(
      file.fileId,
      new File(["photo"], file.originalFilename),
    );
  }
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
  const action = screen.getByRole("button", { name: "Resume upload" });
  const firstMissingFilename = screen.getByText(files[21]!.originalFilename);
  expect(
    action.compareDocumentPosition(firstMissingFilename) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getAllByRole("button", { name: "Resume upload" })).toHaveLength(
    1,
  );
  previews.queue.destroy();
});
