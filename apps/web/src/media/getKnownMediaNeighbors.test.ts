import type {
  TimelineSelection,
  MediaNeighborsRequest,
  MediaNeighborsResponse,
  TimelineResponse,
} from "@memory-shoebox/shared";
import { makeTimelineQueryOptionsFromView } from "@/api/timelineHelpers/timelineHelpers";
import { makeBurst, makeDay } from "@/surfaces/Timeline/timelineFixtureHelpers";
import {
  makeFrameIdFromPosition,
  makeItemDetail,
} from "@/testing/itemFixtureHelpers";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createMediaLoadingResources } from "./createMediaLoadingResources/createMediaLoadingResources";
import { createMediaLoadingLifetime } from "./createMediaLoadingResources/createMediaLoadingLifetime";
import { readMediaNeighborsFromKnownQueries } from "./readMediaNeighborsFromKnownQueries";
import type { MockInstance } from "vitest";
import type { TimelineQueryPage } from "@/api/timelineHelpers/timelineHelpers";

type KnownNeighborsFixture = {
  queryClient: QueryClient;
  resources: ReturnType<typeof createMediaLoadingResources>;
  fallback: MockInstance<
    ReturnType<typeof createMediaLoadingResources>["readNeighbors"]
  >;
  renew: MockInstance<
    ReturnType<typeof createMediaLoadingResources>["readPreviews"]
  >;
  request: MediaNeighborsRequest;
  key: ReturnType<typeof makeTimelineQueryOptionsFromView>["queryKey"];
  page: TimelineQueryPage;
};

const SELECTION = { tags: [], people: [] } satisfies TimelineSelection;
const items = [1, 2, 3, 4].map((position) => {
  const detail = makeItemDetail({ itemId: makeFrameIdFromPosition(position) });
  return {
    ...detail,
    media: {
      ...detail.media,
      thumb: { ...detail.media.thumb!, expiresAt: "2099-01-01T00:00:00Z" },
      display: { ...detail.media.display!, expiresAt: "2099-01-01T00:00:00Z" },
      displayCandidates: [],
    },
  };
});
function _setup(): KnownNeighborsFixture {
  const queryClient = new QueryClient();
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
  });
  const fallback = vi
    .spyOn(resources, "readNeighbors")
    .mockResolvedValue({ ahead: [], behind: [] });
  const renew = vi.spyOn(resources, "readPreviews").mockResolvedValue([]);
  const request: MediaNeighborsRequest = {
    itemId: items[1]!.itemId,
    selection: SELECTION,
    direction: "next" as const,
  };
  const key = makeTimelineQueryOptionsFromView({
    memberId: "member",
    view: { selection: SELECTION, at: undefined },
  }).queryKey;
  const page = {
    selectionResultCount: undefined,
    previousCursor: null,
    metadataUpdatedAt: Date.now(),
    days: [makeDay({ items })],
    nextCursor: null,
    resultCount: null,
  };
  queryClient.setQueryData(key, { pages: [page], pageParams: [undefined] });
  return { queryClient, resources, fallback, renew, request, key, page };
}
describe("known media neighborhood consumption", () => {
  it("uses sufficient retained member/selection refs without another neighbor or preview read", async () => {
    const test = _setup();
    const result = await readMediaNeighborsFromKnownQueries(test);
    expect(
      result.ahead.map((item) => {
        return item.itemId;
      }),
    ).toEqual([items[2]!.itemId, items[3]!.itemId]);
    expect(
      result.behind.map((item) => {
        return item.itemId;
      }),
    ).toEqual([items[0]!.itemId]);
    expect(test.fallback).not.toHaveBeenCalled();
    expect(test.renew).not.toHaveBeenCalled();
  });
  it("matches canonical selection IDs despite ordering and duplicates", async () => {
    const test = _setup();
    test.queryClient.removeQueries({ queryKey: test.key });
    const firstTag = makeFrameIdFromPosition(8);
    const secondTag = makeFrameIdFromPosition(9);
    const key = makeTimelineQueryOptionsFromView({
      memberId: "member",
      view: {
        at: undefined,
        selection: { tags: [secondTag, firstTag, secondTag], people: [] },
      },
    }).queryKey;
    test.queryClient.setQueryData(key, {
      pages: [test.page],
      pageParams: [undefined],
    });
    test.request.selection = { tags: [firstTag, secondTag], people: [] };
    await readMediaNeighborsFromKnownQueries(test);
    expect(test.fallback).not.toHaveBeenCalled();
  });
  it.each([
    "burst",
    "gap",
    "evicted",
    "member",
    "selection",
    "jump",
    "invalidated",
    "old",
  ])("falls back for %s uncertainty", async (reason) => {
    const test = _setup();
    if (reason === "burst") {
      test.queryClient.setQueryData(test.key, {
        pages: [
          {
            ...test.page,
            days: [
              makeDay({
                items: [
                  items[0]!,
                  items[1]!,
                  { ...items[2]!, burst: makeBurst() },
                  items[3]!,
                ],
              }),
            ],
          },
        ],
        pageParams: [undefined],
      });
    }
    if (reason === "gap") {
      test.queryClient.setQueryData(test.key, {
        pages: [
          {
            ...test.page,
            days: [makeDay({ items: items.slice(0, 2) })],
            nextCursor: "a",
          },
          {
            ...test.page,
            previousCursor: "page-1-newer",
            days: [makeDay({ items: items.slice(2) })],
          },
        ],
        pageParams: [undefined, "different"],
      });
    }
    if (reason === "evicted") {
      test.queryClient.setQueryData(test.key, {
        pages: [
          {
            ...test.page,
            previousCursor: "earlier",
            days: [makeDay({ items: items.slice(1) })],
          },
        ],
        pageParams: ["later"],
      });
    }
    if (reason === "member") {
      test.resources.memberId = "another";
    }
    if (reason === "selection") {
      test.request.selection = {
        ...SELECTION,
        tags: [makeFrameIdFromPosition(9)],
      };
    }
    if (reason === "jump") {
      Object.assign((test.request.selection = { ...SELECTION }), {
        until: "2026-09-01",
      });
    }
    if (reason === "invalidated") {
      await test.queryClient.invalidateQueries({ queryKey: test.key });
    }
    if (reason === "old") {
      test.queryClient.setQueryData(
        test.key,
        {
          pages: [{ ...test.page, metadataUpdatedAt: Date.now() - 31_000 }],
          pageParams: [undefined],
        },
        { updatedAt: Date.now() - 31_000 },
      );
    }
    await readMediaNeighborsFromKnownQueries(test);
    expect(test.fallback).toHaveBeenCalledWith(test.request);
  });
  it("does not refresh ordering authority merely by deriving another cached neighborhood", async () => {
    const test = _setup();
    test.queryClient.removeQueries({ queryKey: test.key });
    test.queryClient.setQueryData(
      [
        "timeline",
        "member",
        "item-neighbours",
        items[0]!.itemId,
        SELECTION,
        "next",
      ],
      {
        ahead: [{ ...items[1]!, width: 1600, height: 1200 }],
        behind: [],
        metadataUpdatedAt: Date.now() - 31_000,
      },
    );
    test.resources.previews.put({
      previews: [{ ...items[0]!, width: 1600, height: 1200 }],
    });
    await readMediaNeighborsFromKnownQueries(test);
    expect(test.fallback).toHaveBeenCalledWith(test.request);
  });
  it("crosses retained pages only when their opaque cursor chain matches", async () => {
    const test = _setup();
    test.queryClient.setQueryData(test.key, {
      pages: [
        {
          ...test.page,
          days: [makeDay({ items: items.slice(0, 2) })],
          nextCursor: "a",
        },
        {
          ...test.page,
          previousCursor: "page-1-newer",
          days: [makeDay({ items: items.slice(2) })],
        },
      ],
      pageParams: [undefined, "a"],
    });
    expect((await readMediaNeighborsFromKnownQueries(test)).ahead).toHaveLength(
      2,
    );
    expect(test.fallback).not.toHaveBeenCalled();
  });
  it("re-probes ordering when renewal omits a formerly visible neighbor", async () => {
    const test = _setup();
    test.queryClient.removeQueries({ queryKey: test.key });
    test.queryClient.setQueryData(
      [
        "timeline",
        "member",
        "item-neighbours",
        items[0]!.itemId,
        SELECTION,
        "next",
      ],
      { ahead: [{ ...items[1]!, width: 1600, height: 1200 }], behind: [] },
    );
    await readMediaNeighborsFromKnownQueries(test);
    expect(test.renew).toHaveBeenCalledWith({
      request: { itemIds: [items[0]!.itemId], purpose: "speculative-preview" },
    });
    expect(test.fallback).toHaveBeenCalledWith(test.request);
  });
  it("renews only stale media when exact neighboring IDs are already known", async () => {
    const test = _setup();
    const data = test.queryClient.getQueryData<InfiniteData<TimelineResponse>>(
      test.key,
    )!;
    const stale = {
      ...items[2]!,
      media: {
        ...items[2]!.media,
        display: {
          ...items[2]!.media.display!,
          expiresAt: "2000-01-01T00:00:00Z",
        },
      },
    };
    test.queryClient.setQueryData(test.key, {
      ...data,
      pages: [
        {
          ...test.page,
          days: [makeDay({ items: [items[0]!, items[1]!, stale, items[3]!] })],
        },
      ],
    });
    test.renew.mockResolvedValueOnce([
      { ...items[2]!, width: 1600, height: 1200 },
    ]);
    const result = await readMediaNeighborsFromKnownQueries(test);
    expect(test.renew).toHaveBeenCalledWith({
      request: { itemIds: [items[2]!.itemId], purpose: "speculative-preview" },
    });
    expect(test.fallback).not.toHaveBeenCalled();
    expect(result.ahead[0]?.media.display?.expiresAt).toBe(
      "2099-01-01T00:00:00Z",
    );
  });
  it("uses a fresh known neighborhood at its proven end without a new metadata read", async () => {
    const test = _setup();
    test.queryClient.removeQueries({ queryKey: test.key });
    const preview = (index: number) => {
      return { ...items[index]!, width: 1600, height: 1200 };
    };
    test.queryClient.setQueryData(
      [
        "timeline",
        "member",
        "item-neighbours",
        items[0]!.itemId,
        SELECTION,
        "next",
      ],
      { ahead: [preview(1)], behind: [] } satisfies MediaNeighborsResponse,
    );
    test.resources.previews.put({ previews: [preview(0)] });
    const result = await readMediaNeighborsFromKnownQueries(test);
    expect(result.ahead).toEqual([]);
    expect(result.behind[0]?.itemId).toBe(items[0]!.itemId);
    expect(test.fallback).not.toHaveBeenCalled();
  });
});
