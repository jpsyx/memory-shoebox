import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { createMeResponse } from "@/testing/createMeResponse";
import { recordedUrls, renderAt, respondWith } from "@/testing/surfaceHarness";
import type {
  ListRemovalRequestsResponse,
  RemovalRequestDto,
} from "@memory-shoebox/shared";
import { REMOVAL_REQUEST_STATES } from "@memory-shoebox/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
function _installRefreshesAllRequestsForADeletedItemFetch0(): void {
  const responses0 = _installRefreshesAllRequestsForADeletedItemAnswers0();
  const originalFetch = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        responses0.hasDeleted = true;
        return new Response(null, { status: 204 });
      }
      if (!url.includes("/api/removal-requests")) {
        return originalFetch(url, init);
      }
      const isSettled =
        new URL(url, "http://localhost").searchParams.get("state") ===
        "settled";
      const removalRequests = responses0.hasDeleted
        ? isSettled
          ? [REQUEST, responses0.secondRequest].map((request) => {
              return {
                ...request,
                state: "deleted",
                itemId: null,
                media: null,
                canDecline: false,
                canDeleteItem: false,
              };
            })
          : []
        : isSettled
          ? []
          : [REQUEST, responses0.secondRequest];
      return Response.json({
        removalRequests,
        nextCursor: null,
        openCount: responses0.hasDeleted ? 0 : 2,
        settledCount: responses0.hasDeleted ? 2 : 0,
      });
    }),
  );
}
function _installRefreshesAllRequestsForADeletedItemAnswers0(): {
  hasDeleted: boolean;
  secondRequest: RemovalRequestDto;
} {
  const responseState: Pick<
    { hasDeleted: boolean; secondRequest: RemovalRequestDto },
    "hasDeleted"
  > = { hasDeleted: false };

  const secondRequest = {
    ...REQUEST,
    requestId: "018f0000-0000-7000-8000-00000000a002",
  };
  respondWith({ "GET /api/removal-requests": { body: PAGE, status: 200 } });
  return Object.assign(responseState, { secondRequest });
}

const REQUEST = makeRemovalRequestFromOverrides({
  canWithdraw: false,
  canDecline: true,
  canDeleteItem: true,
}) satisfies RemovalRequestDto;
const PAGE = {
  removalRequests: [REQUEST],
  nextCursor: null,
  openCount: 9,
  settledCount: 3,
} satisfies ListRemovalRequestsResponse;
describe("the routed answer queue", () => {
  it("shows server counts and no item GET, even with fewer loaded cards", async () => {
    respondWith({ "GET /api/removal-requests": { body: PAGE, status: 200 } });
    renderAt("/removal-requests");
    expect(
      await screen.findByRole("tab", { name: "Waiting · 9" }),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: "Settled · 3" })).toBeVisible();
    expect(
      recordedUrls().some((url) => {
        return /\/api\/items\/[^/]+$/.test(url);
      }),
    ).toBe(false);
  });
  it("allows settled history with no open requests and renders all outcomes", async () => {
    const settled = REMOVAL_REQUEST_STATES.filter((state) => {
      return state !== "open";
    }).map((state, index) => {
      return makeRemovalRequestFromOverrides({
        state: state,
        requestId: `018f0000-0000-7000-8000-00000000a00${index + 1}`,
        itemId: null,
        media: null,
        canWithdraw: false,
      });
    });
    respondWith({
      "GET /api/removal-requests": {
        body: { ...PAGE, openCount: 0, removalRequests: settled },
        status: 200,
      },
    });
    renderAt("/removal-requests");
    await userEvent.click(
      await screen.findByRole("tab", { name: "Settled · 3" }),
    );
    expect(await screen.findByText(/Deleted ·/)).toBeVisible();
    expect(screen.getByText(/Kept ·/)).toBeVisible();
    expect(screen.getByText(/Withdrawn ·/)).toBeVisible();
  });
  it("does not read the queue for a viewer", async () => {
    const me = createMeResponse();
    respondWith({
      "GET /api/me": {
        body: { ...me, me: { ...me.me, role: "viewer" } },
        status: 200,
      },
    });
    renderAt("/removal-requests");
    expect(
      await screen.findByText(/available to uploaders and admins/),
    ).toBeVisible();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(
      recordedUrls().some((url) => {
        return url.includes("/api/removal-requests");
      }),
    ).toBe(false);
  });
  it("follows an empty advancing page and stops repeated cursors with retry copy", async () => {
    respondWith({ "GET /api/removal-requests": { body: PAGE, status: 200 } });
    const originalFetch = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!url.includes("/api/removal-requests")) {
          return originalFetch(url, init);
        }
        const cursor = new URL(url, "http://localhost").searchParams.get(
          "cursor",
        );
        return Response.json({
          ...PAGE,
          removalRequests: cursor === null ? [] : [REQUEST],
          nextCursor: "same",
        });
      }),
    );
    renderAt("/removal-requests");
    expect(await screen.findByText("Papá is tagged in this one")).toBeVisible();
    await waitFor(() => {
      return expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
    });
    expect(screen.getAllByText("Papá is tagged in this one")).toHaveLength(1);
  });
  it("refreshes all requests for a deleted item and restores focus to a surviving queue tab", async () => {
    _installRefreshesAllRequestsForADeletedItemFetch0();
    renderAt("/removal-requests");
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Delete it" }))[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete it" }),
    );
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      return expect(
        screen.getByRole("tab", { name: "Waiting · 0" }),
      ).toHaveFocus();
    });
    await userEvent.click(screen.getByRole("tab", { name: "Settled · 2" }));
    expect(screen.getAllByText("Gone")).toHaveLength(2);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
