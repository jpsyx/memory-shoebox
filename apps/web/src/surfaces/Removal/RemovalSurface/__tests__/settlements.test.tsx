import {
  makeItemSummaryFromOverrides,
  makeRemovalRequestFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import { renderAt, respondWith } from "@/testing/surfaceHarness";
import type { ItemSummary } from "@memory-shoebox/shared";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  HISTORY,
  ITEM,
  RESPONSE,
  renderRemovalSurface,
} from "./renderRemovalSurface";
function _installDoesNotNavigateANewItemAfterAnswers0(): {
  other: ItemSummary;
  letGo: () => void;
} {
  const other = makeItemSummaryFromOverrides({
    itemId: "018f0000-0000-7000-8000-00000000f002",
  });
  const { hold, letGo } = makeHold();
  respondWith({
    [`GET ${HISTORY}`]: {
      status: 200,
      body: {
        ...RESPONSE,
        removalRequests: [
          makeRemovalRequestFromOverrides({
            canWithdraw: false,
            canDeleteItem: true,
          }),
        ],
      },
    },
    [`DELETE /api/items/${ITEM.itemId}`]: {
      status: 204,
      body: undefined,
      waitFor: hold,
    },
    [`GET /api/items/${other.itemId}/removal-requests`]: {
      status: 200,
      body: { ...RESPONSE, item: other },
    },
  });
  return { other, letGo };
}

it("shows every incoming request alongside an admin's own asking form without proxy withdrawal", async () => {
  const incoming = makeRemovalRequestFromOverrides({
    canWithdraw: false,
    canDeleteItem: true,
    canDecline: true,
    reason: "First ask",
  });
  renderRemovalSurface({
    requests: [
      incoming,
      {
        ...incoming,
        requestId: "018f0000-0000-7000-8000-00000000a002",
        reason: "Second ask",
      },
    ],
    canRequestRemoval: true,
  });
  expect(await screen.findByText("First ask")).toBeVisible();
  expect(screen.getByText("Second ask")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Delete it" })).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "Send the request" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Withdraw the request" }),
  ).toBeNull();
});
it("navigates confirmed deletion to the queue with local confirmation", async () => {
  renderRemovalSurface({
    requests: [
      makeRemovalRequestFromOverrides({
        canWithdraw: false,
        canDeleteItem: true,
      }),
    ],
  });
  const originalFetch = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : url.startsWith("/api/removal-requests?")
          ? Response.json({
              removalRequests: [],
              nextCursor: null,
              openCount: 0,
              settledCount: 1,
            })
          : originalFetch(url, init);
    }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Delete it" }),
  );
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Delete it",
    }),
  );
  expect(await screen.findByText("The photograph was deleted.")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Removal requests." }),
  ).toBeVisible();
  expect(screen.queryByRole("link", { name: "Back to the photo" })).toBeNull();
});
it("does not navigate a new item after delayed deletion of the previous item", async () => {
  const responses0 = _installDoesNotNavigateANewItemAfterAnswers0();
  const { router } = renderAt(`/items/${ITEM.itemId}/removal`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Delete it" }),
  );
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Delete it",
    }),
  );
  await act(async () => {
    await router.navigate({
      to: "/items/$itemId/removal",
      params: { itemId: responses0.other.itemId },
    });
  });
  await act(async () => {
    return responses0.letGo();
  });
  expect(
    await screen.findByRole("button", { name: "Send the request" }),
  ).toBeVisible();
  expect(router.state.location.pathname).toBe(
    `/items/${responses0.other.itemId}/removal`,
  );
  expect(screen.queryByText("The photograph was deleted.")).toBeNull();
});
