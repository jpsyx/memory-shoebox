import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  recordedRequests,
} from "@/testing/surfaceHarnessHelpers";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderTimeline } from "./timelineSurfaceTestHelpers";
import {
  answerBulkTimeline,
  BULK_ITEM_IDS,
  tickBothTimelinePhotos,
} from "./timelineBulkTestHelpers";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function _openMilestones(
  hasMilestones = false,
): Promise<ReturnType<typeof renderTimeline>> {
  const detail = makeMilestoneDetailFromOverrides();
  answerBulkTimeline({
    "GET /api/milestones": {
      body: { milestones: hasMilestones ? [detail] : [], nextCursor: null },
      status: 200,
    },
    "POST /api/milestones": { body: detail, status: 201 },
    [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
      body: detail,
      status: 200,
    },
    [`GET /api/milestones/${detail.milestone.milestoneId}/candidates`]: {
      body: { candidates: [], nextCursor: null },
      status: 200,
    },
  });
  const rendered = renderTimeline();
  await tickBothTimelinePhotos();
  await userEvent.click(
    screen.getByRole("button", { name: "Put under a milestone" }),
  );
  await waitFor(() => {
    expect(screen.queryByText("Loading milestones…")).not.toBeInTheDocument();
  });
  return rendered;
}

it.each([false, true])(
  "carries selected photos into creation, with an existing directory: %s",
  async (hasMilestones) => {
    const { router } = await _openMilestones(hasMilestones);
    const dialog = within(screen.getByRole("dialog"));
    if (!hasMilestones) {
      expect(
        dialog.queryByRole("button", { name: "Attach 2" }),
      ).not.toBeInTheDocument();
    }
    await userEvent.click(
      dialog.getByRole("button", { name: "Create a new milestone" }),
    );
    expect(
      await screen.findByText(/2 selected photos and videos will be included/),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/milestones");
    expect(router.state.location.search).toEqual({ mode: "create" });
    expect(recordedRequests()).not.toContain("POST /api/milestones");
    await userEvent.type(screen.getByLabelText("What happened"), "Our weekend");
    await userEvent.click(
      screen.getByRole("button", { name: "Create and attach 2" }),
    );
    await waitFor(() => {
      expect(getRecordedBodyFromRequest("POST /api/milestones")).toEqual({
        name: "Our weekend",
        blurb: null,
        startsOn: "2026-09-27",
        endsOn: "2026-09-27",
        itemIds: BULK_ITEM_IDS,
      });
    });
    expect(recordedRequests()).not.toContain("POST /api/items/bulk-edit");
    expect(
      recordedRequests().some((request) => {
        return request.startsWith("GET /api/items/");
      }),
    ).toBe(false);
  },
);

it("cancels creation without writing and clears the carried selection for ordinary creation", async () => {
  const { router } = await _openMilestones();
  await userEvent.click(
    screen.getByRole("button", { name: "Create a new milestone" }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(recordedRequests()).not.toContain("POST /api/milestones");
  await router.navigate({ to: "/milestones", search: { mode: "create" } });
  expect(
    await screen.findByRole("button", {
      name: "Create it and find its photographs",
    }),
  ).toBeVisible();
  expect(
    screen.queryByText(/selected photos and videos will be included/),
  ).not.toBeInTheDocument();
});

it("does not carry another member's selection into creation", async () => {
  const { router } = await _openMilestones();
  await router.navigate({
    to: "/milestones",
    search: { mode: "create" },
    state: {
      milestoneCreation: {
        memberId: "018f0000-0000-7000-8000-00000000ffff",
        selection: [{ itemId: BULK_ITEM_IDS[0], capturedOn: "2026-09-27" }],
      },
    },
  });
  await userEvent.type(
    await screen.findByLabelText("What happened"),
    "My milestone",
  );
  expect(
    screen.queryByText(/selected photos and videos will be included/),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "When it happened" }),
  );
  await userEvent.click(
    (await screen.findAllByRole("button", { name: /\d+ \w+ 2026/ }))[15]!,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Create it and find its photographs" }),
  );
  await waitFor(() => {
    expect(getRecordedBodyFromRequest("POST /api/milestones")).toMatchObject({
      name: "My milestone",
    });
  });
  expect(getRecordedBodyFromRequest("POST /api/milestones")).not.toHaveProperty(
    "itemIds",
  );
});
