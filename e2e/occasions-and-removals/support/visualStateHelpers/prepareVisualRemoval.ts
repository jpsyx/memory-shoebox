import type { ItemSummary, MemberRef } from "@memory-shoebox/shared";
import type { Page } from "@playwright/test";
import { makeVisualRemovalFromOptions } from "./makeVisualRemovalFromOptions.ts";
type VisualRemovalOptions = {
  page: Page;
  surface: string;
  state: string;
  member: MemberRef;
  item: ItemSummary;
  longText?: boolean;
};

async function _routeVisualQueue({
  page,
  state,
  request,
  settled,
}: Readonly<RouteVisualQueueOptions>): Promise<void> {
  await page.route("**/api/removal-requests?*", async (route) => {
    const isSettled =
      new URL(route.request().url()).searchParams.get("state") === "settled";
    await route.fulfill({
      json: {
        removalRequests:
          state === "none"
            ? []
            : isSettled
              ? settled
              : [
                  request,
                  {
                    ...request,
                    requestId: "018f0000-0000-7000-8000-00000000a004",
                    requestedBy: {
                      ...request.requestedBy,
                      displayName: "Tío Rafa",
                    },
                    reason: null,
                  },
                ],
        openCount: state === "none" ? 0 : 2,
        settledCount: state === "none" ? 0 : 3,
        nextCursor: null,
      },
    });
  });
}

/** Controlled removal responses only: no live-flow claim derives from them. */
export async function prepareVisualRemoval(
  options: Readonly<VisualRemovalOptions>,
): Promise<string> {
  const { page, surface, state, member, item } = options;
  const { request, settled } = makeVisualRemovalFromOptions(options);
  await page.route("**/api/items/*/removal-requests*", async (route) => {
    await route.fulfill({
      json: {
        item,
        removalRequests:
          state === "ask"
            ? []
            : state === "declined"
              ? [{ ...settled[1], requestedBy: member }]
              : [request],
        canRequestRemoval: ["ask", "declined"].includes(state),
        nextCursor: null,
      },
    });
  });
  await _routeVisualQueue({ page, state, request, settled });
  return surface === "removal"
    ? `/items/${item.itemId}/removal`
    : "/removal-requests";
}
type RouteVisualQueueOptions = {
  page: Page;
  state: string;
  request: ReturnType<typeof makeVisualRemovalFromOptions>["request"];
  settled: ReturnType<typeof makeVisualRemovalFromOptions>["settled"];
};
