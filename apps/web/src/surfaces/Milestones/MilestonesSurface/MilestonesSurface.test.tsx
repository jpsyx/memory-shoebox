import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  respondWith,
  renderAt,
  recordedRequests,
} from "@/testing/surfaceHarness";
import { createMeResponse } from "@/testing/createMeResponse";
import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtures";
const detail = makeMilestoneDetailFromOverrides({ itemCount: 0 });
const milestoneId = detail.milestone.milestoneId;
function _answers(overrides: Parameters<typeof respondWith>[0] = {}) {
  respondWith({
    "GET /api/milestones": {
      body: { milestones: [detail], nextCursor: null },
      status: 200,
    },
    [`GET /api/milestones/${milestoneId}`]: { body: detail, status: 200 },
    ...overrides,
  });
}
describe("occasion list and routed state", () => {
  it("shows per-viewer zero honestly and uses capability gates without creator lookup", async () => {
    const denied = { ...detail, canEdit: false, canDelete: false };
    _answers({
      "GET /api/milestones": {
        body: { milestones: [denied], nextCursor: null },
        status: 200,
      },
    });
    renderAt("/milestones");
    expect(await screen.findByText("Home")).toBeVisible();
    expect(screen.getByText("0 items")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Edit Home/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete Home/ })).toBeNull();
    expect(
      recordedRequests().some((line) => {
        return line.includes("/members");
      }),
    ).toBe(false);
  });
  it("viewer has read-only rows and no New", async () => {
    _answers({
      "GET /api/me": {
        body: createMeResponse({ role: "viewer" }),
        status: 200,
      },
      "GET /api/milestones": {
        body: {
          milestones: [{ ...detail, canEdit: false, canDelete: false }],
          nextCursor: null,
        },
        status: 200,
      },
    });
    renderAt("/milestones");
    await screen.findByText("Home");
    expect(screen.queryByRole("button", { name: "New milestone" })).toBeNull();
  });
  it("follows an empty cursor page and deduplicates IDs", async () => {
    _answers();
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/milestones") {
          return new Response(
            JSON.stringify({ milestones: [], nextCursor: "opaque+page" }),
          );
        }
        if (url === "/api/milestones?cursor=opaque%2Bpage") {
          return new Response(
            JSON.stringify({ milestones: [detail, detail], nextCursor: null }),
          );
        }
        return original(url, init);
      }),
    );
    renderAt("/milestones");
    await userEvent.click(
      await screen.findByRole("button", { name: "Load more milestones" }),
    );
    expect(await screen.findByText("Home")).toBeVisible();
    expect(screen.getAllByText("Home")).toHaveLength(1);
  });
  it("loads stored edit mode on refresh and uses Back for the list", async () => {
    _answers();
    const { router } = renderAt(
      `/milestones?milestone=${milestoneId}&mode=edit`,
    );
    expect(await screen.findByLabelText("What happened")).toHaveValue("Home");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      return expect(router.state.location.search).toEqual({});
    });
    router.history.back();
    expect(await screen.findByLabelText("What happened")).toHaveValue("Home");
  });
  it("saving an edit with mismatches addresses fix", async () => {
    _answers({
      [`PATCH /api/milestones/${milestoneId}`]: {
        body: { ...detail, mismatchCount: 2 },
        status: 200,
      },
    });
    const { router } = renderAt(
      `/milestones?milestone=${milestoneId}&mode=edit`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Save the changes" }),
    );
    await waitFor(() => {
      return expect(router.state.location.search).toEqual({
        milestone: milestoneId,
        mode: "fix",
      });
    });
  });
  it("Cancel from saved created mode returns to list without deletion", async () => {
    _answers();
    const { router } = renderAt(
      `/milestones?milestone=${milestoneId}&mode=created`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      return expect(router.state.location.search).toEqual({});
    });
    expect(
      recordedRequests().filter((line) => {
        return line.startsWith("DELETE");
      }),
    ).toHaveLength(0);
  });
  it("malformed addresses render a safe route error without mutation", async () => {
    _answers();
    renderAt("/milestones?milestone=bad%2Fid&mode=delete");
    expect(
      await screen.findByText("This occasion address is not valid."),
    ).toBeVisible();
    expect(
      recordedRequests().filter((line) => {
        return /^(POST|PATCH|DELETE)/.test(line);
      }),
    ).toHaveLength(0);
  });
});

describe("confirmed save navigation and operation ownership", () => {
  it("returns an edit without mismatches to the list", async () => {
    _answers({
      [`PATCH /api/milestones/${milestoneId}`]: { body: detail, status: 200 },
    });
    const { router } = renderAt(
      `/milestones?milestone=${milestoneId}&mode=edit`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Save the changes" }),
    );
    await waitFor(() => {
      return expect(router.state.location.search).toEqual({});
    });
  });
  it("always addresses a confirmed create as created, including returned mismatches", async () => {
    _answers({
      "POST /api/milestones": {
        body: { ...detail, mismatchCount: 2 },
        status: 201,
      },
    });
    const { router } = renderAt("/milestones?mode=create");
    await userEvent.type(await screen.findByLabelText("What happened"), "Home");
    await userEvent.click(
      screen.getByRole("button", { name: "When it happened" }),
    );
    const days = await screen.findAllByRole("button", { name: /\d+ \w+ 2026/ });
    await userEvent.click(days[15]!);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Create it and find its photographs",
      }),
    );
    await waitFor(() => {
      return expect(router.state.location.search).toEqual({
        milestone: milestoneId,
        mode: "created",
      });
    });
  });
  it("late edit cannot replace a new create form after address change", async () => {
    let finish: (() => void) | undefined;
    const reply = new Promise<void>((settle) => {
      finish = settle;
    });
    _answers({
      [`PATCH /api/milestones/${milestoneId}`]: {
        body: { ...detail, mismatchCount: 2 },
        status: 200,
        waitFor: reply,
      },
    });
    const { router } = renderAt(
      `/milestones?milestone=${milestoneId}&mode=edit`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Save the changes" }),
    );
    await router.navigate({ to: "/milestones", search: { mode: "create" } });
    const input = await screen.findByLabelText("What happened");
    await userEvent.type(input, "New words");
    finish?.();
    await waitFor(() => {
      return expect(
        recordedRequests().filter((line) => {
          return line === "GET /api/milestones";
        }),
      ).toHaveLength(2);
    });
    expect(router.state.location.search).toEqual({ mode: "create" });
    expect(input).toHaveValue("New words");
  });
});

describe("occasion empty preview", () => {
  it("uses the real inclusive span and zero visible count without a contact fixture", async () => {
    _answers();
    renderAt(`/milestones?milestone=${milestoneId}&mode=empty`);
    expect(
      await screen.findByText(
        "Nothing is attached for you to see yet. The occasion still stands in the timeline on its own dates.",
      ),
    ).toBeVisible();
    expect(screen.getByText("This day is day 1 of the 2.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Attach photographs" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Ask .* for hers/ }),
    ).toBeNull();
  });
});
