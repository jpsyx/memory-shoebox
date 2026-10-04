import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { stubFetch, getRecordedRequests } from "@/testing/fetchStubHelpers";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadMilestoneDetail,
  makeUploadSurfaceDetail,
} from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { UploadMilestoneModal } from "./UploadMilestoneModal";

async function _render(days = ["2026-09-15", "2026-09-17"], listStatus = 200) {
  stubFetch({
    "GET /api/milestones": {
      status: listStatus,
      body: { milestones: [makeUploadMilestoneDetail()], nextCursor: null },
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
function _create(count: number) {
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
describe("inline upload milestones", () => {
  it("prefills a fresh selection when a previously closed modal opens", async () => {
    const harness = await _render(["2026-09-17"]);
    const nextSnapshot = harness.controller.getSnapshot();
    nextSnapshot.detail!.files[0]!.capturedOn = "2026-09-15";
    harness.rendered.rerender(
      <QueryClientProvider client={harness.queryClient}>
        <MantineProvider>
          <UploadMilestoneModal
            memberId="018f0000-0000-7000-8000-000000000001"
            opened={false}
            snapshot={nextSnapshot}
            controller={harness.controller}
            onClose={harness.onClose}
          />
        </MantineProvider>
      </QueryClientProvider>,
    );
    harness.rendered.rerender(
      <QueryClientProvider client={harness.queryClient}>
        <MantineProvider>
          <UploadMilestoneModal
            memberId="018f0000-0000-7000-8000-000000000001"
            opened
            snapshot={nextSnapshot}
            controller={harness.controller}
            onClose={harness.onClose}
          />
        </MantineProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      return expect(
        screen.getByRole("button", {
          name: "Create a new milestone for these",
        }),
      ).toBeEnabled();
    });
    _create(1);
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalled();
    });
    expect(
      getRecordedRequests().find((request) => {
        return request.method === "POST";
      })?.body,
    ).toMatchObject({ startsOn: "2026-09-15", endsOn: "2026-09-15" });
  });

  it("a delayed creation answer cannot attach to a replacement session", async () => {
    const harness = await _render();
    const response = makeDeferredAnswer<Response>();
    const fetchMock = vi.mocked(fetch);
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((...args) => {
      return args[1]?.method === "POST"
        ? response.promise
        : originalFetch(...args);
    });
    _create(2);
    harness.serverDetail.sessionId = "018f0000-0000-7000-8000-00000000c002";
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    harness.controller.selectAll();
    harness.rendered.rerender(
      <QueryClientProvider client={harness.queryClient}>
        <MantineProvider>
          <UploadMilestoneModal
            memberId="018f0000-0000-7000-8000-000000000001"
            opened
            snapshot={harness.controller.getSnapshot()}
            controller={harness.controller}
            onClose={harness.onClose}
          />
        </MantineProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      response.answer(
        Response.json(makeUploadMilestoneDetail(), { status: 201 }),
      );
      await response.promise;
    });
    expect(harness.api.createUploadEdit).not.toHaveBeenCalled();
    expect(harness.onClose).not.toHaveBeenCalled();
  });
  it("prefills the selected capture span and posts before attaching", async () => {
    const harness = await _render();
    _create(2);
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalledTimes(1);
    });
    expect(
      getRecordedRequests().find((request) => {
        return request.method === "POST";
      })?.body,
    ).toEqual({
      name: "A visit",
      startsOn: "2026-09-15",
      endsOn: "2026-09-17",
      blurb: null,
    });
    expect(harness.api.createUploadEdit).toHaveBeenLastCalledWith({
      sessionId: harness.serverDetail.sessionId,
      body: {
        kind: "milestone",
        milestoneId: makeUploadMilestoneDetail().milestone.milestoneId,
        targetFileIds: harness.serverDetail.files.map((file) => {
          return file.fileId;
        }),
      },
    });
    expect(harness.api.getUploadSession.mock.calls.length).toBeGreaterThan(1);
  });
  it("collapses one day to equal endpoints", async () => {
    const harness = await _render(["2026-09-17"]);
    _create(1);
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalled();
    });
    expect(
      getRecordedRequests().find((request) => {
        return request.method === "POST";
      })?.body,
    ).toMatchObject({ startsOn: "2026-09-17", endsOn: "2026-09-17" });
  });
  it("attachment retries never create a second milestone", async () => {
    const harness = await _render();
    harness.api.createUploadEdit.mockRejectedValueOnce(
      new ApiRequestError({
        status: 503,
        code: "unavailable",
        message: "Try attachment again",
      }),
    );
    _create(2);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /created|saved/i,
    );
    expect(
      screen.queryByRole("button", { name: "Create it and attach 2" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry attachment" }));
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalledTimes(1);
    });
    expect(
      getRecordedRequests().filter((request) => {
        return request.method === "POST";
      }),
    ).toHaveLength(1);
    expect(
      harness.api.createUploadEdit.mock.calls.map(([options]) => {
        return options.body.milestoneId;
      }),
    ).toEqual([
      makeUploadMilestoneDetail().milestone.milestoneId,
      makeUploadMilestoneDetail().milestone.milestoneId,
    ]);
  });
  it("lost creation answers require a reload and explicit review before another create", async () => {
    const harness = await _render();
    const fetchMock = vi.mocked(fetch);
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (...args) => {
      if (args[1]?.method === "POST") {
        throw new TypeError("Network lost");
      }
      return originalFetch(...args);
    });
    _create(2);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /may have been created/i,
    );
    expect(harness.api.createUploadEdit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Create it and attach 2" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Reload milestones to review" }),
    );
    await screen.findByRole("button", { name: /I reviewed the list/ });
    expect(
      screen.getByRole("button", { name: /Home from the hospital/ }),
    ).toBeVisible();
    expect(harness.api.createUploadEdit).not.toHaveBeenCalled();
  });
  it("absent list routes show an unavailable state and explicit retry", async () => {
    await _render(["2026-09-17"], 404);
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
    fireEvent.click(screen.getByRole("button", { name: "Retry milestones" }));
    await waitFor(() => {
      return expect(
        getRecordedRequests().filter((request) => {
          return request.method === "GET";
        }),
      ).toHaveLength(2);
    });
  });
});
