import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { makeUploadControllerHarness } from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadMilestoneDetail,
  makeUploadSurfaceDetail,
} from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import { UploadMilestoneModal } from "./UploadMilestoneModal";

type MilestoneModalHarness = ReturnType<typeof makeUploadControllerHarness> & {
  onClose: ReturnType<typeof vi.fn<() => void>>;
  queryClient: QueryClient;
  rendered: ReturnType<typeof render>;
};

/** Supports the upload occasion interaction tests. */
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
  const harness = makeUploadControllerHarness(
    makeUploadSurfaceDetail({ files, fileCount: files.length }),
  );
  await harness.controller.loadSession(harness.serverDetail.sessionId);
  harness.controller.selectAll();
  harness.api.createUploadEdit.mockImplementation(async ({ body }) => {
    return {
      editId: makeUploadFileFromPosition(9000).fileId,
      kind: "milestone",
      label: "Home from the hospital",
      tag: null,
      person: null,
      milestone: makeUploadMilestoneDetail().milestone,
      targetCount: body.targetFileIds.length,
      createdAt: "2026-10-03T00:00:00.000Z",
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    };
  });
  const onClose = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <UploadMilestoneModal
          memberId="018f0000-0000-7000-8000-000000000001"
          opened
          snapshot={harness.controller.getSnapshot()}
          controller={harness.controller}
          onClose={onClose}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    return expect(
      screen.getByRole("button", { name: "Create a new milestone for these" }),
    ).toBeEnabled();
  });
  return { ...harness, onClose, queryClient, rendered };
}

/** Supports the upload occasion interaction tests. */
export function createUploadMilestoneThroughForm(count: number): void {
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
    screen.getByRole("button", { name: `Create it and attach ${count}` }),
  );
}

/** Supports the upload occasion interaction tests. */
export function makeUploadFocusOwner(): HTMLElement {
  const owner = document.createElement("main");
  owner.innerHTML =
    '<div aria-label="Upload to Family"><h1>Put it all up.</h1><button>Continue</button></div>';
  document.body.append(owner);
  return owner;
}

/** Supports the upload occasion interaction tests. */
export function closeUploadMilestoneModal(
  harness: Awaited<ReturnType<typeof renderUploadMilestoneModal>>,
): void {
  harness.rendered.rerender(
    <QueryClientProvider client={harness.queryClient}>
      <MantineProvider>
        <UploadMilestoneModal
          memberId="018f0000-0000-7000-8000-000000000001"
          opened={false}
          snapshot={harness.controller.getSnapshot()}
          controller={harness.controller}
          onClose={harness.onClose}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
}
