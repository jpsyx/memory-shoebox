import {
  makeBurst,
  makeDay,
  makeItem,
} from "@/surfaces/Timeline/timelineFixtures";
import { makeBurstFrame } from "@/testing/itemFixtureHelpers";
import { getRecordedBodyFromRequest } from "@/testing/surfaceHarness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTimeline } from "./TimelineSurface.fixtures";
import { answerBulkTimeline } from "./timelineBulkTestHelpers";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("selecting frames within timeline filters", () => {
  it("reopens an already cached fan through filtered reads before frames can be ticked", async () => {
    const tagId = "018f0000-0000-7000-8000-000000009001";
    const burst = makeBurst({ visibleFrameCount: 2 });
    const matchingFrame = { ...makeBurstFrame(2), altText: "Matching frame" };
    const outsideFrame = { ...makeBurstFrame(1), altText: "Outside filter" };
    answerBulkTimeline({
      "GET /api/timeline": {
        body: {
          days: [makeDay({ items: [makeItem({ burst })] })],
          nextCursor: null,
          resultCount: 1,
        },
        status: 200,
      },
    });
    const baseFetch = globalThis.fetch;
    const burstRequests: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "https://shoebox.test");
        if (url.pathname === `/api/bursts/${burst.burstId}/frames`) {
          burstRequests.push(String(input));
          const frames =
            url.searchParams.get("tags") === tagId
              ? [matchingFrame]
              : [outsideFrame, matchingFrame];
          return Response.json({ frames, nextCursor: null });
        }
        return baseFetch(input, init);
      },
    );
    renderTimeline(`/?tag=${tagId}`);
    await userEvent.click(
      await screen.findByRole("button", {
        name: /^A cartoon baby, 27 September 2026/,
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Outside filter" }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Select photos" }),
    );
    expect(
      screen.queryByRole("button", { name: "Outside filter" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: /^A cartoon baby, 27 September 2026/,
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Matching frame" }),
    );
    expect(
      screen.queryByRole("button", { name: "Outside filter" }),
    ).not.toBeInTheDocument();
    expect(burstRequests).toEqual([
      `/api/bursts/${burst.burstId}/frames`,
      `/api/bursts/${burst.burstId}/frames?tags=${tagId}`,
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete 1 permanently" }),
    );
    await waitFor(() => {
      expect(getRecordedBodyFromRequest("POST /api/items/bulk-edit")).toEqual({
        action: "delete",
        itemIds: [matchingFrame.itemId],
      });
    });
  });
});
