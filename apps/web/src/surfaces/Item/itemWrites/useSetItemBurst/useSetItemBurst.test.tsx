import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSetItemBurst } from "./useSetItemBurst";
import { itemQueryOptions } from "@/api/items/items";
import { burstFramesQueryOptions } from "@/api/burstQueryHelpers/burstQueryHelpers";
import {
  BURST_ID,
  ITEM_ID,
  makeBurstFrameFromPosition,
  makeItemDetail,
  makeFrameIdFromPosition,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedLines,
  getRecordedRequests,
  stubFetch,
} from "@/testing/fetchStubHelpers";
import {
  makeHold,
  makeQueryClientFromItemDetail,
  renderHookWithQueryClient,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";

const BURST_WRITE = `PATCH /api/items/${ITEM_ID}/burst`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("burst membership writes", () => {
  it("updates the returned item and expires sibling details without recording phantom opens", async () => {
    const detail = makeItemDetail({ canRestoreBurst: true });
    const siblingKey = itemQueryOptions(makeFrameIdFromPosition(2)).queryKey;
    const queryClient = makeQueryClientFromItemDetail();
    queryClient.setQueryData(
      siblingKey,
      makeItemDetail({ itemId: makeFrameIdFromPosition(2) }),
    );
    queryClient.setQueryData(["timeline", "member"], { oldTimeline: true });
    stubFetch({
      [BURST_WRITE]: { body: detail, status: 200 },
      [`GET /api/bursts/${BURST_ID}/frames`]: {
        body: { frames: [makeBurstFrameFromPosition(2)], nextCursor: null },
        status: 200,
      },
    });
    await queryClient.fetchQuery(burstFramesQueryOptions(BURST_ID));
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        return useSetItemBurst(ITEM_ID, "remove");
      },
      queryClient,
    });
    act(() => {
      result.current.save(() => {});
    });
    await waitForWritesToSettle(queryClient);
    expect(
      queryClient.getQueryData(itemQueryOptions(ITEM_ID).queryKey),
    ).toEqual(detail);
    expect(queryClient.getQueryState(siblingKey)?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(["timeline", "member"])?.isInvalidated,
    ).toBe(true);
    expect(getRecordedLines()).toEqual([
      `GET /api/bursts/${BURST_ID}/frames`,
      BURST_WRITE,
      `GET /api/bursts/${BURST_ID}/frames`,
    ]);
  });

  it("ignores two saves in the same render before pending state has propagated", async () => {
    const { hold, letGo } = makeHold();
    const queryClient = makeQueryClientFromItemDetail();
    stubFetch({
      [BURST_WRITE]: { body: makeItemDetail(), status: 200, waitFor: hold },
    });
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        return useSetItemBurst(ITEM_ID, "restore");
      },
      queryClient,
    });
    act(() => {
      result.current.save(() => {});
      result.current.save(() => {});
    });
    await act(async () => {
      letGo();
    });
    await waitForWritesToSettle(queryClient);
    expect(getRecordedRequests()).toEqual([
      {
        url: `/api/items/${ITEM_ID}/burst`,
        method: "PATCH",
        body: { action: "restore" },
      },
    ]);
  });
});
