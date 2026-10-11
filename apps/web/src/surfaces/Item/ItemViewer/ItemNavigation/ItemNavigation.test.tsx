import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
function _respond(routes: Record<string, Answer> = {}): void {
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
      "GET /api/timeline/rail": {
        status: 200,
        body: {
          days: [{ capturedOn: FIRST.capturedOn, itemCount: 3 }],
          nextCursor: null,
        },
      },
      ...routes,
    },
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
  it("refreshes neighbours when a same-day capture-time edit reorders the current photo", async () => {
    _respond();
    const { router } = renderItem(FIRST.itemId);
    await _ready();
    const changed = { ...FIRST, capturedAt: "2026-09-14T12:00:00.000Z" };
    _respond({
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
    });
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
    const dayReads = recordedUrls().filter((url) => {
      return (
        url.startsWith("/api/timeline?") && url.includes("from=2026-09-14")
      );
    });
    expect(dayReads.length).toBeGreaterThan(0);
    dayReads.forEach((url) => {
      const search = new URL(url, "http://localhost").searchParams;
      expect(search.get("tags")).toBe(tag);
      expect(search.get("people")).toBe(person);
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
    _respond({
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
      [`GET /api/items/${burstLast.itemId}`]: { status: 200, body: burstLast },
    });
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
    _respond({
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
            { capturedOn: FIRST.capturedOn, itemCount: 1 },
            { capturedOn: "2026-09-13", itemCount: 0 },
            { capturedOn: "2026-09-12", itemCount: 2 },
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
      [`GET /api/items/${burstLast.itemId}`]: { status: 200, body: burstLast },
    });
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
      "GET /api/timeline": {
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

  it("abandons a delayed stack move after leaving the viewer", async () => {
    const hold = makeHold();
    const burst = makeBurstDetail({ position: 11, frameCount: 12 });
    _respond({
      "GET /api/timeline": {
        status: 200,
        body: {
          days: [
            makeDay({ capturedOn: FIRST.capturedOn, items: [FIRST, burst] }),
          ],
          nextCursor: null,
          resultCount: null,
        },
      },
      [`GET /api/bursts/${burst.burst!.burstId}/frames`]: {
        status: 200,
        body: { frames: [makeBurstFrame(11)], nextCursor: null },
        waitFor: hold.hold,
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await userEvent.click(await _ready());
    await waitFor(() => {
      expect(recordedUrls()).toContain(
        `/api/bursts/${burst.burst!.burstId}/frames`,
      );
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
    expect(recordedUrls()).not.toContain(`/api/items/${burst.itemId}`);
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
