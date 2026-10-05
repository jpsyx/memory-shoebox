import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import {
  recordedRequests,
  renderAt,
  respondWith,
} from "@/testing/surfaceHarness";
import type { ItemSummary, MilestoneDetail } from "@memory-shoebox/shared";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
function _installKeepsChosenPrintsThroughAFailedBackgroundAnswers0(): void {
  respondWith({
    "GET /api/milestones": {
      status: 200,
      body: { milestones: [detail], nextCursor: null },
    },
    [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
      status: 200,
      body: detail,
    },
    [`GET /api/milestones/${detail.milestone.milestoneId}/candidates`]: {
      status: 200,
      body: {
        candidates: [{ item, isAttached: false, isOutsideSpan: false }],
        nextCursor: null,
      },
    },
  });
}

function _installKeepsChosenPrintsThroughAFailedBackgroundFetch1(): {
  hasFailure: boolean;
} {
  const responseState: { hasFailure: boolean } = { hasFailure: true };

  const original = fetch;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      return url === `/api/milestones/${detail.milestone.milestoneId}` &&
        responseState.hasFailure
        ? new Response(
            JSON.stringify({ error: "not_found", message: "No occasion" }),
            { status: 404 },
          )
        : original(url, init);
    }),
  );
  return responseState;
}

function _installKeepsExplicitIntentWithoutABrokenImageAnswers2(): void {
  respondWith({
    "GET /api/milestones": {
      status: 200,
      body: { milestones: [detail], nextCursor: null },
    },
    [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
      status: 200,
      body: detail,
    },
    [`GET /api/milestones/${detail.milestone.milestoneId}/candidates`]: {
      status: 200,
      body: {
        candidates: [{ item, isAttached: false, isOutsideSpan: false }],
        nextCursor: null,
      },
    },
  });
}

const detail = makeMilestoneDetailFromOverrides() satisfies MilestoneDetail;
const item = makeItemSummaryFromOverrides() satisfies ItemSummary;
describe("saved span suggestions", () => {
  it("leaves a saved occasion intact when cancelled and empty save never deletes", async () => {
    respondWith({
      "GET /api/milestones": {
        status: 200,
        body: { milestones: [detail], nextCursor: null },
      },
      [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
        status: 200,
        body: detail,
      },
      [`GET /api/milestones/${detail.milestone.milestoneId}/candidates`]: {
        status: 200,
        body: {
          candidates: [{ item, isAttached: false, isOutsideSpan: false }],
          nextCursor: null,
        },
      },
    });
    const { router } = renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=created`,
    );
    await screen.findByRole("button", { name: "Family at home" });
    await userEvent.click(
      screen.getByRole("button", { name: "Save photographs" }),
    );
    await waitFor(() => {
      return expect(router.state.location.search).toEqual({});
    });
    expect(
      recordedRequests().some((line) => {
        return /PATCH|DELETE|\/seen|\/items\//.test(line);
      }),
    ).toBe(false);
  });
});
describe("retained routed picker authority", () => {
  it("keeps chosen prints through a failed background detail read and disables writes", async () => {
    _installKeepsChosenPrintsThroughAFailedBackgroundAnswers0();
    const { router } = renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=created`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Family at home" }),
    );
    const responses1 =
      _installKeepsChosenPrintsThroughAFailedBackgroundFetch1();
    await act(async () => {
      await router.options.context.queryClient.invalidateQueries({
        queryKey: ["milestones", "detail"],
      });
    });
    expect(
      screen.getByRole("button", { name: "Family at home" }),
    ).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save photographs" }),
      ).toBeDisabled();
    });
    responses1.hasFailure = false;
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh the occasion" }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save photographs" }),
      ).toBeEnabled();
    });
    expect(
      screen.getByRole("button", { name: "Family at home" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
describe("confirmed delta presentation", () => {
  it("announces actual returned counts and offers date fixing after a successful delta", async () => {
    const saved = {
      ...detail,
      mismatchCount: 2,
      attachedCount: 0,
      detachedCount: 0,
    };
    respondWith({
      "GET /api/milestones": {
        status: 200,
        body: { milestones: [detail], nextCursor: null },
      },
      [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
        status: 200,
        body: detail,
      },
      [`GET /api/milestones/${detail.milestone.milestoneId}/candidates`]: {
        status: 200,
        body: {
          candidates: [{ item, isAttached: false, isOutsideSpan: false }],
          nextCursor: null,
        },
      },
      [`PATCH /api/milestones/${detail.milestone.milestoneId}/items`]: {
        status: 200,
        body: saved,
      },
    });
    const { router } = renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=created`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Family at home" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save photographs" }),
    );
    expect(await screen.findByText("0 attached; 0 detached.")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Fix photograph dates" }),
    );
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ mode: "fix" });
    });
  });
});
describe("picker read announcements", () => {
  it("announces a pending candidate read before showing an empty result", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((settle) => {
      release = settle;
    });
    respondWith({
      "GET /api/milestones": {
        status: 200,
        body: { milestones: [detail], nextCursor: null },
      },
      [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
        status: 200,
        body: detail,
      },
      [`GET /api/milestones/${detail.milestone.milestoneId}/candidates`]: {
        status: 200,
        body: { candidates: [], nextCursor: null },
        waitFor: held,
      },
    });
    renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=created`,
    );
    try {
      expect(await screen.findByText("Reading photographs.")).toBeVisible();
      expect(
        screen.queryByText("No photographs are shown for these choices."),
      ).toBeNull();
    } finally {
      release?.();
    }
    expect(
      await screen.findByText("No photographs are shown for these choices."),
    ).toBeVisible();
  });
});
function _installFailedCandidateReads(): void {
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      return url.includes("/candidates")
        ? new Response(
            JSON.stringify({
              error: "forbidden",
              message: "Photograph unavailable",
            }),
            { status: 403 },
          )
        : original(url, init);
    }),
  );
}
describe("picker-owned unavailable thumbnails", () => {
  it.each([false, true] as const)(
    "keeps explicit intent without a broken image after thumbnail error (failed read: %s)",
    async (hasFailedRead) => {
      _installKeepsExplicitIntentWithoutABrokenImageAnswers2();
      const { router } = renderAt(
        `/milestones?milestone=${detail.milestone.milestoneId}&mode=created`,
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Family at home" }),
      );
      if (hasFailedRead) {
        _installFailedCandidateReads();
        await act(async () => {
          await router.options.context.queryClient.invalidateQueries({
            queryKey: ["milestones", "candidates"],
          });
        });
        await screen.findByText(/Photographs could not be read/);
      }
      fireEvent.error(screen.getByRole("img", { name: "Family at home" }));
      expect(await screen.findByText("Photograph unavailable.")).toBeVisible();
      expect(screen.queryByRole("img", { name: "Family at home" })).toBeNull();
      expect(
        screen.getByRole("button", {
          name: "Unavailable photograph: Family at home",
        }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByText("1 chosen; 1 to attach, 0 to detach."),
      ).toBeVisible();
      expect(
        recordedRequests().some((line) => {
          return /PATCH|DELETE|\/seen|\/items\//.test(line);
        }),
      ).toBe(false);
    },
  );
});

describe("occasion-first attachment hierarchy", () => {
  it("identifies the selected occasion before its full archive filter grammar", async () => {
    respondWith({
      "GET /api/milestones": {
        status: 200,
        body: { milestones: [detail], nextCursor: null },
      },
      [`GET /api/milestones/${detail.milestone.milestoneId}`]: {
        status: 200,
        body: detail,
      },
      "GET /api/timeline": {
        status: 200,
        body: { days: [], nextCursor: null, resultCount: null },
      },
      "GET /api/filters/facets": {
        status: 200,
        body: { tags: [], people: [] },
      },
    });
    renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=attach`,
    );
    const occasion = await screen.findByRole("heading", {
      name: detail.milestone.name,
    });
    const filter = screen.getByRole("heading", { name: "Find something" });
    expect(
      occasion.compareDocumentPosition(filter) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.getByLabelText("Words in a tag or a name")).toBeVisible();
    expect(screen.getByLabelText("From")).toBeVisible();
    expect(screen.getByLabelText("Until")).toBeVisible();
  });
});
