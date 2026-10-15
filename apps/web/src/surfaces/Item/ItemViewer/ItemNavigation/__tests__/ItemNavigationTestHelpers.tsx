import { screen, waitFor } from "@testing-library/react";

import { expect, vi } from "vitest";

import { makeDay } from "@/surfaces/Timeline/timelineFixtures";

import {
  makeFrameIdFromPosition,
  makeItemDetail,
  makeVideoDetail,
} from "@/testing/itemFixtureHelpers";

import { respondWithItem } from "@/testing/itemHarnessHelpers";

import { type Answer } from "@/testing/surfaceHarness";

/** Shared scenario fixture. */
export const FIRST = makeItemDetail({ itemId: makeFrameIdFromPosition(1) });
/** Shared scenario fixture. */
export const MIDDLE = makeVideoDetail({ itemId: makeFrameIdFromPosition(2) });
/** Shared scenario fixture. */
export const LAST = makeItemDetail({ itemId: makeFrameIdFromPosition(3) });
/** Shared scenario fixture. */
export function respondWithNavigationItems(
  routes: Record<string, Answer> = {},
  order = [FIRST, MIDDLE, LAST],
): void {
  respondWithItem({
    detail: FIRST,
    routes: {
      [`GET /api/items/${MIDDLE.itemId}`]: { status: 200, body: MIDDLE },
      [`GET /api/items/${LAST.itemId}`]: { status: 200, body: LAST },
      "GET /api/timeline": {
        status: 200,
        body: {
          previousCursor: null,
          days: [
            makeDay({
              capturedOn: FIRST.capturedOn,
              items: [FIRST, MIDDLE, LAST],
            }),
          ],
          nextCursor: null,
          resultCount: null,
        },
      },
      "POST /api/media/neighbors": {
        status: 200,
        body: { ahead: [], behind: [] },
      },
      ...routes,
    },
  });
  const baseFetch = fetch;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const response = await baseFetch(url, init);
    if (url !== "/api/media/neighbors" || !response.ok) {
      return response;
    }
    const request = JSON.parse(String(init?.body)) as {
      itemId: string;
      direction: "next" | "previous";
    };
    const position = order.findIndex((item) => {
      return item.itemId === request.itemId;
    });
    const preview = (item: typeof FIRST) => {
      return {
        itemId: item.itemId,
        kind: item.kind,
        width: item.media.width,
        height: item.media.height,
        media: item.media,
      };
    };
    const forward = request.direction === "next";
    return Response.json({
      ahead: !forward
        ? order
            .slice(Math.max(0, position - 2), position)
            .reverse()
            .map(preview)
        : position < 0
          ? []
          : order.slice(position + 1, position + 3).map(preview),
      behind: !forward
        ? order.slice(position + 1, position + 2).map(preview)
        : position <= 0
          ? []
          : [preview(order[position - 1]!)],
    });
  });
}
/** Shared scenario fixture. */
export async function waitForNavigationReady(): Promise<HTMLElement> {
  const nextButton = await screen.findByRole("button", {
    name: "Next photo or video",
  });
  await waitFor(() => {
    expect(nextButton).not.toHaveAttribute("aria-disabled", "true");
  });
  return nextButton;
}
