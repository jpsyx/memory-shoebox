import { makeTimelineQueryOptionsFromView } from "@/api/timeline/timeline";

import { createMeResponse } from "@/testing/createMeResponse";

import { act, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { describe, expect, it } from "vitest";

import { getRecordedRequests } from "@/testing/fetchStubHelpers";

import { makeDay } from "@/surfaces/Timeline/timelineFixtures";

import {
  makeBurstDetail,
  makeBurstFrame,
  makeFrameIdFromPosition,
} from "@/testing/itemFixtureHelpers";

import { recordedUrls, renderItem } from "@/testing/itemHarnessHelpers";

import { renderAt } from "@/testing/surfaceHarness";

import { itemQueryOptions } from "@/api/items/items";

import { markPileStale } from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import {
  FIRST,
  LAST,
  MIDDLE,
  respondWithNavigationItems,
  waitForNavigationReady,
} from "./ItemNavigationTestHelpers";

describe("viewer navigation", () => {
  it("navigates using sufficient retained timeline refs without another neighborhood read", async () => {
    respondWithNavigationItems({}, [FIRST, LAST]);
    const { router } = renderItem(FIRST.itemId);
    const queryClient = router.options.context!.queryClient;
    const freshItems = [FIRST, LAST].map((item) => {
      const fresh = (source: typeof item.media.thumb) => {
        return source === null
          ? null
          : { ...source, expiresAt: "2099-01-01T00:00:00Z" };
      };
      return {
        ...item,
        media: {
          ...item.media,
          thumb: fresh(item.media.thumb),
          display: fresh(item.media.display),
          poster: fresh(item.media.poster),
          displayCandidates: item.media.displayCandidates.map((source) => {
            return fresh(source)!;
          }),
        },
      };
    });
    queryClient.setQueryData(
      makeTimelineQueryOptionsFromView({
        memberId: createMeResponse().me.member.memberId,
        view: { selection: { tags: [], people: [] }, at: undefined },
      }).queryKey,
      {
        pages: [
          {
            selectionResultCount: null,
            previousCursor: null,
            metadataUpdatedAt: Date.now(),
            days: [makeDay({ items: freshItems })],
            nextCursor: null,
            resultCount: null,
          },
        ],
        pageParams: [null],
      },
    );
    await userEvent.click(await waitForNavigationReady());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${LAST.itemId}`);
    });
    const previous = await screen.findByRole("button", {
      name: "Previous photo or video",
    });
    await waitFor(() => {
      expect(previous).not.toHaveAttribute("aria-disabled", "true");
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
    ).toEqual([`/api/items/${FIRST.itemId}`, `/api/items/${LAST.itemId}`]);
  });
});
describe("viewer navigation", () => {
  it("refreshes neighbours when a same-day capture-time edit reorders the current photo", async () => {
    respondWithNavigationItems();
    const { router } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    const changed = { ...FIRST, capturedAt: "2026-09-14T12:00:00.000Z" };
    respondWithNavigationItems(
      {
        "GET /api/timeline": {
          status: 200,
          body: {
            previousCursor: null,
            days: [
              makeDay({
                capturedOn: FIRST.capturedOn,
                items: [MIDDLE, changed, LAST],
              }),
            ],
            nextCursor: null,
            resultCount: null,
          },
        },
      },
      [MIDDLE, changed, LAST],
    );
    const queryClient = router.options.context!.queryClient;
    act(() => {
      queryClient.setQueryData(
        itemQueryOptions(FIRST.itemId).queryKey,
        changed,
      );
      markPileStale(queryClient);
    });
    const previous = screen.getByRole("button", {
      name: "Previous photo or video",
    });
    await waitFor(() => {
      expect(previous).not.toHaveAttribute("aria-disabled", "true");
    });
    await userEvent.click(previous);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    });
  });
});
describe("viewer navigation", () => {
  it("preserves the timeline filters across moves and returns to that timeline with Back", async () => {
    respondWithNavigationItems();
    const tag = "018f0000-0000-7000-8000-00000000e201";
    const person = "018f0000-0000-7000-8000-00000000e101";
    const { router } = renderAt(
      `/?tag=${tag}&person=${person}&from=2026-09-01&until=2026-09-30`,
    );
    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: /^Mateo, Papá and Mamá/ })
      )[0]!,
    );
    await userEvent.click(await waitForNavigationReady());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    });
    await waitForNavigationReady();
    expect(
      getRecordedRequests().filter((request) => {
        return request.url === "/api/media/neighbors";
      }),
    ).toEqual([]);
    expect(router.state.location.state.itemNavigationSelection).toEqual({
      tags: [tag],
      people: [person],
      from: "2026-09-01",
      until: "2026-09-30",
    });
    await userEvent.click(screen.getByRole("link", { name: /Back to/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(router.state.location.search).toMatchObject({
      tag: [tag],
      person: [person],
      from: "2026-09-01",
      until: "2026-09-30",
    });
  });
});
describe("viewer navigation", () => {
  it("enters the last frame when moving backward into a stack", async () => {
    const burstFirst = makeBurstDetail({ position: 11, frameCount: 12 });
    const burstLast = makeBurstDetail({ position: 12, frameCount: 12 });
    respondWithNavigationItems(
      {
        "GET /api/timeline": {
          status: 200,
          body: {
            previousCursor: null,
            days: [
              makeDay({
                capturedOn: FIRST.capturedOn,
                items: [burstFirst, LAST],
              }),
            ],
            nextCursor: null,
            resultCount: null,
          },
        },
        [`GET /api/bursts/${burstFirst.burst!.burstId}/frames`]: {
          status: 200,
          body: {
            frames: [makeBurstFrame(11), makeBurstFrame(12)],
            nextCursor: null,
          },
        },
        [`GET /api/items/${burstLast.itemId}`]: {
          status: 200,
          body: burstLast,
        },
      },
      [burstFirst, burstLast, LAST],
    );
    const { router } = renderItem(LAST.itemId);
    const previousButton = await screen.findByRole("button", {
      name: "Previous photo or video",
    });
    await waitFor(() => {
      expect(previousButton).not.toHaveAttribute("aria-disabled", "true");
    });
    await userEvent.click(previousButton);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${burstLast.itemId}`);
    });
  });
});
describe("viewer navigation", () => {
  it("crosses days, skips empty days, and walks every frame of an adjacent burst", async () => {
    const burstFirst = makeBurstDetail({
      position: 11,
      frameCount: 12,
      overrides: {
        capturedOn: "2026-09-12",
        burstFrames: [makeBurstFrame(11), makeBurstFrame(12)],
      },
    });
    const burstLast = {
      ...burstFirst,
      itemId: makeFrameIdFromPosition(12),
      burstPosition: 12,
    };
    respondWithNavigationItems(
      {
        "GET /api/timeline": {
          status: 200,
          body: {
            previousCursor: null,
            days: [
              makeDay({ capturedOn: FIRST.capturedOn, items: [FIRST] }),
              makeDay({ capturedOn: "2026-09-12", items: [burstFirst] }),
            ],
            nextCursor: null,
            resultCount: null,
          },
        },
        "GET /api/timeline/rail": {
          status: 200,
          body: {
            days: [
              {
                capturedOn: FIRST.capturedOn,
                itemCount: 1,
                photoCount: 1,
                videoCount: 0,
              },
              {
                capturedOn: "2026-09-13",
                itemCount: 0,
                photoCount: 0,
                videoCount: 0,
              },
              {
                capturedOn: "2026-09-12",
                itemCount: 2,
                photoCount: 2,
                videoCount: 0,
              },
            ],
            nextCursor: null,
          },
        },
        [`GET /api/bursts/${burstFirst.burst!.burstId}/frames`]: {
          status: 200,
          body: {
            frames: [makeBurstFrame(11), makeBurstFrame(12)],
            nextCursor: null,
          },
        },
        [`GET /api/items/${burstFirst.itemId}`]: {
          status: 200,
          body: burstFirst,
        },
        [`GET /api/items/${burstLast.itemId}`]: {
          status: 200,
          body: burstLast,
        },
      },
      [FIRST, burstFirst, burstLast],
    );
    const { router } = renderItem(FIRST.itemId);
    const nextButton = await waitForNavigationReady();
    expect(
      recordedUrls().some((url) => {
        return url.includes("/bursts/");
      }),
    ).toBe(false);
    await userEvent.click(nextButton);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/items/${burstFirst.itemId}`,
      );
    });
    await userEvent.click(await waitForNavigationReady());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${burstLast.itemId}`);
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Previous photo or video" }),
      ).not.toHaveAttribute("aria-disabled", "true");
    });
    await userEvent.keyboard("h");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/items/${burstFirst.itemId}`,
      );
    });
    await waitForNavigationReady();
    await userEvent.keyboard("h");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
    });
  });
});
