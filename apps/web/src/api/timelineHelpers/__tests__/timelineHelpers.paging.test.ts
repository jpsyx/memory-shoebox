import { makeTimelineQueryOptionsFromView } from "@/api/timelineHelpers/timelineHelpers";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { makeDay, makeItem } from "@/surfaces/Timeline/timelineFixtureHelpers";
import { makeFrameIdFromPosition } from "@/testing/itemFixtureHelpers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_SELECTION as EMPTY } from "./timelineHelpersTest.constants";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bounded bidirectional timeline query", () => {
  it("retains a recovered head cursor through later cache writes", async () => {
    const client = new QueryClient();
    const options = makeTimelineQueryOptionsFromView({
      view: { selection: EMPTY, at: undefined },
    });
    const observer = new InfiniteQueryObserver(client, options);
    client.setQueryData(options.queryKey, {
      pages: [
        {
          days: [makeDay()],
          nextCursor: null,
          previousCursor: null,
          resultCount: null,
          selectionResultCount: undefined,
          metadataUpdatedAt: 1,
        },
      ],
      pageParams: ["obsolete-cursor"],
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          days: [],
          nextCursor: null,
          previousCursor: null,
          resultCount: null,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          days: [makeDay()],
          nextCursor: null,
          previousCursor: null,
          resultCount: null,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(client.getQueryData(options.queryKey)?.pageParams).toEqual([
        "obsolete-cursor",
      ]);
      await observer.refetch();
      const recovered = client.getQueryData(options.queryKey)!;
      expect(recovered.pageParams).toEqual([undefined]);
      expect(recovered.pages[0]!.selectionResultCount).toBeUndefined();
      client.setQueryData(options.queryKey, {
        ...recovered,
        pages: recovered.pages.map((page) => {
          return { ...page, metadataUpdatedAt: page.metadataUpdatedAt + 1 };
        }),
        pageParams: ["obsolete-cursor"],
      });
      expect(client.getQueryData(options.queryKey)?.pageParams).toEqual([
        undefined,
      ]);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1]![0]).toBe("/api/timeline");
    } finally {
      observer.destroy();
      client.clear();
    }
  });
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
