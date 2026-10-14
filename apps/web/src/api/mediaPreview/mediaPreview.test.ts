import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMediaPreviews, fetchMediaNeighbors } from "./mediaPreview";
import { makeItemDetail, ITEM_ID } from "@/testing/itemFixtureHelpers";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const detail = makeItemDetail();
const preview = {
  itemId: ITEM_ID,
  kind: detail.kind,
  width: detail.media.width,
  height: detail.media.height,
  media: detail.media,
};

describe("safe media API", () => {
  it("uses the bounded POST contracts and propagates cancellation", async () => {
    stubFetch({
      "POST /api/media/preview": { status: 200, body: { items: [preview] } },
      "POST /api/media/neighbors": {
        status: 200,
        body: { ahead: [preview], behind: [] },
      },
    });
    const signal = new AbortController().signal;
    const request = { itemIds: [ITEM_ID], purpose: "selected-view" as const };
    expect(await fetchMediaPreviews(request, signal)).toEqual([preview]);
    const neighbors = {
      itemId: ITEM_ID,
      direction: "previous" as const,
      selection: { tags: [], people: [] },
    };
    expect(await fetchMediaNeighbors(neighbors, signal)).toEqual({
      ahead: [preview],
      behind: [],
    });
    expect(getRecordedRequests()).toEqual([
      { method: "POST", url: "/api/media/preview", body: request },
      { method: "POST", url: "/api/media/neighbors", body: neighbors },
    ]);
    expect(
      vi.mocked(fetch).mock.calls.every(([, init]) => {
        return init?.signal === signal;
      }),
    ).toBe(true);
  });

  it("rejects malformed or oversized requests before the network and validates responses", async () => {
    stubFetch({
      "POST /api/media/preview": {
        status: 200,
        body: { items: [{ itemId: ITEM_ID }] },
      },
    });
    const signal = new AbortController().signal;
    await expect(
      fetchMediaPreviews(
        {
          itemIds: Array.from({ length: 9 }, () => {
            return ITEM_ID;
          }),
          purpose: "speculative-preview",
        },
        signal,
      ),
    ).rejects.toThrow();
    expect(getRecordedRequests()).toEqual([]);
    await expect(
      fetchMediaPreviews(
        { itemIds: [ITEM_ID], purpose: "speculative-preview" },
        signal,
      ),
    ).rejects.toThrow();
  });
});
