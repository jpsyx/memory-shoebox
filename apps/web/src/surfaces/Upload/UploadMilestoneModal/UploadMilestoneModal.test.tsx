import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  closeUploadMilestoneModal,
  createUploadMilestoneThroughForm,
  makeUploadFocusOwner,
  renderUploadMilestoneModal,
} from "../../../testing/uploadMilestoneModalTestHelpers";
import { UploadMilestoneModal } from "./UploadMilestoneModal";

describe("inline upload milestones", () => {
  it.each(["lost", "deliberate", "detached"] as const)(
    "restores lost or detached focus and preserves deliberate focus after %s exit at its owning Upload modal exit",
    async (focusDisposition) => {
      const owner = makeUploadFocusOwner();
      const harness = await renderUploadMilestoneModal({
        days: ["2026-09-17"],
      });
      harness.controller.clearSelection();
      closeUploadMilestoneModal(harness);
      if (focusDisposition === "deliberate") {
        owner.querySelector("button")!.focus();
      } else if (focusDisposition === "detached") {
        owner.remove();
      }
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      await waitFor(() => {
        if (focusDisposition === "lost") {
          expect(owner.querySelector("h1")).toHaveFocus();
        } else if (focusDisposition === "deliberate") {
          expect(owner.querySelector("button")).toHaveFocus();
        } else {
          expect(document.body).toHaveFocus();
        }
      });
      owner.remove();
    },
  );
  it("prefills a fresh selection when a previously closed modal opens", async () => {
    const harness = await renderUploadMilestoneModal({ days: ["2026-09-17"] });
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
    createUploadMilestoneThroughForm(1);
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalled();
    });
    expect(
      getRecordedRequests().find((request) => {
        return request.method === "POST";
      })?.body,
    ).toMatchObject({ startsOn: "2026-09-15", endsOn: "2026-09-15" });
  });

  it("selected date prefill excludes an unticked outlier", async () => {
    const harness = await renderUploadMilestoneModal({
      days: ["1990-01-01", "2026-09-15", "2026-09-17"],
    });
    closeUploadMilestoneModal(harness);
    harness.controller.toggleFile(harness.serverDetail.files[0]!.fileId);
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
    createUploadMilestoneThroughForm(2);
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalledOnce();
    });
    expect(
      getRecordedRequests().find((request) => {
        return request.method === "POST";
      })?.body,
    ).toMatchObject({ startsOn: "2026-09-15", endsOn: "2026-09-17" });
  });
  it("collapses one day to equal endpoints", async () => {
    const harness = await renderUploadMilestoneModal({ days: ["2026-09-17"] });
    createUploadMilestoneThroughForm(1);
    await waitFor(() => {
      return expect(harness.onClose).toHaveBeenCalled();
    });
    expect(
      getRecordedRequests().find((request) => {
        return request.method === "POST";
      })?.body,
    ).toMatchObject({ startsOn: "2026-09-17", endsOn: "2026-09-17" });
  });

  it("lost creation answers require a reload and explicit review before another create", async () => {
    const harness = await renderUploadMilestoneModal({});
    const fetchMock = vi.mocked(fetch);
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (...args) => {
      if (args[1]?.method === "POST") {
        throw new TypeError("Network lost");
      }
      return originalFetch(...args);
    });
    createUploadMilestoneThroughForm(2);
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
    await renderUploadMilestoneModal({ days: ["2026-09-17"], listStatus: 404 });
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
