import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { makeIdleUploadSnapshot } from "@/upload/createUploadSessionController/uploadIdleSnapshotHelpers";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { UploadResumeActions } from "./UploadResumeActions";
import { UploadPartial } from "../UploadPartial";
import { UploadResume } from "./UploadResume";

function _makeRecoveryFixture() {
  const files = (
    [
      "waiting",
      "sending",
      "failed",
      "done",
      "refused",
      "cancelled",
      "waiting",
    ] as const
  ).map((state, position) => {
    return {
      ...makeUploadFileFromPosition(position),
      state,
      ...(position === 6 ? { duplicateReason: "archive" as const } : {}),
    };
  });
  const detail = makeUploadSurfaceDetail({ files, state: "uploading" });
  const { controller } = makeUploadControllerHarness(detail);
  const snapshot = {
    ...makeIdleUploadSnapshot(),
    detail,
    phase: "resume" as const,
  };
  for (const file of files)
    snapshot.filesById.set(
      file.fileId,
      new File(["photo"], file.originalFilename),
    );
  return { files, controller, snapshot };
}

it("resumes retained missing originals together without retrying completed or excluded rows", () => {
  const { controller, snapshot, files } = _makeRecoveryFixture();
  const retry = vi.spyOn(controller, "retryMissingFiles").mockResolvedValue();
  render(
    <MantineProvider>
      <UploadResumeActions
        snapshot={snapshot}
        controller={controller}
        onPick={vi.fn()}
      />
    </MantineProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Resume upload" }));
  expect(retry).toHaveBeenCalledWith(
    files.slice(0, 3).map((file) => {
      return file.fileId;
    }),
  );
  expect(
    screen.queryByRole("button", { name: "Choose files to resume" }),
  ).not.toBeInTheDocument();
});

it("offers available-file resume and file selection when one original is unavailable", () => {
  const { controller, snapshot, files } = _makeRecoveryFixture();
  snapshot.filesById.delete(files[1]!.fileId);
  const retry = vi.spyOn(controller, "retryMissingFiles").mockResolvedValue();
  render(
    <MantineProvider>
      <UploadResumeActions
        snapshot={snapshot}
        controller={controller}
        onPick={vi.fn()}
      />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Choose files to resume" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Resume upload" }));
  expect(retry).toHaveBeenCalledWith([files[0]!.fileId, files[2]!.fileId]);
});

it("uses Retry upload when only failed originals are missing", () => {
  const { controller, snapshot, files } = _makeRecoveryFixture();
  snapshot.detail = { ...snapshot.detail!, files: [files[2]!] };
  render(
    <MantineProvider>
      <UploadResumeActions
        snapshot={snapshot}
        controller={controller}
        onPick={vi.fn()}
      />
    </MantineProvider>,
  );
  expect(screen.getByRole("button", { name: "Retry upload" })).toBeEnabled();
});

it.each(["busy", "running", "loading", "checking", "ambiguous"])(
  "disables resume while %s",
  (condition) => {
    const { controller, snapshot } = _makeRecoveryFixture();
    const blockedSnapshot = {
      ...snapshot,
      isBusy: condition === "busy",
      isRunning: condition === "running",
      phase:
        condition === "loading"
          ? ("loading" as const)
          : condition === "checking"
            ? ("checking" as const)
            : snapshot.phase,
      recoveryMatches: {
        ...snapshot.recoveryMatches,
        ambiguous:
          condition === "ambiguous"
            ? [{ fileIds: ["one", "two"], clientRef: "pick" }]
            : [],
      },
    };
    render(
      <MantineProvider>
        <UploadResumeActions
          snapshot={blockedSnapshot}
          controller={controller}
          onPick={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Resume upload" }),
    ).toBeDisabled();
  },
);

it("counts waiting and sending originals as missing alongside failures", () => {
  const { controller, snapshot } = _makeRecoveryFixture();
  render(
    <MantineProvider>
      <UploadPartial snapshot={snapshot} controller={controller} />
    </MantineProvider>,
  );
  expect(
    screen.getAllByText("Did not arrive")[0]!.closest("div")?.textContent,
  ).toContain("3");
});

it("explains that the whole original selection is safe when local handles are incomplete", () => {
  const { controller, snapshot, files } = _makeRecoveryFixture();
  snapshot.filesById.delete(files[0]!.fileId);
  render(
    <MantineProvider>
      <UploadResume
        snapshot={snapshot}
        controller={controller}
        onPick={vi.fn()}
      />
    </MantineProvider>,
  );
  expect(
    screen.getByText(/1 original needs to be chosen again/),
  ).toHaveTextContent(
    "You can choose the whole original selection or folder. Files already up are recognized by their contents and are not sent twice.",
  );
});
