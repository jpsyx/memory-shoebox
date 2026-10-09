import { openItemDetails } from "@/testing/openItemDetails";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAt, respondWith, recordedUrls } from "@/testing/surfaceHarness";
import { createMeResponse } from "@/testing/createMeResponse";
import { makeItemDetail, ITEM_ID } from "@/testing/itemFixtureHelpers";
import {
  makePresenceRowFromOverrides,
  OBSERVATION_MEMBER_ID,
} from "../__tests__/observationFixtureHelpers";
function _respondWithDistinctViewerFacts(): void {
  const base = {
    member: { memberId: OBSERVATION_MEMBER_ID, displayName: "Rosa" },
    hasOpened: true,
    firstSeenAt: null,
    firstOpenedAt: "2026-09-14T04:41:00.000Z",
    lastOpenedAt: "2026-09-15T04:41:00.000Z",
    openCount: 23,
  };
  respondWith({
    [`GET /api/items/${ITEM_ID}/viewers`]: {
      status: 200,
      body: {
        viewers: [
          base,
          {
            ...base,
            member: { memberId: ITEM_ID, displayName: "Inés" },
            hasOpened: false,
            firstSeenAt: base.firstOpenedAt,
            firstOpenedAt: null,
            lastOpenedAt: null,
            openCount: 0,
          },
          {
            ...base,
            member: {
              memberId: "018f0000-0000-7000-8000-000000000099",
              displayName: "Tomás",
            },
            hasOpened: false,
            firstSeenAt: null,
            firstOpenedAt: null,
            lastOpenedAt: null,
            openCount: 0,
          },
        ],
        nextCursor: null,
      },
    },
  });
}

describe("Presence", () => {
  it("preserves server order and shows never-arrived members and zero facts", async () => {
    respondWith({
      "GET /api/presence": {
        status: 200,
        body: {
          presence: [
            makePresenceRowFromOverrides(),
            makePresenceRowFromOverrides({
              member: { memberId: ITEM_ID, displayName: "Rosa" },
              status: "active",
              activeDaysCount: 84,
              itemsOpenedCount: 1912,
              lastSignedInAt: "2026-09-01T10:00:00.000Z",
              lastSeenAt: "2026-09-16T10:00:00.000Z",
            }),
          ],
          nextCursor: null,
        },
      },
    });
    renderAt("/presence");
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Tomás");
    expect(rows[1]).toHaveTextContent("Never signed in");
    expect(rows[1]).toHaveTextContent("Not joined yet");
    expect(within(rows[1]!).getAllByText("0")).toHaveLength(4);
    expect(rows[2]).toHaveTextContent("Rosa");
    expect(rows[2]).toHaveTextContent("Last seen: Sep 16, 2026, 12:00 PM");
    expect(within(rows[2]!).getByText("Sep 1, 2026, 12:00 PM")).toBeVisible();
    expect(screen.getByText(/Last signed in is not last seen/)).toBeVisible();
    expect(
      screen.getByText(/The product database does not record/),
    ).toBeVisible();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Back to my account" }),
    ).toHaveAttribute("href", "/account");
  });
  it("shows distinct opened, seen-only and absent viewer facts on an uncached report", async () => {
    _respondWithDistinctViewerFacts();
    renderAt(`/presence?itemId=${ITEM_ID}`);
    expect(await screen.findByText(/opened 23/)).toBeVisible();
    expect(
      screen.getByText(/Seen on the timeline; no full-size open recorded/),
    ).toBeVisible();
    expect(
      screen.getByText(/No sighting or full-size open recorded/),
    ).toBeVisible();
    expect(screen.queryByText(/never visited/i)).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.queryByText(/counts as a full-size opening by you/),
    ).toBeNull();
    expect(recordedUrls()).not.toContain(`/api/items/${ITEM_ID}`);
    expect(
      screen.getByRole("link", { name: "Open this item" }),
    ).toHaveAttribute("href", `/items/${ITEM_ID}`);
    expect(recordedUrls()).not.toContain("/api/presence");
  });
  it.each(["viewer", "uploader"] as const)(
    "refuses %s without fetching privileged observations",
    async (role) => {
      respondWith({
        "GET /api/me": { status: 200, body: createMeResponse({ role }) },
      });
      renderAt(`/presence?itemId=${ITEM_ID}`);
      expect(
        await screen.findByText(/Only an admin can view presence/),
      ).toBeVisible();
      expect(
        recordedUrls().some((url) => {
          return (
            url.includes("viewers") ||
            url.includes("presence") ||
            url.includes(`/items/${ITEM_ID}`)
          );
        }),
      ).toBe(false);
    },
  );
  it("offers retry for an unavailable member read", async () => {
    respondWith({
      "GET /api/presence": {
        status: 503,
        body: { error: "unavailable", message: "No" },
      },
    });
    renderAt("/presence");
    await screen.findByRole("button", { name: "Retry" });
    respondWith({
      "GET /api/presence": {
        status: 200,
        body: { presence: [], nextCursor: null },
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("No active or invited members to show."),
    ).toBeVisible();
  });
  it("reads viewers on a no-cache deep link and reload without opening the item", async () => {
    const answers = {
      [`GET /api/items/${ITEM_ID}/viewers`]: {
        status: 200,
        body: { viewers: [], nextCursor: null },
      },
    };
    respondWith(answers);
    const firstVisit = renderAt(`/presence?itemId=${ITEM_ID}`);
    expect(
      await screen.findByText("No eligible viewer records to show."),
    ).toBeVisible();
    expect(recordedUrls()).toContain(`/api/items/${ITEM_ID}/viewers`);
    expect(recordedUrls()).not.toContain(`/api/items/${ITEM_ID}`);
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open this item" }),
    ).toHaveAttribute("href", `/items/${ITEM_ID}`);
    firstVisit.unmount();
    respondWith(answers);
    renderAt(`/presence?itemId=${ITEM_ID}`);
    expect(
      await screen.findByText("No eligible viewer records to show."),
    ).toBeVisible();
    expect(recordedUrls()).toContain(`/api/items/${ITEM_ID}/viewers`);
    expect(recordedUrls()).not.toContain(`/api/items/${ITEM_ID}`);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("Sep 14, 2026, 6:41 AM")).toBeNull();
    respondWith({
      [`GET /api/items/${ITEM_ID}`]: { status: 200, body: makeItemDetail() },
    });
    await userEvent.click(screen.getByRole("link", { name: "Open this item" }));
    await openItemDetails();
    expect(
      await screen.findByRole("link", { name: "Download the original" }),
    ).toBeVisible();
    expect(recordedUrls()).toContain(`/api/items/${ITEM_ID}`);
  });
  it("reuses a cached real preview without a counting item GET", async () => {
    const detail = makeItemDetail();
    respondWith({
      [`GET /api/items/${ITEM_ID}/viewers`]: {
        status: 200,
        body: { viewers: [], nextCursor: null },
      },
    });
    const { router } = renderAt(`/presence?itemId=${ITEM_ID}`);
    router.options.context!.queryClient.setQueryData(
      ["items", ITEM_ID],
      detail,
    );
    expect(
      await screen.findByText("No eligible viewer records to show."),
    ).toBeVisible();
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      detail.media.thumb.url,
    );
    expect(screen.getByText("Sep 14, 2026, 6:41 AM")).toBeVisible();
    expect(recordedUrls()).not.toContain(`/api/items/${ITEM_ID}`);
  });
  it("retries only unavailable viewers without opening an uncached item", async () => {
    respondWith({
      [`GET /api/items/${ITEM_ID}/viewers`]: {
        status: 503,
        body: { error: "unavailable", message: "No" },
      },
    });
    renderAt(`/presence?itemId=${ITEM_ID}`);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeEnabled();
    expect(recordedUrls()).toContain(`/api/items/${ITEM_ID}/viewers`);
    expect(recordedUrls()).not.toContain(`/api/items/${ITEM_ID}`);
    expect(screen.queryByText(/0 of 0/)).toBeNull();
    respondWith({
      [`GET /api/items/${ITEM_ID}/viewers`]: {
        status: 200,
        body: { viewers: [], nextCursor: null },
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("No eligible viewer records to show."),
    ).toBeVisible();
    expect(recordedUrls()).toContain(`/api/items/${ITEM_ID}/viewers`);
    expect(recordedUrls()).not.toContain(`/api/items/${ITEM_ID}`);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
