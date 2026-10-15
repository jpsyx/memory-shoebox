import { makeDay, makeItem } from "@/surfaces/Timeline/timelineFixtures";
import { createMeResponse } from "@/testing/createMeResponse";
import type { Answer } from "@/testing/surfaceHarness";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { respondWith } from "./TimelineSurface.fixtures";

/** Fixed landed identities shared by the bulk interaction regressions. */
export const BULK_ITEM_IDS = [
  "018f0000-0000-7000-8000-00000000a001",
  "018f0000-0000-7000-8000-00000000a002",
];

/** Installs a real routed timeline with two individually selectable photos. */
export function answerBulkTimeline(
  routes: Readonly<Record<string, Answer>> = {},
): void {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  respondWith({
    "GET /api/me": {
      body: createMeResponse({ role: "admin" }),
      status: 200,
    },
    "GET /api/timeline": {
      body: {
        previousCursor: null,
        days: [
          makeDay({
            items: BULK_ITEM_IDS.map((itemId, position) => {
              return makeItem({
                itemId,
                media: {
                  ...makeItem().media,
                  altText: `Family photo ${position + 1}`,
                },
              });
            }),
          }),
        ],
        nextCursor: null,
        resultCount: null,
      },
      status: 200,
    },
    "POST /api/items/bulk-edit": { body: undefined, status: 204 },
    ...routes,
  });
}

/** Enters bulk mode and ticks both actual timeline prints. */
export async function tickBothTimelinePhotos(): Promise<void> {
  await userEvent.click(
    await screen.findByRole("button", { name: "Select photos" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Family photo 1" }));
  await userEvent.click(screen.getByRole("button", { name: "Family photo 2" }));
}
