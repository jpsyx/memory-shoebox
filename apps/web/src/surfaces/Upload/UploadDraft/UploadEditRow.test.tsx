import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  makeUploadSnapshotFromDetail,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { UploadEditRow } from "./UploadEditRow";
it("labels a typed draft identity before ingest without changing its persisted name", () => {
  const detail = makeUploadSurfaceDetail();
  const edit = {
    editId: "edit",
    kind: "person" as const,
    label: "Jorge",
    tag: null,
    person: null,
    milestone: null,
    targetCount: 1,
    createdAt: detail.createdAt,
    undoneAt: null,
    appliedAt: null,
    canUndo: true,
  };
  render(
    <MantineProvider>
      <UploadEditRow
        edit={edit}
        snapshot={makeUploadSnapshotFromDetail(detail)}
        onUndo={vi.fn()}
        isPending={false}
      />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Undo Jorge (not a member)" }),
  ).toBeVisible();
  expect(screen.getByText("(not a member)")).toBeVisible();
  expect(edit.label).toBe("Jorge");
});
