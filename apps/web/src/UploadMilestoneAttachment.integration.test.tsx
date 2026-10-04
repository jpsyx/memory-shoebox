import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import { makeDeferredAnswer } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadMilestoneDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadMilestoneModal } from "./surfaces/Upload/UploadMilestoneModal/UploadMilestoneModal";
import {
  createUploadMilestoneThroughForm,
  renderUploadMilestoneModal,
} from "./testing/uploadMilestoneModalTestHelpers";

describe("inline upload milestones", () => {
  it("a delayed creation keeps submitted targets across surface unmount and selection change", async () => {
    const harness = await renderUploadMilestoneModal({});
    const submitted = [...harness.controller.getSnapshot().selectedFileIds];
    const response = makeDeferredAnswer<Response>();
    const fetchMock = vi.mocked(fetch);
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((...args) => {
      return args[1]?.method === "POST"
        ? response.promise
        : originalFetch(...args);
    });
    createUploadMilestoneThroughForm(2);
    harness.rendered.unmount();
    harness.controller.clearSelection();
    harness.controller.toggleFile(submitted[1]!);
    await act(async () => {
      response.answer(
        Response.json(makeUploadMilestoneDetail(), { status: 201 }),
      );
      await response.promise;
    });
    await waitFor(() => {
      return expect(harness.api.createUploadEdit).toHaveBeenCalled();
    });
    expect(
      harness.api.createUploadEdit.mock.calls[0]![0].body.targetFileIds,
    ).toEqual(submitted);
  });
  it("a delayed creation answer cannot attach to a replacement session", async () => {
    const harness = await renderUploadMilestoneModal({});
    const response = makeDeferredAnswer<Response>();
    const fetchMock = vi.mocked(fetch);
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((...args) => {
      return args[1]?.method === "POST"
        ? response.promise
        : originalFetch(...args);
    });
    createUploadMilestoneThroughForm(2);
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
  it("creates an occasion with the selected capture span and attaches its returned id", async () => {
    const harness = await renderUploadMilestoneModal({});
    createUploadMilestoneThroughForm(2);
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

  it("attachment retries never create a second milestone", async () => {
    const harness = await renderUploadMilestoneModal({});
    harness.api.createUploadEdit.mockRejectedValueOnce(
      new ApiRequestError({
        status: 503,
        code: "unavailable",
        message: "Try attachment again",
      }),
    );
    createUploadMilestoneThroughForm(2);
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
});
