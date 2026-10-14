import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { makeIdleUploadSnapshot } from "@/upload/createUploadSessionController/uploadIdleSnapshotHelpers";
import { MantineProvider } from "@mantine/core";
import { render, screen, act, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { makePreviewHarnessFromOptions } from "@/upload/createUploadPreviewQueue/__tests__/uploadPreviewTestHelpers";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { UploadSending } from "./UploadSending";
it("keeps a late active original visible after the first twelve finish", () => {
  const files = Array.from({ length: 30 }, (_, position) => {
    return {
      ...makeUploadFileFromPosition(position),
      state: position < 29 ? ("done" as const) : ("sending" as const),
    };
  });
  const snapshot = {
    ...makeIdleUploadSnapshot(),
    detail: makeUploadSurfaceDetail({ files, fileCount: 30 }),
  };
  snapshot.fileActivityById.set(files[29]!.fileId, {
    kind: "transferring",
    sentBytes: 3,
    totalBytes: 10,
  });
  render(
    <MantineProvider>
      <UploadSending snapshot={snapshot} />
    </MantineProvider>,
  );
  expect(screen.getByText(files[29]!.originalFilename)).toBeVisible();
  expect(
    screen.queryByText(files[0]!.originalFilename),
  ).not.toBeInTheDocument();
});

it.each(["waiting", "sending", "failed", "done"] as const)(
  "shows a ready local thumbnail beside a %s original",
  async (state) => {
    const file = { ...makeUploadFileFromPosition(0), state };
    const snapshot = {
      ...makeIdleUploadSnapshot(),
      detail: makeUploadSurfaceDetail({ files: [file] }),
    };
    snapshot.filesById.set(
      file.fileId,
      new File(["photo"], file.originalFilename),
    );
    const harness = makePreviewHarnessFromOptions();
    harness.request(`transfer:${file.fileId}`);
    harness.answer({ index: 0 });
    await waitFor(() => {
      return expect(
        harness.queue.getPreview(`transfer:${file.fileId}`)?.kind,
      ).toBe("ready");
    });
    render(
      <MantineProvider>
        <UploadSending snapshot={snapshot} previews={harness.queue} />
      </MantineProvider>,
    );
    expect(
      screen.getByRole("img", { name: file.originalFilename }),
    ).toHaveAttribute("src", "blob:preview-1");
    act(() => {
      return harness.queue.destroy();
    });
  },
);

it("renders completed server media after local originals are lost on refresh", () => {
  const file = {
    ...makeUploadFileFromPosition(0),
    state: "done" as const,
    media: makeItemDetail().media,
  };
  const snapshot = {
    ...makeIdleUploadSnapshot(),
    detail: makeUploadSurfaceDetail({ files: [file] }),
  };
  render(
    <MantineProvider>
      <UploadSending snapshot={snapshot} />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("img", { name: file.originalFilename }),
  ).toHaveAttribute("src", file.media.thumb.url);
});
