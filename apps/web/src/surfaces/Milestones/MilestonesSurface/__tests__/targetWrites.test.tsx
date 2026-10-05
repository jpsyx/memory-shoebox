import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import {
  makeMilestoneDetailFromOverrides,
  makeItemSummaryFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import {
  renderAt,
  respondWith,
  recordedRequests,
} from "@/testing/surfaceHarness";
const first = makeMilestoneDetailFromOverrides({ mismatchCount: 1 });
const item = makeItemSummaryFromOverrides();
const second = makeMilestoneDetailFromOverrides({
  milestone: {
    ...first.milestone,
    milestoneId: "018f0000-0000-7000-8000-000000008002",
    name: "Independent",
  },
});

it.each(["edit", "delete", "created", "fix"] as const)(
  "refuses remounted %s while a held same-occasion edit survives navigation, leaving another occasion independent",
  async (mode) => {
    const held = makeHold();
    const firstPath = `/api/milestones/${first.milestone.milestoneId}`;
    const secondPath = `/api/milestones/${second.milestone.milestoneId}`;
    respondWith({
      "GET /api/milestones": {
        status: 200,
        body: { milestones: [first, second], nextCursor: null },
      },
      [`GET ${firstPath}`]: { status: 200, body: first },
      [`GET ${secondPath}`]: { status: 200, body: second },
      [`PATCH ${firstPath}`]: { status: 200, body: first, waitFor: held.hold },
      [`GET ${firstPath}/candidates`]: {
        status: 200,
        body: {
          candidates: [{ item, isAttached: false, isOutsideSpan: false }],
          nextCursor: null,
        },
      },
      [`GET ${firstPath}/mismatches`]: {
        status: 200,
        body: {
          milestone: first.milestone,
          mismatches: [{ item, attachedAt: "2026-10-04T12:00:00.000Z" }],
          wideningSpan: first.milestone,
          nextCursor: null,
        },
      },
      [`PATCH ${secondPath}`]: { status: 200, body: second },
    });
    const { router } = renderAt(
      `/milestones?milestone=${first.milestone.milestoneId}&mode=edit`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Save the changes" }),
    );
    await waitFor(() => {
      expect(recordedRequests()).toContain(`PATCH ${firstPath}`);
    });
    await act(async () => {
      await router.navigate({ to: "/milestones", search: {} });
    });
    await act(async () => {
      await router.navigate({
        to: "/milestones",
        search: { milestone: first.milestone.milestoneId, mode },
      });
    });
    if (mode === "created") {
      await userEvent.click(
        await screen.findByRole("button", { name: "Family at home" }),
      );
    }
    const secondAction = await screen.findByRole("button", {
      name:
        mode === "edit"
          ? "Save the changes"
          : mode === "delete"
            ? "Delete the milestone"
            : mode === "created"
              ? "Save photographs"
              : "Leave these 1 as they are",
    });
    await waitFor(() => {
      expect(secondAction).toBeEnabled();
    });
    await userEvent.click(secondAction);
    await waitFor(() => {
      expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
        /already being changed/,
      );
    });
    expect(
      recordedRequests().filter((line) => {
        return line === `PATCH ${firstPath}`;
      }),
    ).toHaveLength(1);
    await act(async () => {
      await router.navigate({
        to: "/milestones",
        search: { milestone: second.milestone.milestoneId, mode: "edit" },
      });
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Save the changes" }),
    );
    await waitFor(() => {
      expect(recordedRequests()).toContain(`PATCH ${secondPath}`);
    });
    held.letGo();
    await waitFor(() => {
      expect(router.options.context!.queryClient.isMutating()).toBe(0);
    });
    expect(router.state.location.search).toEqual({});
  },
);
