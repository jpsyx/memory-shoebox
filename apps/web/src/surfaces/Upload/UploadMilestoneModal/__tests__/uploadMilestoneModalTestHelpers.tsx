import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { makeControlledUploadSessionFromSnapshot } from "@/testing/makeControlledUploadSessionFromSnapshot";
import {
  makeUploadFileFromPosition,
  makeUploadMilestoneDetail,
  makeUploadSurfaceDetail,
  makeUploadSnapshotFromDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { QueryClient } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import { expect, vi, type Mock, type Mocked } from "vitest";
import { MilestoneModalFixture } from "./MilestoneModalFixture";

type MilestoneModalHarness = {
  controller: Mocked<UploadSessionController>;
  onClose: Mock<() => void>;
  queryClient: QueryClient;
  rendered: RenderResult;
  publishSnapshot: (snapshot: Readonly<UploadSnapshot>) => void;
  renderSnapshot: (
    options: Readonly<{ snapshot: UploadSnapshot; opened?: boolean }>,
  ) => void;
};

/**
 * Renders the modal with real HTTP creation and a controlled attachment
 * boundary.
 */
export async function renderUploadMilestoneModal({
  days = ["2026-09-15", "2026-09-17"],
  listStatus = 200,
  milestones = [makeUploadMilestoneDetail()],
}: Readonly<{
  days?: string[];
  listStatus?: number;
  milestones?: Array<ReturnType<typeof makeUploadMilestoneDetail>>;
}>): Promise<MilestoneModalHarness> {
  stubFetch({
    "GET /api/milestones": {
      status: listStatus,
      body: { milestones, nextCursor: null },
    },
    "POST /api/milestones": { status: 201, body: makeUploadMilestoneDetail() },
  });
  const files = days.map((capturedOn, position) => {
    return {
      ...makeUploadFileFromPosition(position),
      capturedOn,
    };
  });
  const snapshot: UploadSnapshot = {
    ...makeUploadSnapshotFromDetail(
      makeUploadSurfaceDetail({ files, fileCount: files.length }),
    ),
    phase: "draft",
    isRunning: false,
    selectedFileIds: new Set(
      files.map((file) => {
        return file.fileId;
      }),
    ),
  };
  const session = makeControlledUploadSessionFromSnapshot(snapshot);
  const onClose = vi.fn<() => void>();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <MilestoneModalFixture
      queryClient={queryClient}
      snapshot={snapshot}
      controller={session.controller}
      onClose={onClose}
    />,
  );
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Create a new milestone for these" }),
    ).toBeEnabled();
  });
  return {
    ...session,
    onClose,
    queryClient,
    rendered,
    renderSnapshot: ({ snapshot: updatedSnapshot, opened }) => {
      session.publishSnapshot(updatedSnapshot);
      rendered.rerender(
        <MilestoneModalFixture
          queryClient={queryClient}
          snapshot={updatedSnapshot}
          controller={session.controller}
          onClose={onClose}
          opened={opened}
        />,
      );
    },
  };
}

/** Submits a named occasion after verifying typing alone sends no request. */
export function createUploadMilestoneThroughForm(
  selectedFileCount: number,
): void {
  fireEvent.click(
    screen.getByRole("button", { name: "Create a new milestone for these" }),
  );
  fireEvent.change(screen.getByLabelText("What happened"), {
    target: { value: "A visit" },
  });
  expect(
    getRecordedRequests().filter((request) => {
      return request.method === "POST";
    }),
  ).toHaveLength(0);
  fireEvent.click(
    screen.getByRole("button", {
      name: `Create it and attach ${selectedFileCount}`,
    }),
  );
}

/** Returns an attached upload heading and button for focus recovery tests. */
export function makeUploadFocusOwner(): HTMLElement {
  const owner = document.createElement("main");
  owner.innerHTML =
    '<div aria-label="Upload to Family"><h1>Put it all up.</h1><button>Continue</button></div>';
  document.body.append(owner);
  return owner;
}

/** Closes the modal with its current controlled session state. */
export function closeUploadMilestoneModal(
  harness: Readonly<MilestoneModalHarness>,
): void {
  harness.renderSnapshot({
    snapshot: harness.controller.getSnapshot(),
    opened: false,
  });
}
