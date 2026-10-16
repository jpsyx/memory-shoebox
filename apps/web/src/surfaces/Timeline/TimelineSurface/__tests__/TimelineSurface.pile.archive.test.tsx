import { screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { describe, expect, it } from "vitest";

import { setFirstSignIn } from "@/session/firstSignIn/firstSignIn";

import { makeDay, makeItem } from "@/surfaces/Timeline/timelineFixtureHelpers";

import {
  makeFrameIdFromPosition,
  makeItemDetail,
} from "@/testing/itemFixtureHelpers";

import { createMeResponse } from "@/testing/createMeResponse";

import {
  recordedUrls,
  renderTimeline,
  respondWith,
} from "./timelineSurfaceTestHelpers";
import { installTimelineSurfacePileTestLifecycle } from "./installTimelineSurfacePileTestLifecycle";
installTimelineSurfacePileTestLifecycle();
describe("the timeline", () => {
  it("draws the days the route returned", async () => {
    renderTimeline();
    expect(await screen.findByText("27")).toBeTruthy();
  });
});
describe("the timeline", () => {
  it("shows surface 5 when the archive has no days", async () => {
    respondWith({
      "GET /api/timeline": {
        body: {
          previousCursor: null,
          days: [],
          nextCursor: null,
          resultCount: null,
        },
        status: 200,
      },
      "GET /api/timeline/rail": {
        body: { days: [], nextCursor: null },
        status: 200,
      },
    });
    renderTimeline();
    expect(await screen.findByText("Nothing on the door yet.")).toBeTruthy();
  });
});
describe("the timeline", () => {
  it("shows a viewer the other copy for the same empty payload", async () => {
    respondWith({
      "GET /api/me": {
        body: createMeResponse({ role: "viewer" }),
        status: 200,
      },
      "GET /api/timeline": {
        body: {
          previousCursor: null,
          days: [],
          nextCursor: null,
          resultCount: null,
        },
        status: 200,
      },
      "GET /api/timeline/rail": {
        body: { days: [], nextCursor: null },
        status: 200,
      },
    });
    renderTimeline();
    expect(await screen.findByText("Nothing here for you yet.")).toBeTruthy();
  });
});
describe("the timeline", () => {
  it("opens a print in the item viewer", async () => {
    const { router } = renderTimeline();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "A cartoon baby, 27 September 2026.",
      }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        "/items/018f0000-0000-7000-8000-00000000a001",
      );
    });
  });
});
describe("the timeline", () => {
  it("reuses the actual member-bound timeline page when opening a print", async () => {
    const first = makeItem({ itemId: makeFrameIdFromPosition(1) });
    const second = makeItem({
      itemId: makeFrameIdFromPosition(2),
      media: { ...first.media, altText: "The following photo" },
    });
    respondWith({
      "GET /api/timeline": {
        status: 200,
        body: {
          previousCursor: null,
          days: [makeDay({ items: [first, second] })],
          nextCursor: null,
          resultCount: null,
        },
      },
      [`GET /api/items/${first.itemId}`]: {
        status: 200,
        body: makeItemDetail({ itemId: first.itemId, media: first.media }),
      },
    });
    renderTimeline();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "A cartoon baby, 27 September 2026.",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Next photo or video" }),
      ).not.toHaveAttribute("aria-disabled", "true");
    });
    expect(
      recordedUrls().filter((url) => {
        return url.startsWith("/api/media/");
      }),
    ).toEqual([]);
    expect(
      recordedUrls().filter((url) => {
        return /^\/api\/items\/[^/]+$/.test(url);
      }),
    ).toEqual([`/api/items/${first.itemId}`]);
  });
});
describe("the timeline", () => {
  it("draws the end of the archive when there is no next page", async () => {
    renderTimeline();
    expect(await screen.findByText("That is all of it.")).toBeTruthy();
  });
});
describe("the timeline", () => {
  it("does not draw the end while there is another page to come", async () => {
    respondWith({
      "GET /api/timeline": {
        body: {
          previousCursor: null,
          days: [makeDay()],
          nextCursor: "next",
          resultCount: null,
        },
        status: 200,
      },
    });
    renderTimeline();
    await screen.findByText("27");
    expect(screen.queryByText("That is all of it.")).toBeNull();
  });
});
describe("the timeline", () => {
  it("finishes the welcome sentence with the rail's own total", async () => {
    respondWith({
      "GET /api/timeline/rail": {
        body: {
          days: [
            {
              capturedOn: "2026-09-27",
              itemCount: 340,
              photoCount: 340,
              videoCount: 0,
            },
            {
              capturedOn: "2026-07-04",
              itemCount: 4,
              photoCount: 4,
              videoCount: 0,
            },
          ],
          nextCursor: null,
        },
        status: 200,
      },
    });
    // Module state, deliberately: `firstSignIn.ts` says it is not a server
    // fact and not durable, so it lives in neither the query cache nor
    // `sessionStorage`. Setting it is the only way to arm the banner, and
    // `takeFirstSignIn` clears it as the surface reads it.
    setFirstSignIn(true);
    renderTimeline();
    expect(
      await screen.findByText(
        /344 photos and videos are ready to look through/,
      ),
    ).toBeTruthy();
  });
});
describe("the timeline", () => {
  it("says what the whole archive is while nothing is chosen", async () => {
    respondWith({
      "GET /api/timeline/rail": {
        body: {
          days: [
            {
              capturedOn: "2026-09-27",
              itemCount: 340,
              photoCount: 340,
              videoCount: 0,
            },
            {
              capturedOn: "2026-07-04",
              itemCount: 4,
              photoCount: 4,
              videoCount: 0,
            },
          ],
          nextCursor: null,
        },
        status: 200,
      },
    });
    renderTimeline("/?find=true");
    expect(
      await screen.findByText(
        /The whole archive: 344 photos and videos across 2 days/,
      ),
    ).toBeTruthy();
  });
});
