import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  makeDay,
  makeItem,
  makeMediaSource,
} from "@/surfaces/Timeline/timelineFixtures";
import {
  recordedUrls,
  renderTimeline,
  respondWith,
} from "./TimelineSurface.fixtures";

/**
 * Real timers, deliberately: `vi.useFakeTimers` fights TanStack Query and
 * Testing Library's own `waitFor` polling, and the combination hangs rather
 * than firing.
 *
 * `useReSigning` refetches thirty seconds before the soonest signature
 * expires, so the fixture's own expiry is set five seconds past that: enough
 * real time for the render and the "before" read to finish first, even on a
 * full-suite run with three dozen jsdom environments sharing sixteen cores
 * (`vitest.setup.ts`), where "a second is not enough" for other async waits
 * either. A fixture only a couple of seconds out was tried first and clamps
 * to an immediate refetch, which had usually already happened before
 * "before" was even read, so `before` and `after` came out equal rather than
 * proving anything, and that got worse rather than better under full-suite
 * contention.
 */
const REFETCH_MARGIN_MS = 30_000;
const REFETCH_WINDOW_MS = 5_000;

describe("a page left open past the signed-URL lifetime", () => {
  beforeEach(() => {
    respondWith();
  });

  it("refetches in place and keeps the same node on the page", async () => {
    const soon = new Date(
      Date.now() + REFETCH_MARGIN_MS + REFETCH_WINDOW_MS,
    ).toISOString();
    const day = makeDay({
      capturedOn: "2026-09-27",
      itemCount: 1,
      items: [
        makeItem({
          media: {
            ...makeItem().media,
            thumb: makeMediaSource({ expiresAt: soon }),
            display: makeMediaSource({ expiresAt: soon }),
          },
        }),
      ],
    });
    respondWith({
      "GET /api/timeline": {
        body: { days: [day], nextCursor: null, resultCount: null },
        status: 200,
      },
    });
    const { container } = renderTimeline();
    const print = await screen.findByRole("button", { name: /cartoon baby/i });

    // An unfiltered request carries no query string at all (see
    // `makeQueryFromView`), so the path is bare `/api/timeline`: matching
    // must strip any `?` rather than require one.
    const before = recordedUrls().filter((url) => {
      return url.split("?")[0] === "/api/timeline";
    }).length;

    await waitFor(
      () => {
        const after = recordedUrls().filter((url) => {
          return url.split("?")[0] === "/api/timeline";
        }).length;
        expect(after).toBeGreaterThan(before);
      },
      { timeout: 15_000 },
    );

    // The same node, never unmounted, which is what keeps the scroll: a node
    // that was never unmounted cannot have moved. jsdom performs no layout
    // and stubs `scrollTo` as a no-op, so `window.scrollY` proves nothing
    // here and is deliberately not asserted on.
    expect(screen.getByRole("button", { name: /cartoon baby/i })).toBe(print);
    expect(container.querySelectorAll("[data-item-id]").length).toBe(1);
  }, 20_000);
});
