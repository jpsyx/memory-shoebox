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

describe("I1: edit ownership during failed detail refresh", () => {
  it("retains edited words and uncertainty when PATCH and its detail refresh are uncertain", async () => {
    _answers({
      [`PATCH /api/milestones/${milestoneId}`]: {
        body: { invalid: true },
        status: 200,
      },
    });
    const original = fetch;
    let hasSubmitted = false;
    let hasRecovered = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          hasSubmitted = true;
        }
        if (
          hasSubmitted &&
          !hasRecovered &&
          url === `/api/milestones/${milestoneId}` &&
          init?.method !== "PATCH"
        ) {
          return new Response(
            JSON.stringify({
              error: "service_unavailable",
              message: "Offline",
            }),
            { status: 503 },
          );
        }
        return original(url, init);
      }),
    );
    renderAt(`/milestones?milestone=${milestoneId}&mode=edit`);
    const name = await screen.findByLabelText("What happened");
    await userEvent.clear(name);
    await userEvent.type(name, "Edited words stay");
    const blurb = screen.getByLabelText("A line about it");
    await userEvent.type(blurb, "More retained words");
    await userEvent.click(
      screen.getByRole("button", { name: "Save the changes" }),
    );
    await screen.findByText(
      "This occasion could not be read. Refresh it or return to the list.",
    );
    expect(screen.getByLabelText("What happened")).toBe(name);
    expect(name).toHaveValue("Edited words stay");
    expect(blurb).toHaveValue("More retained words");
    expect(screen.getByText(/The occasion may have been saved/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save the changes" }),
    ).toBeDisabled();
    expect(
      recordedRequests().filter((request) => {
        return request.startsWith("PATCH ");
      }),
    ).toHaveLength(1);
    hasRecovered = true;
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh the occasion" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByText(
          "This occasion could not be read. Refresh it or return to the list.",
        ),
      ).toBeNull();
    });
    expect(name).toHaveValue("Edited words stay");
    expect(
      screen.getByRole("button", { name: "Save the changes" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Return to the list and review" }),
    ).toBeEnabled();
  });
  it.each([0, 2])(
    "honors confirmed PATCH with %i mismatches before failed detail/held list refresh",
    async (mismatchCount) => {
      let finishList: (() => void) | undefined;
      const listRefresh = new Promise<void>((finish) => {
        finishList = finish;
      });
      _answers({
        [`PATCH /api/milestones/${milestoneId}`]: {
          body: { ...detail, mismatchCount },
          status: 200,
        },
      });
      const original = fetch;
      let hasSubmitted = false;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (init?.method === "PATCH") {
            hasSubmitted = true;
          }
          if (
            hasSubmitted &&
            url === `/api/milestones/${milestoneId}` &&
            init?.method !== "PATCH"
          ) {
            return new Response(
              JSON.stringify({ error: "milestone_not_found", message: "Gone" }),
              { status: 404 },
            );
          }
          if (hasSubmitted && url === "/api/milestones") {
            await listRefresh;
          }
          return original(url, init);
        }),
      );
      const { router } = renderAt(
        `/milestones?milestone=${milestoneId}&mode=edit`,
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Save the changes" }),
      );
      try {
        await waitFor(() => {
          expect(screen.queryByLabelText("What happened")).toBeNull();
        });
        expect(router.state.location.search).toEqual(
          mismatchCount === 0 ? {} : { milestone: milestoneId, mode: "fix" },
        );
      } finally {
        finishList?.();
      }
    },
  );
});

describe("I1: create is independent of directory refresh failure", () => {
  it("retains create words and uncertainty when the directory refresh also fails", async () => {
    _answers({
      "POST /api/milestones": { body: { invalid: true }, status: 201 },
    });
    const original = fetch;
    let hasSubmitted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          hasSubmitted = true;
        }
        if (
          hasSubmitted &&
          url === "/api/milestones" &&
          init?.method !== "POST"
        ) {
          return new Response(
            JSON.stringify({
              error: "service_unavailable",
              message: "Offline",
            }),
            { status: 503 },
          );
        }
        return original(url, init);
      }),
    );
    renderAt("/milestones?mode=create");
    const name = await screen.findByLabelText("What happened");
    await userEvent.type(name, "New retained words");
    await userEvent.type(
      screen.getByLabelText("A line about it"),
      "Retained create blurb",
    );
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
    await screen.findByText(
      "Milestones could not be refreshed. Refresh the list before starting another change.",
    );
    expect(screen.getByLabelText("What happened")).toBe(name);
    expect(name).toHaveValue("New retained words");
    expect(screen.getByLabelText("A line about it")).toHaveValue(
      "Retained create blurb",
    );
    expect(screen.getByText(/The occasion may have been saved/)).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Create it and find its photographs",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Return to the list and review" }),
    ).toBeEnabled();
  });
});
