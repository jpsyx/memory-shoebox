import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { makeIdleUploadSnapshot } from "@/upload/uploadSessionController/uploadIdleSnapshotHelpers";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
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
