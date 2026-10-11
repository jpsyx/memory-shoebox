import { BURST_ID, makeBurstFrame } from "@/testing/itemFixtureHelpers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getBurstFramesForSelection } from "./getBurstFramesForSelection";

afterEach(() => {
  vi.unstubAllGlobals();
});

function _response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getBurstFramesForSelection", () => {
  it("preserves every active timeline filter on all cursor pages", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        _response({ frames: [makeBurstFrame(1)], nextCursor: "tail" }),
      )
      .mockResolvedValueOnce(
        _response({ frames: [makeBurstFrame(2)], nextCursor: null }),
      );
    vi.stubGlobal("fetch", fetch);
    await getBurstFramesForSelection(BURST_ID, {
      tags: ["tag-one", "tag-two"],
      people: ["person-one", "person-two"],
      from: "2026-09-01",
      until: "2026-09-30",
    });
    expect(
      fetch.mock.calls.map(([url]) => {
        return url;
      }),
    ).toEqual([
      `/api/bursts/${BURST_ID}/frames?tags=tag-one&tags=tag-two&people=person-one&people=person-two&from=2026-09-01&until=2026-09-30`,
      `/api/bursts/${BURST_ID}/frames?tags=tag-one&tags=tag-two&people=person-one&people=person-two&from=2026-09-01&until=2026-09-30&cursor=tail`,
    ]);
  });

  it("includes every frame from later pages and encodes opaque cursors", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        _response({ frames: [makeBurstFrame(1)], nextCursor: "next/+=" }),
      )
      .mockResolvedValueOnce(
        _response({
          frames: [makeBurstFrame(2), makeBurstFrame(3)],
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(getBurstFramesForSelection(BURST_ID)).resolves.toEqual([
      makeBurstFrame(1),
      makeBurstFrame(2),
      makeBurstFrame(3),
    ]);
    expect(
      fetch.mock.calls.map(([url]) => {
        return url;
      }),
    ).toEqual([
      `/api/bursts/${BURST_ID}/frames`,
      `/api/bursts/${BURST_ID}/frames?cursor=next%2F%2B%3D`,
    ]);
  });

  it("rejects repeated cursors without continuing a page loop", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        _response({ frames: [makeBurstFrame(1)], nextCursor: "repeat" }),
      )
      .mockResolvedValueOnce(
        _response({ frames: [makeBurstFrame(2)], nextCursor: "repeat" }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(getBurstFramesForSelection(BURST_ID)).rejects.toThrow(
      "repeated a page",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a later page failure instead of returning a partial selection", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        _response({ frames: [makeBurstFrame(1)], nextCursor: "tail" }),
      )
      .mockResolvedValueOnce(
        _response({ error: "unavailable", message: "Stack unavailable" }, 503),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(getBurstFramesForSelection(BURST_ID)).rejects.toThrow(
      "Stack unavailable",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
