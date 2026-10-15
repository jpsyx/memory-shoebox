import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTimelineQueryOptionsFromView } from "@/api/timeline/timeline";
import { makeDay, makeItem } from "@/surfaces/Timeline/timelineFixtures";
import { makeFrameIdFromPosition } from "@/testing/itemFixtureHelpers";
import { getKnownMediaNeighborWindowFromQueries } from "./getKnownMediaNeighborWindowFromQueries";

const selection = { tags: [], people: [] };
const items = Array.from({ length: 8 }, (_unused, index) => {
  return makeItem({ itemId: makeFrameIdFromPosition(index + 1) });
});
const options = makeTimelineQueryOptionsFromView({
  memberId: "member",
  view: { selection, at: undefined },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("retained timeline page authority", () => {
  it.each(["adjacent", "gap", "stale", "empty-boundary"])(
    "proves reverse-restored continuity only with fresh server-issued edges: %s",
    (scenario) => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      const queryClient = new QueryClient();
      const page = {
        days: [makeDay({ items: items.slice(0, 2) })],
        nextCursor: "older-1",
        previousCursor: null,
        resultCount: null,
        selectionResultCount: null,
        metadataUpdatedAt: 1_000_000,
      };
      const leading =
        scenario === "empty-boundary"
          ? { ...page, days: [], metadataUpdatedAt: 960_000 }
          : page;
      const following = {
        ...page,
        days: [
          makeDay({
            items:
              scenario === "empty-boundary"
                ? items.slice(0, 4)
                : items.slice(2, 4),
          }),
        ],
        previousCursor: scenario === "gap" ? "different" : "newer-0",
        nextCursor: null,
        metadataUpdatedAt: scenario === "stale" ? 960_000 : 1_000_000,
      };
      queryClient.setQueryData(options.queryKey, {
        pages: [leading, following],
        pageParams: ["newer-0", "newer-1"],
      });
      try {
        const window = getKnownMediaNeighborWindowFromQueries({
          queryClient,
          memberId: "member",
          request: { itemId: items[0]!.itemId, selection, direction: "next" },
        });
        if (scenario === "adjacent") {
          expect(
            window?.ahead.map((item) => {
              return item.itemId;
            }),
          ).toEqual([items[1]!.itemId, items[2]!.itemId]);
          expect(window?.behind).toEqual([]);
          expect(window?.metadataUpdatedAt).toBe(1_000_000);
        } else {
          expect(window).toBeUndefined();
        }
      } finally {
        queryClient.clear();
      }
    },
  );
  it.each([10_000, 31_000])(
    "does not renew earlier or mixed-page identities when fetchNextPage appends after %s ms",
    async (elapsed) => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      const requests: string[] = [];
      vi.stubGlobal("fetch", async (url: string) => {
        requests.push(url);
        const isFirst = url === "/api/timeline";
        return Response.json({
          previousCursor: isFirst ? null : "page-1-newer",
          days: [
            makeDay({ items: isFirst ? items.slice(0, 4) : items.slice(4) }),
          ],
          nextCursor: isFirst ? "page-2" : null,
          resultCount: null,
        });
      });
      const queryClient = new QueryClient();
      const observer = new InfiniteQueryObserver(queryClient, options);
      const getWindow = (position: number) => {
        return getKnownMediaNeighborWindowFromQueries({
          queryClient,
          memberId: "member",
          request: {
            itemId: items[position]!.itemId,
            selection,
            direction: "next",
          },
        });
      };
      try {
        await observer.refetch();
        expect(getWindow(1)?.metadataUpdatedAt).toBe(1_000_000);
        clock.mockReturnValue(1_000_000 + elapsed);
        if (elapsed > 30_000) {
          expect(getWindow(1)).toBeUndefined();
        }
        await observer.fetchNextPage();
        expect(requests).toEqual([
          "/api/timeline",
          "/api/timeline?cursor=page-2",
        ]);
        expect(queryClient.getQueryState(options.queryKey)?.dataUpdatedAt).toBe(
          1_000_000 + elapsed,
        );
        for (const position of [1, 3]) {
          expect(getWindow(position)?.metadataUpdatedAt).toBe(
            elapsed > 30_000 ? undefined : 1_000_000,
          );
        }
        expect(getWindow(5)?.metadataUpdatedAt).toBe(1_000_000 + elapsed);
      } finally {
        observer.destroy();
        queryClient.clear();
      }
    },
  );

  it("falls back when a contributing page has no original authority timestamp", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([...options.queryKey], {
      pages: [
        {
          previousCursor: null,
          days: [makeDay({ items })],
          nextCursor: null,
          resultCount: null,
        },
      ],
      pageParams: [null],
    });
    expect(
      getKnownMediaNeighborWindowFromQueries({
        queryClient,
        memberId: "member",
        request: { itemId: items[1]!.itemId, selection, direction: "next" },
      }),
    ).toBeUndefined();
    queryClient.clear();
  });

  it.each(["leading", "between", "trailing"])(
    "does not use an expired empty %s page to prove a boundary or continuity",
    (position) => {
      vi.spyOn(Date, "now").mockReturnValue(1_031_000);
      const queryClient = new QueryClient();
      const fresh = {
        selectionResultCount: null,
        previousCursor: null,
        days: [makeDay({ items: items.slice(0, 2) })],
        metadataUpdatedAt: 1_031_000,
        resultCount: null,
        nextCursor: null as string | null,
      };
      const empty = { ...fresh, days: [], metadataUpdatedAt: 1_000_000 };
      const pages =
        position === "leading"
          ? [
              { ...empty, nextCursor: "page-2" },
              { ...fresh, previousCursor: "page-1-newer" },
            ]
          : position === "trailing"
            ? [
                { ...fresh, nextCursor: "page-2" },
                { ...empty, previousCursor: "page-1-newer" },
              ]
            : [
                { ...fresh, nextCursor: "page-2" },
                {
                  ...empty,
                  nextCursor: "page-3",
                  previousCursor: "page-1-newer",
                },
                {
                  ...fresh,
                  previousCursor: "page-2-newer",
                  days: [makeDay({ items: items.slice(2, 4) })],
                },
              ];
      queryClient.setQueryData(options.queryKey, {
        pages,
        pageParams:
          position === "between"
            ? [null, "page-2", "page-3"]
            : [null, "page-2"],
      });
      expect(
        getKnownMediaNeighborWindowFromQueries({
          queryClient,
          memberId: "member",
          request: {
            itemId: items[position === "leading" ? 0 : 1]!.itemId,
            selection,
            direction: "next",
          },
        }),
      ).toBeUndefined();
      queryClient.clear();
    },
  );
});
