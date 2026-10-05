import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  renderAt,
  respondWith,
  recordedRequests,
} from "@/testing/surfaceHarness";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
const detail = makeMilestoneDetailFromOverrides({ mismatchCount: 1 });
const item = makeItemSummaryFromOverrides({ capturedOn: "2026-08-31" });
const path = `/api/milestones/${detail.milestone.milestoneId}`;
function _answers() {
  const detailAnswer = { body: detail, status: 200 };
  const page = {
    body: {
      milestone: detail.milestone,
      mismatches: [{ item, attachedAt: "2026-10-04T12:00:00.000Z" }],
      wideningSpan: { startsOn: "2026-08-31", endsOn: "2026-10-02" },
      nextCursor: null,
    },
    status: 200,
  };
  const post = {
    body: {
      ...detail,
      mismatchCount: 0,
      movedCount: 0,
      acknowledgedCount: 1,
      raisedElsewhere: [
        {
          milestone: {
            ...detail.milestone,
            milestoneId: "018f0000-0000-7000-8000-000000008002",
            name: "First week",
          },
          mismatchCount: 7,
        },
      ],
    },
    status: 200,
  };
  respondWith({
    "GET /api/milestones": {
      body: { milestones: [detail], nextCursor: null },
      status: 200,
    },
    [`GET ${path}`]: detailAnswer,
    [`GET ${path}/mismatches`]: page,
    [`POST ${path}/reconcile`]: post,
  });
  return { detailAnswer, page, post };
}
describe("routed saved occasion fix", () => {
  it("keeps the new route free of old confirmation and onward navigation after a started write", async () => {
    const { post } = _answers();
    let finish: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      finish = settle;
    });
    Object.assign(post, { waitFor: held });
    const { router } = renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=fix`,
    );
    const leave = await screen.findByRole("button", {
      name: "Leave these 1 as they are",
    });
    await waitFor(() => {
      return expect(leave).toBeEnabled();
    });
    await userEvent.click(leave);
    await waitFor(() => {
      return expect(recordedRequests()).toContain(`POST ${path}/reconcile`);
    });
    await act(async () => {
      await router.navigate({ to: "/milestones", search: {} });
    });
    expect(router.state.location.search).toEqual({});
    finish?.();
    await waitFor(() => {
      return expect(router.options.context!.queryClient.isMutating()).toBe(0);
    });
    expect(router.state.location.search).toEqual({});
    expect(screen.queryByText("0 moved; 1 left as they are.")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Fix dates for First week" }),
    ).toBeNull();
  });
  it("persists acknowledgement, refetches remaining rows and names onward occasions", async () => {
    const { page, detailAnswer } = _answers();
    const { router } = renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=fix`,
    );
    const leave = await screen.findByRole("button", {
      name: "Leave these 1 as they are",
    });
    await waitFor(() => {
      return expect(leave).toBeEnabled();
    });
    await userEvent.click(leave);
    await screen.findByText("0 moved; 1 left as they are.");
    page.body.mismatches = [];
    detailAnswer.body = { ...detail, mismatchCount: 0 };
    await waitFor(() => {
      return expect(
        screen.getByRole("button", { name: "Fix dates for First week" }),
      ).toBeEnabled();
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Fix dates for First week" }),
    );
    await waitFor(() => {
      return expect(router.state.location.search).toEqual({
        milestone: "018f0000-0000-7000-8000-000000008002",
        mode: "fix",
      });
    });
    expect(
      recordedRequests().some((line) => {
        return /\/items\/|\/seen/.test(line);
      }),
    ).toBe(false);
  });
});

describe("fix read-state retention and completion", () => {
  it("withholds write controls when refreshed capability denies editing", async () => {
    const { detailAnswer } = _answers();
    detailAnswer.body = { ...detail, canEdit: false };
    renderAt(`/milestones?milestone=${detail.milestone.milestoneId}&mode=fix`);
    expect(
      await screen.findByText("This occasion is read-only."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Leave these/ })).toBeNull();
  });
  it("keeps dates through a failed background detail read without claiming it is still reading", async () => {
    const { detailAnswer } = _answers();
    const { router } = renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=fix`,
    );
    const select = await screen.findByRole("combobox");
    await waitFor(() => {
      return expect(select).toBeEnabled();
    });
    await userEvent.selectOptions(select, "2026-09-14");
    detailAnswer.status = 503;
    await act(async () => {
      await router.options.context!.queryClient.refetchQueries({
        queryKey: ["milestones", "detail"],
      });
    });
    await screen.findByText(
      "This occasion could not be read. Refresh it or return to the list.",
    );
    expect(screen.getByRole("combobox")).toBe(select);
    expect(select).toHaveValue("2026-09-14");
    expect(screen.getByRole("button", { name: "Move the 1" })).toBeDisabled();
    expect(
      screen.queryByText(
        "Reading or saving the occasion. Your choices are kept.",
      ),
    ).toBeNull();
    detailAnswer.status = 200;
    await userEvent.click(
      screen.getByRole("button", {
        name: "Refresh the occasion and photographs",
      }),
    );
    await waitFor(() => {
      return expect(
        screen.getByRole("button", { name: "Move the 1" }),
      ).toBeEnabled();
    });
    expect(select).toHaveValue("2026-09-14");
  });
  it("shows authoritative zero completion and an enabled return", async () => {
    const { detailAnswer, page } = _answers();
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          detailAnswer.body = { ...detail, mismatchCount: 0 };
          page.body.mismatches = [];
        }
        return original(url, init);
      }),
    );
    renderAt(`/milestones?milestone=${detail.milestone.milestoneId}&mode=fix`);
    const leave = await screen.findByRole("button", {
      name: "Leave these 1 as they are",
    });
    await waitFor(() => {
      return expect(leave).toBeEnabled();
    });
    await userEvent.click(leave);
    expect(
      await screen.findByText("No photographs need a date decision for Home."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Back to the list" }),
    ).toBeEnabled();
  });
});
