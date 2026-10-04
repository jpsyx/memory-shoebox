import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  respondWith,
  renderAt,
  recordedRequests,
} from "@/testing/surfaceHarness";
import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtures";
const detail = makeMilestoneDetailFromOverrides();
const milestoneId = detail.milestone.milestoneId;
describe("label-only deletion", () => {
  it("uses only milestone DELETE and announces returned name/count", async () => {
    respondWith({
      "GET /api/milestones": {
        body: { milestones: [detail], nextCursor: null },
        status: 200,
      },
      [`GET /api/milestones/${milestoneId}`]: { body: detail, status: 200 },
      [`DELETE /api/milestones/${milestoneId}`]: {
        body: { milestoneId, name: "Returned name", detachedItemCount: 3 },
        status: 200,
      },
    });
    renderAt(`/milestones?milestone=${milestoneId}&mode=delete`);
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      /photographs stay/i,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete the milestone" }),
    );
    await waitFor(() => {
      return expect(screen.getByRole("status")).toHaveTextContent(
        "Returned name",
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent("3");
    expect(
      recordedRequests().filter((line) => {
        return line.startsWith("DELETE");
      }),
    ).toEqual([`DELETE /api/milestones/${milestoneId}`]);
    expect(
      recordedRequests().filter((line) => {
        return line.includes("/api/items/");
      }),
    ).toHaveLength(0);
  });
});

describe("delete failure and uncertainty", () => {
  it("retains confirmation after refusal", async () => {
    respondWith({
      "GET /api/milestones": {
        body: { milestones: [detail], nextCursor: null },
        status: 200,
      },
      [`GET /api/milestones/${milestoneId}`]: { body: detail, status: 200 },
      [`DELETE /api/milestones/${milestoneId}`]: {
        body: { error: "milestone_forbidden", message: "No" },
        status: 403,
      },
    });
    renderAt(`/milestones?milestone=${milestoneId}&mode=delete`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete the milestone" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/not deleted/i);
    expect(screen.getByRole("dialog")).toHaveTextContent("Home");
  });
  it("blocks another delete after schema uncertainty until authoritative refresh", async () => {
    respondWith({
      "GET /api/milestones": {
        body: { milestones: [detail], nextCursor: null },
        status: 200,
      },
      [`GET /api/milestones/${milestoneId}`]: { body: detail, status: 200 },
      [`DELETE /api/milestones/${milestoneId}`]: {
        body: { invalid: true },
        status: 200,
      },
    });
    renderAt(`/milestones?milestone=${milestoneId}&mode=delete`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete the milestone" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Delete the milestone" }),
    ).toBeDisabled();
    expect(
      recordedRequests().filter((line) => {
        return line.startsWith("DELETE");
      }),
    ).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh the occasion" }),
    );
    await waitFor(() => {
      return expect(
        screen.getByRole("button", { name: "Delete the milestone" }),
      ).toBeEnabled();
    });
    expect(
      recordedRequests().filter((line) => {
        return line.startsWith("DELETE");
      }),
    ).toHaveLength(1);
  });
});

describe("confirmed deletion navigation", () => {
  it("announces success when selected detail 404s before a slow list refresh", async () => {
    respondWith({
      "GET /api/milestones": {
        body: { milestones: [detail], nextCursor: null },
        status: 200,
      },
      [`GET /api/milestones/${milestoneId}`]: { body: detail, status: 200 },
      [`DELETE /api/milestones/${milestoneId}`]: {
        body: { milestoneId, name: "Deleted Home", detachedItemCount: 1 },
        status: 200,
      },
    });
    const original = fetch;
    let hasDeleted = false;
    let finishList: (() => void) | undefined;
    const listRefresh = new Promise<void>((finish) => {
      finishList = finish;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          hasDeleted = true;
        }
        if (
          hasDeleted &&
          url === `/api/milestones/${milestoneId}` &&
          init?.method !== "DELETE"
        ) {
          return new Response(
            JSON.stringify({ error: "milestone_not_found", message: "Gone" }),
            { status: 404 },
          );
        }
        if (hasDeleted && url === "/api/milestones") {
          await listRefresh;
        }
        return original(url, init);
      }),
    );
    const { router } = renderAt(
      `/milestones?milestone=${milestoneId}&mode=delete`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete the milestone" }),
    );
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).toBeNull();
    });
    finishList?.();
    await waitFor(() => {
      return expect(router.state.location.search).toEqual({});
    });
    expect(screen.getByRole("status")).toHaveTextContent("Deleted Home");
  });
});

describe("deletion operation ownership", () => {
  it("late deletion cannot navigate a different occasion's edit form", async () => {
    const otherId = "018f0000-0000-7000-8000-000000008002";
    const otherDetail = {
      ...detail,
      milestone: {
        ...detail.milestone,
        milestoneId: otherId,
        name: "Other occasion",
      },
    };
    let finish: (() => void) | undefined;
    const reply = new Promise<void>((settle) => {
      finish = settle;
    });
    respondWith({
      "GET /api/milestones": {
        body: { milestones: [detail, otherDetail], nextCursor: null },
        status: 200,
      },
      [`GET /api/milestones/${milestoneId}`]: { body: detail, status: 200 },
      [`GET /api/milestones/${otherId}`]: { body: otherDetail, status: 200 },
      [`DELETE /api/milestones/${milestoneId}`]: {
        body: { milestoneId, name: "Deleted Home", detachedItemCount: 1 },
        status: 200,
        waitFor: reply,
      },
    });
    const { router } = renderAt(
      `/milestones?milestone=${milestoneId}&mode=delete`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete the milestone" }),
    );
    await router.navigate({
      to: "/milestones",
      search: { milestone: otherId, mode: "edit" },
    });
    const input = await screen.findByLabelText("What happened");
    await userEvent.clear(input);
    await userEvent.type(input, "New words");
    finish?.();
    await waitFor(() => {
      expect(
        recordedRequests().filter((line) => {
          return line === "GET /api/milestones";
        }),
      ).toHaveLength(2);
    });
    expect(router.state.location.search).toEqual({
      milestone: otherId,
      mode: "edit",
    });
    expect(input).toHaveValue("New words");
    expect(screen.queryByText(/Deleted Deleted Home/)).toBeNull();
  });
});
