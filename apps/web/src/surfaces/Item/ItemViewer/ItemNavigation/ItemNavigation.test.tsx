import { makeTimelineQueryOptionsFromView } from "@/api/timeline/timeline";
import { createMeResponse } from "@/testing/createMeResponse";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import { makeDay } from "@/surfaces/Timeline/timelineFixtures";
import {
  makeItemDetail,
  makeVideoDetail,
  makeFrameIdFromPosition,
  makeBurstDetail,
  makeBurstFrame,
} from "@/testing/itemFixtureHelpers";
import {
  renderItem,
  respondWithItem,
  recordedUrls,
} from "@/testing/itemHarnessHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import { renderAt, type Answer } from "@/testing/surfaceHarness";
import { itemQueryOptions } from "@/api/items/items";
import { markPileStale } from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";

const FIRST = makeItemDetail({ itemId: makeFrameIdFromPosition(1) });
const MIDDLE = makeVideoDetail({ itemId: makeFrameIdFromPosition(2) });
const LAST = makeItemDetail({ itemId: makeFrameIdFromPosition(3) });

/** Three mixed media items in the exact order supplied by the timeline. */
function _respond(
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

/** Wait for the navigation's passive reads, without opening any other item. */
async function _ready(): Promise<HTMLElement> {
  const nextButton = await screen.findByRole("button", {
    name: "Next photo or video",
  });
  await waitFor(() => {
    expect(nextButton).not.toHaveAttribute("aria-disabled", "true");
  });
  return nextButton;
}

describe("viewer navigation", () => {
  it("navigates using sufficient retained timeline refs without another neighborhood read", async () => {
    _respond({}, [FIRST, LAST]);
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
            metadataUpdatedAt: Date.now(),
            days: [makeDay({ items: freshItems })],
            nextCursor: null,
            resultCount: null,
          },
        ],
        pageParams: [null],
      },
    );
    await userEvent.click(await _ready());
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

  it("revalidates reused neighborhood authority on a later route mount", async () => {
    _respond({}, [FIRST, LAST]);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const { router } = renderItem(FIRST.itemId);
      const queryClient = router.options.context!.queryClient;
      queryClient.setDefaultOptions({
        queries: { retry: false, staleTime: 30_000 },
      });
      const key = makeTimelineQueryOptionsFromView({
        memberId: createMeResponse().me.member.memberId,
        view: { selection: { tags: [], people: [] }, at: undefined },
      }).queryKey;
      const freshItems = [FIRST, LAST].map((item) => {
        return {
          ...item,
          media: {
            ...item.media,
            displayCandidates: [],
            thumb: { ...item.media.thumb!, expiresAt: "2099-01-01T00:00:00Z" },
            display: {
              ...item.media.display!,
              expiresAt: "2099-01-01T00:00:00Z",
            },
          },
        };
      });
      queryClient.setQueryData(
        key,
        {
          pages: [
            {
              metadataUpdatedAt: now - 29_000,
              days: [makeDay({ items: freshItems })],
              nextCursor: null,
              resultCount: null,
            },
          ],
          pageParams: [null],
        },
        { updatedAt: now - 29_000 },
      );
      const next = await _ready();
      expect(recordedUrls()).not.toContain("/api/media/neighbors");
      clock.mockReturnValue(now + 2_000);
      await userEvent.click(next);
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Previous photo or video" }),
        ).not.toHaveAttribute("aria-disabled", "true");
      });
      await act(async () => {
        await router.navigate({
          to: "/items/$itemId",
          params: { itemId: FIRST.itemId },
        });
      });
      await _ready();
      expect(
        getRecordedRequests()
          .filter((request) => {
            return request.url === "/api/media/neighbors";
          })
          .map((request) => {
            return request.body;
          }),
      ).toContainEqual({
        itemId: FIRST.itemId,
        selection: { tags: [], people: [] },
        direction: "next",
      });
    } finally {
      clock.mockRestore();
    }
  });

  it("shows only selected media while pending detail keeps mutations inert", async () => {
    const hold = makeHold();
    _respond(
      {
        [`GET /api/items/${LAST.itemId}`]: {
          status: 200,
          body: LAST,
          waitFor: hold.hold,
        },
      },
      [FIRST, LAST],
    );
    const { container } = renderItem(FIRST.itemId);
    await userEvent.click(await _ready());
    await waitFor(() => {
      expect(
        container.querySelector('[data-photo-surface="viewer"]'),
      ).toHaveAttribute("data-photo-item", LAST.itemId);
    });
    expect(
      container.querySelector(`[data-photo-item="${FIRST.itemId}"]`),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "React: Love" }).closest("[inert]"),
    ).not.toBeNull();
    expect(
      recordedUrls().filter((url) => {
        return /^\/api\/items\/[^/]+$/.test(url);
      }),
    ).toEqual([`/api/items/${FIRST.itemId}`, `/api/items/${LAST.itemId}`]);
    hold.letGo();
  });

  it("refreshes neighbours when a same-day capture-time edit reorders the current photo", async () => {
    _respond();
    const { router } = renderItem(FIRST.itemId);
    await _ready();
    const changed = { ...FIRST, capturedAt: "2026-09-14T12:00:00.000Z" };
    _respond(
      {
        "GET /api/timeline": {
          status: 200,
          body: {
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

  it("preserves the timeline filters across moves and returns to that timeline with Back", async () => {
    _respond();
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
    await userEvent.click(await _ready());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    });
    await _ready();
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

  it("enters the last frame when moving backward into a stack", async () => {
    const burstFirst = makeBurstDetail({ position: 11, frameCount: 12 });
    const burstLast = makeBurstDetail({ position: 12, frameCount: 12 });
    _respond(
      {
        "GET /api/timeline": {
          status: 200,
          body: {
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
    _respond(
      {
        "GET /api/timeline": {
          status: 200,
          body: {
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
    const nextButton = await _ready();
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
    await userEvent.click(await _ready());
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
    await _ready();
    await userEvent.keyboard("h");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
    });
  });

  it("clicks from photo to video and back without adding history entries or preloading opens", async () => {
    _respond();
    const { router } = renderItem(FIRST.itemId);
    const nextButton = await _ready();
    expect(
      recordedUrls().filter((url) => {
        return /^\/api\/items\/[^/]+$/.test(url);
      }),
    ).toEqual([`/api/items/${FIRST.itemId}`]);
    expect(
      recordedUrls().filter((url) => {
        return url.startsWith("/api/timeline") || url.includes("/bursts/");
      }),
    ).toEqual([]);
    const historyLength = router.history.length;
    await userEvent.click(nextButton);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    });
    await _ready();
    expect(screen.getByLabelText("Video player")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Previous photo or video" }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
    });
    expect(router.history.length).toBe(historyLength);
  });

  it.each([
    ["{ArrowRight}", LAST.itemId],
    ["l", LAST.itemId],
    ["{ArrowLeft}", FIRST.itemId],
    ["h", FIRST.itemId],
  ])("navigates with %s", async (key, expectedId) => {
    _respond();
    const { router } = renderItem(MIDDLE.itemId);
    await _ready();
    await userEvent.keyboard(key);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${expectedId}`);
    });
  });

  it("stops at the first and last item without wrapping", async () => {
    _respond();
    const { router } = renderItem(FIRST.itemId);
    await _ready();
    expect(
      screen.getByRole("button", { name: "Previous photo or video" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("h{ArrowLeft}");
    expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
    await userEvent.keyboard("l");
    await _ready();
    await userEvent.keyboard("l");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${LAST.itemId}`);
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Next photo or video" }),
      ).toHaveAttribute("aria-disabled", "true");
    });
    await userEvent.keyboard("l{ArrowRight}");
    expect(router.state.location.pathname).toBe(`/items/${LAST.itemId}`);
  });

  it("leaves typing, video controls, modified keys, and composition alone", async () => {
    _respond();
    const { router } = renderItem(MIDDLE.itemId);
    await _ready();
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard("hello{ArrowLeft}{ArrowRight}");
    expect(screen.getByRole("textbox")).toHaveValue("hello");
    fireEvent.keyDown(screen.getByLabelText("Video player"), {
      key: "ArrowRight",
    });
    fireEvent.keyDown(document.body, { key: "l", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "h", metaKey: true });
    fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });
    fireEvent.keyDown(document.body, { key: "l", isComposing: true });
    expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    await userEvent.click(
      screen.getByRole("button", { name: "More video details" }),
    );
    await screen.findByRole("dialog");
    await userEvent.keyboard("hl{ArrowLeft}{ArrowRight}");
    expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
  });

  it("retries a failed neighbour read without counting another item open", async () => {
    _respond({
      "POST /api/media/neighbors": {
        status: 503,
        body: { error: "unavailable", message: "Unavailable" },
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await screen.findByRole("button", { name: "Retry navigation" });
    _respond();
    await userEvent.click(
      screen.getByRole("button", { name: "Retry navigation" }),
    );
    await _ready();
    expect(
      recordedUrls().filter((url) => {
        return /^\/api\/items\/[^/]+$/.test(url);
      }),
    ).toEqual([]);
    expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
  });

  it("abandons a delayed neighbor read after leaving the viewer", async () => {
    const hold = makeHold();
    _respond({
      "POST /api/media/neighbors": {
        status: 200,
        body: { ahead: [], behind: [] },
        waitFor: hold.hold,
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await waitFor(() => {
      expect(recordedUrls()).toContain("/api/media/neighbors");
    });
    await userEvent.click(screen.getByRole("link", { name: /Back to/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    await act(async () => {
      hold.letGo();
      await hold.hold;
    });
    expect(router.state.location.pathname).toBe("/");
    expect(recordedUrls()).not.toContain(`/api/items/${MIDDLE.itemId}`);
  });

  it("ignores another move while the destination is loading", async () => {
    const hold = makeHold();
    _respond({
      [`GET /api/items/${MIDDLE.itemId}`]: {
        status: 200,
        body: MIDDLE,
        waitFor: hold.hold,
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await userEvent.click(await _ready());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    });
    await userEvent.keyboard("hl{ArrowRight}{ArrowLeft}");
    expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    hold.letGo();
    await _ready();
  });
});

describe("safe viewer intent", () => {
  it("warms backward after selecting an earlier sibling link", async () => {
    const detail = makeBurstDetail({ position: 2, frameCount: 3 });
    const target = makeBurstDetail({ position: 1, frameCount: 3 });
    _respond(
      {
        [`GET /api/items/${detail.itemId}`]: { status: 200, body: detail },
        [`GET /api/items/${target.itemId}`]: { status: 200, body: target },
      },
      [target, detail],
    );
    const { router } = renderItem(detail.itemId);
    await userEvent.click(
      await screen.findByRole("link", { name: "Photo 1 of 3" }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${target.itemId}`);
      expect(
        router.options
          .context!.queryClient.getQueryCache()
          .getAll()
          .some((query) => {
            return (
              query.queryKey[2] === "item-neighbours" &&
              query.queryKey[3] === target.itemId &&
              query.queryKey.at(-1) === "previous" &&
              query.state.status === "success"
            );
          }),
      ).toBe(true);
    });
  });
  it("warms a focused and hovered sibling without any ordinary detail read", async () => {
    const detail = makeBurstDetail({ position: 1, frameCount: 3 });
    const target = makeBurstDetail({ position: 2, frameCount: 3 });
    respondWithItem({
      detail,
      routes: {
        "POST /api/media/preview": {
          status: 200,
          body: {
            items: [
              {
                itemId: target.itemId,
                kind: target.kind,
                width: target.media.width,
                height: target.media.height,
                media: {
                  ...target.media,
                  display: {
                    ...target.media.display!,
                    expiresAt: "2099-01-01T00:00:00Z",
                  },
                },
              },
            ],
          },
        },
      },
    });
    renderItem(detail.itemId);
    const sibling = await screen.findByRole("link", { name: "Photo 2 of 3" });
    fireEvent.pointerEnter(sibling);
    fireEvent.focus(sibling);
    fireEvent.touchStart(sibling);
    await waitFor(() => {
      expect(
        getRecordedRequests().filter((request) => {
          return request.url === "/api/media/preview";
        }),
      ).toHaveLength(1);
    });
    expect(
      getRecordedRequests().filter((request) => {
        return request.url === "/api/media/preview";
      })[0]!.body,
    ).toEqual({ itemIds: [target.itemId], purpose: "speculative-preview" });
    expect(
      recordedUrls().filter((url) => {
        return /^\/api\/items\/[^/]+$/.test(url);
      }),
    ).toEqual([`/api/items/${detail.itemId}`]);
  });
});
