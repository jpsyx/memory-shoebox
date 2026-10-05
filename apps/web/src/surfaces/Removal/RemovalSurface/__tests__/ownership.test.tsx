import { makeItemSummaryFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import { recordedUrls, renderAt, respondWith } from "@/testing/surfaceHarness";
import { act, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { HISTORY, ITEM, OWN, RESPONSE } from "./renderRemovalSurface";
it("keeps new-item history isolated from a delayed old-item read", async () => {
  const other = makeItemSummaryFromOverrides({
    itemId: "018f0000-0000-7000-8000-00000000f002",
  });
  const { hold, letGo } = makeHold();
  respondWith({
    [`GET ${HISTORY}`]: {
      status: 200,
      body: { ...RESPONSE, removalRequests: [OWN] },
      waitFor: hold,
    },
    [`GET /api/items/${other.itemId}/removal-requests`]: {
      status: 200,
      body: { ...RESPONSE, item: other, canRequestRemoval: false },
    },
  });
  const { router } = renderAt(`/items/${ITEM.itemId}/removal`);
  await waitFor(() => {
    return expect(recordedUrls()).toContain(HISTORY);
  });
  await act(async () => {
    await router.navigate({
      to: "/items/$itemId/removal",
      params: { itemId: other.itemId },
    });
  });
  expect(
    await screen.findByText("You cannot ask for this photograph to come down."),
  ).toBeVisible();
  await act(async () => {
    return letGo();
  });
  expect(screen.queryByText("Please remove this.")).toBeNull();
});
