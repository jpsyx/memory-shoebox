import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import { makeDeferredAnswer } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadMilestoneDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createUploadMilestoneThroughForm,
  renderUploadMilestoneModal,
} from "./uploadMilestoneModalTestHelpers";

describe("inline upload milestones", () => {
  it.each([false, true])(
    "a delayed creation keeps submitted targets across selection change (surface unmounted: %s)",
    async (shouldUnmount) => {
      const harness = await renderUploadMilestoneModal({});
      const submitted = [...harness.controller.getSnapshot().selectedFileIds];
      const sessionId = harness.controller.getSnapshot().detail!.sessionId;
      const response = makeDeferredAnswer<Response>();
      const fetchMock = vi.mocked(fetch);
      const originalFetch = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((...args) => {
        return args[1]?.method === "POST"
          ? response.promise
          : originalFetch(...args);
      });
      createUploadMilestoneThroughForm(2);
      if (shouldUnmount) {
        harness.rendered.unmount();
      }
      harness.publishSnapshot({
        ...harness.controller.getSnapshot(),
        selectedFileIds: new Set([submitted[1]!]),
      });
      await act(async () => {
        response.answer(
          Response.json(makeUploadMilestoneDetail(), { status: 201 }),
        );
        await response.promise;
      });
      await waitFor(() => {
        return expect(harness.controller.applyEditAttempt).toHaveBeenCalled();
      });
      expect(
        harness.controller.applyEditAttempt,
      ).toHaveBeenCalledExactlyOnceWith({
        sessionId,
        targetFileIds: submitted,
        labels: [
          {
            kind: "milestone",
            milestoneId: makeUploadMilestoneDetail().milestone.milestoneId,
          },
        ],
      });
    },
  );
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
    const currentSnapshot = harness.controller.getSnapshot();
    harness.renderSnapshot({
      snapshot: {
        ...currentSnapshot,
        detail: {
          ...currentSnapshot.detail!,
          sessionId: "018f0000-0000-7000-8000-00000000c002",
        },
      },
    });
    await act(async () => {
      response.answer(
        Response.json(makeUploadMilestoneDetail(), { status: 201 }),
      );
      await response.promise;
    });
    expect(harness.controller.applyEditAttempt).not.toHaveBeenCalled();
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
    expect(harness.controller.applyEditAttempt).toHaveBeenLastCalledWith({
      sessionId: harness.controller.getSnapshot().detail!.sessionId,
      labels: [
        {
          kind: "milestone",
          milestoneId: makeUploadMilestoneDetail().milestone.milestoneId,
        },
      ],
      targetFileIds: harness.controller
        .getSnapshot()
        .detail!.files.map((file) => {
          return file.fileId;
        }),
    });
  });

  it("attachment retries never create a second milestone", async () => {
    const harness = await renderUploadMilestoneModal({});
    harness.controller.applyEditAttempt.mockRejectedValueOnce(
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
    expect(harness.controller.applyEditAttempt).toHaveBeenCalledTimes(2);
    expect(harness.controller.applyEditAttempt.mock.calls[1]![0]).toBe(
      harness.controller.applyEditAttempt.mock.calls[0]![0],
    );
    expect(
      harness.controller.applyEditAttempt.mock.calls.map(([options]) => {
        return options.labels[0]!.milestoneId;
      }),
    ).toEqual([
      makeUploadMilestoneDetail().milestone.milestoneId,
      makeUploadMilestoneDetail().milestone.milestoneId,
    ]);
  });
});
