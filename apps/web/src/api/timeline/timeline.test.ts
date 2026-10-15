import {
  getArchiveTotalsFromRail,
  makeRailPathFromSelection,
  makeTimelinePathFromView,
  makeTimelineQueryOptionsFromView,
} from "@/api/timeline/timeline";
import type { RailDay } from "@memory-shoebox/shared";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { makeDay, makeItem } from "@/surfaces/Timeline/timelineFixtures";
import { makeFrameIdFromPosition } from "@/testing/itemFixtureHelpers";
import { afterEach, describe, expect, it, vi } from "vitest";
const EMPTY = { tags: [], people: [], from: undefined, until: undefined };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bounded bidirectional timeline query", () => {
  it("isolates a canceled refresh count from the replacement sequential fetch", async () => {
    const client = new QueryClient();
    const options = makeTimelineQueryOptionsFromView({
      memberId: "one",
      view: { selection: { ...EMPTY, from: "2026-09-01" }, at: undefined },
    });
    client.setQueryData(options.queryKey, {
      pages: [3, 4].map((pageIndex) => {
        return {
          days: [makeDay({ capturedOn: `2026-09-${23 - pageIndex}` })],
          nextCursor: `older-${pageIndex + 1}`,
          previousCursor: `newer-${pageIndex - 1}`,
          resultCount: null,
          selectionResultCount: 8,
          metadataUpdatedAt: 1_000_000,
        };
      }),
      pageParams: ["older-3", "older-4"],
    });
    let finishOld: ((response: Response) => void) | undefined;
    let finishNewSecond: ((response: Response) => void) | undefined;
    const requests: Array<{ url: string; signal: AbortSignal }> = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      requests.push({ url, signal: init.signal! });
      if (requests.length === 1) {
        return new Promise<Response>((finish) => {
          finishOld = finish;
        });
      }
      if (requests.length === 2) {
        return Promise.resolve(
          Response.json({
            days: [makeDay()],
            nextCursor: "older-4",
            previousCursor: "newer-2",
            resultCount: 7,
          }),
        );
      }
      return new Promise<Response>((finish) => {
        finishNewSecond = finish;
      });
    });
    const observer = new InfiniteQueryObserver(client, options);
    try {
      const oldRefresh = observer.refetch();
      await vi.waitFor(() => {
        return expect(requests).toHaveLength(1);
      });
      await client.cancelQueries({ queryKey: options.queryKey, exact: true });
      const newRefresh = observer.refetch();
      await vi.waitFor(() => {
        return expect(requests).toHaveLength(3);
      });
      expect(requests[0]!.signal.aborted).toBe(true);
      finishOld!(
        Response.json({
          days: [makeDay()],
          nextCursor: "older-4",
          previousCursor: "newer-2",
          resultCount: 20,
        }),
      );
      await oldRefresh;
      await new Promise<void>((finish) => {
        return queueMicrotask(finish);
      });
      finishNewSecond!(
        Response.json({
          days: [makeDay()],
          nextCursor: null,
          previousCursor: "newer-3",
          resultCount: null,
        }),
      );
      await newRefresh;
      expect(
        observer.getCurrentResult().data!.pages.map((page) => {
          return page.selectionResultCount;
        }),
      ).toEqual([7, 7]);
      expect(
        requests.map(({ url }) => {
          return new URL(url, "http://localhost").searchParams.get(
            "includeResultCount",
          );
        }),
      ).toEqual(["true", "true", null]);
    } finally {
      observer.destroy();
      client.clear();
    }
  });
  it("restores evicted pages with opaque reverse cursors, original provenance and the effective jump", async () => {
    const requestedUrls: string[] = [];
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      return now;
    });
    const originalIds = Array.from({ length: 8 }, (_unused, index) => {
      return makeFrameIdFromPosition(index + 1);
    });
    vi.stubGlobal("fetch", async (url: string) => {
      requestedUrls.push(url);
      const query = new URL(url, "http://localhost").searchParams;
      const pageIndex = Number(query.get("cursor")?.split("-")[1] ?? 0);
      expect(query.get("until")).toBe("2026-09-23");
      return Response.json({
        days: [
          makeDay({
            capturedOn: `2026-09-${23 - pageIndex}`,
            items: [makeItem({ itemId: originalIds[pageIndex]! })],
          }),
        ],
        nextCursor: pageIndex < 7 ? `older-${pageIndex + 1}` : null,
        previousCursor: pageIndex > 0 ? `newer-${pageIndex - 1}` : null,
        resultCount: pageIndex === 0 ? 8 : null,
      });
    });
    const queryClient = new QueryClient();
    const options = makeTimelineQueryOptionsFromView({
      memberId: "one",
      view: { selection: { ...EMPTY, until: "2026-09-25" }, at: "2026-09-23" },
    });
    const observer = new InfiniteQueryObserver(queryClient, options);
    try {
      await observer.refetch();
      for (let pageIndex = 1; pageIndex < 8; pageIndex += 1) {
        now += 100;
        await observer.fetchNextPage();
        expect(
          observer.getCurrentResult().data!.pages.length,
        ).toBeLessThanOrEqual(5);
      }
      const retained = observer.getCurrentResult().data!.pages;
      expect(
        retained.map((page) => {
          return page.days[0]!.capturedOn;
        }),
      ).toEqual([
        "2026-09-20",
        "2026-09-19",
        "2026-09-18",
        "2026-09-17",
        "2026-09-16",
      ]);
      for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
        now += 100;
        await observer.fetchPreviousPage();
      }
      const restored = observer.getCurrentResult().data!.pages;
      const restoredIds = restored.flatMap((page) => {
        return page.days.flatMap((day) => {
          return day.items.map((item) => {
            return item.itemId;
          });
        });
      });
      expect(restoredIds).toEqual(originalIds.slice(0, 5));
      expect(restored).toHaveLength(5);
      expect(
        new Set(
          restored.flatMap((page) => {
            return page.days.map((day) => {
              return day.capturedOn;
            });
          }),
        ).size,
      ).toBe(5);
      expect(
        restored.slice(3).map((page) => {
          return page.metadataUpdatedAt;
        }),
      ).toEqual([1_000_300, 1_000_400]);
      expect(
        requestedUrls.slice(-3).map((url) => {
          return new URL(url, "http://localhost").searchParams.get("cursor");
        }),
      ).toEqual(["newer-2", "newer-1", "newer-0"]);
      const newerThanJumpDays = restored
        .flatMap((page) => {
          return page.days;
        })
        .filter((day) => {
          return day.capturedOn > "2026-09-23";
        });
      expect(newerThanJumpDays).toEqual([]);
    } finally {
      observer.destroy();
      queryClient.clear();
    }
  });
});

describe("makeTimelinePathFromView", () => {
  it("asks for the whole archive when nothing is chosen", () => {
    expect(
      makeTimelinePathFromView({ view: { selection: EMPTY, at: undefined } }),
    ).toBe("/timeline");
  });

  it("carries the selection", () => {
    expect(
      makeTimelinePathFromView({
        view: { selection: { ...EMPTY, tags: ["a", "b"] }, at: undefined },
      }),
    ).toBe("/timeline?tags=a&tags=b");
  });

  it("carries the cursor on a later page", () => {
    expect(
      makeTimelinePathFromView({
        view: { selection: EMPTY, at: undefined },
        cursor: "abc123",
      }),
    ).toBe("/timeline?cursor=abc123");
  });
});

describe("makeRailPathFromSelection", () => {
  it("never sends a limit or a cursor, which the route rejects", () => {
    const path = makeRailPathFromSelection({ ...EMPTY, people: ["p"] });
    expect(path).toBe("/timeline/rail?people=p");
    expect(path).not.toContain("limit");
    expect(path).not.toContain("cursor");
  });
});

describe("getArchiveTotalsFromRail", () => {
  const days: readonly RailDay[] = [
    {
      capturedOn: "2026-09-27",
      itemCount: 340,
      photoCount: 340,
      videoCount: 0,
    },
    { capturedOn: "2026-09-22", itemCount: 0, photoCount: 0, videoCount: 0 },
    { capturedOn: "2026-07-04", itemCount: 4, photoCount: 4, videoCount: 0 },
  ];

  it("sums the items, counts the days and finds the first", () => {
    expect(getArchiveTotalsFromRail(days)).toEqual({
      itemTotal: 344,
      dayCount: 3,
      firstCapturedOn: "2026-07-04",
    });
  });

  it("counts a milestone-only day as a day, because it is jumpable", () => {
    expect(getArchiveTotalsFromRail(days).dayCount).toBe(3);
  });

  it("answers zero and no first day for an archive with nothing in it", () => {
    const totals = getArchiveTotalsFromRail([]);
    expect(totals).toEqual({
      itemTotal: 0,
      dayCount: 0,
      firstCapturedOn: undefined,
    });
    expect(totals.firstCapturedOn).toBeUndefined();
  });
});

describe("member-scoped attachment timeline", () => {
  it("pins the attachment picker URL", () => {
    const MILESTONE_ID = "018f0000-0000-7000-8000-000000008001";
    expect(
      makeTimelinePathFromView({
        view: {
          selection: {
            ...EMPTY,
            attachedToMilestoneId: MILESTONE_ID,
            excludeAttached: true,
          },
          at: undefined,
        },
      }),
    ).toBe(
      `/timeline?attachedToMilestoneId=${MILESTONE_ID}&excludeAttached=true`,
    );
  });
  it("separates members and attachment selections while preserving ordinary keys", () => {
    const view = { selection: EMPTY, at: undefined };
    expect(makeTimelineQueryOptionsFromView({ view }).queryKey).toEqual([
      "timeline",
      "",
    ]);
    expect(
      makeTimelineQueryOptionsFromView({ view, memberId: "one" }).queryKey,
    ).not.toEqual(
      makeTimelineQueryOptionsFromView({ view, memberId: "two" }).queryKey,
    );
    const attached = {
      selection: { ...EMPTY, attachedToMilestoneId: "id" },
      at: undefined,
    };
    expect(
      makeTimelineQueryOptionsFromView({
        view: attached,
        memberId: "one",
      }).queryKey,
    ).not.toEqual(
      makeTimelineQueryOptionsFromView({ view, memberId: "one" }).queryKey,
    );
    expect(
      makeTimelineQueryOptionsFromView({
        view: attached,
        memberId: "one",
      }).queryKey,
    ).not.toEqual(
      makeTimelineQueryOptionsFromView({
        view: {
          ...attached,
          selection: { ...attached.selection, excludeAttached: true },
        },
        memberId: "one",
      }).queryKey,
    );
  });
});
