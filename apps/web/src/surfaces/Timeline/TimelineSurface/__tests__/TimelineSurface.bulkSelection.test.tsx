import { useTimelineSelection } from "@/surfaces/Timeline/TimelineBulkEditor/useTimelineSelection";
import {
  makeBurst,
  makeDay,
  makeItem,
} from "@/surfaces/Timeline/timelineFixtures";
import {
  makeBurstFrame,
  makeFrameIdFromPosition,
} from "@/testing/itemFixtureHelpers";
import { stubFetch } from "@/testing/fetchStubHelpers";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("timeline bulk selection boundaries", () => {
  it("ticks only the matching frames of a filtered loaded burst", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      const isFiltered =
        new URL(String(url), "https://shoebox.test").searchParams.get(
          "tags",
        ) === "holiday";
      return Response.json({
        frames: isFiltered
          ? [makeBurstFrame(2)]
          : [makeBurstFrame(1), makeBurstFrame(2)],
        nextCursor: null,
      });
    });
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => {
      return useTimelineSelection(
        [makeDay({ items: [makeItem({ burst: makeBurst() })] })],
        {
          tags: ["holiday"],
          people: [],
          from: undefined,
          until: undefined,
        },
      );
    });
    act(() => {
      result.current.tickLoaded();
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect([...result.current.selectedItemIds]).toEqual([
      "018f0000-0000-7000-8000-0000000f0002",
    ]);
  });

  it("selects a loaded photo and every frame across a burst's pages", async () => {
    const burst = makeBurst();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({ frames: [makeBurstFrame(1)], nextCursor: "tail" }),
      )
      .mockResolvedValueOnce(
        Response.json({ frames: [makeBurstFrame(2)], nextCursor: null }),
      );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => {
      return useTimelineSelection([
        makeDay({
          items: [
            makeItem(),
            makeItem({ itemId: makeFrameIdFromPosition(1), burst }),
          ],
        }),
      ]);
    });
    act(() => {
      result.current.tickLoaded();
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect([...result.current.selectedItemIds]).toEqual([
      "018f0000-0000-7000-8000-00000000a001",
      "018f0000-0000-7000-8000-0000000f0001",
      "018f0000-0000-7000-8000-0000000f0002",
    ]);
    expect(result.current.framesByBurstId.get(burst.burstId)).toHaveLength(2);
  });

  it("preserves existing ticks when one stack cannot be read", async () => {
    const burst = makeBurst();
    stubFetch({
      [`GET /api/bursts/${burst.burstId}/frames`]: {
        status: 503,
        body: { error: "unavailable", message: "Unavailable" },
      },
    });
    const { result } = renderHook(() => {
      return useTimelineSelection([makeDay({ items: [makeItem({ burst })] })]);
    });
    act(() => {
      result.current.onToggle(makeFrameIdFromPosition(8));
    });
    act(() => {
      result.current.tickLoaded();
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect([...result.current.selectedItemIds]).toEqual([
      "018f0000-0000-7000-8000-0000000f0008",
    ]);
    expect(result.current.problem).toContain("ticks are unchanged");
  });

  it("refuses an oversized loaded selection without truncating it to 500", async () => {
    const burst = makeBurst({ visibleFrameCount: 501 });
    stubFetch({
      [`GET /api/bursts/${burst.burstId}/frames`]: {
        status: 200,
        body: {
          frames: Array.from({ length: 501 }, (_, position) => {
            return makeBurstFrame(position + 1);
          }),
          nextCursor: null,
        },
      },
    });
    const { result } = renderHook(() => {
      return useTimelineSelection([makeDay({ items: [makeItem({ burst })] })]);
    });
    act(() => {
      result.current.onToggle(makeFrameIdFromPosition(8));
    });
    act(() => {
      result.current.tickLoaded();
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect([...result.current.selectedItemIds]).toEqual([
      "018f0000-0000-7000-8000-0000000f0008",
    ]);
    expect(result.current.problem).toContain("up to 500");
    expect(result.current.framesByBurstId.size).toBe(0);
  });

  it("explains the limit when an individual tick would exceed 500", () => {
    const { result } = renderHook(() => {
      return useTimelineSelection([]);
    });
    act(() => {
      for (let position = 1; position <= 500; position += 1) {
        result.current.onToggle(makeFrameIdFromPosition(position));
      }
    });
    expect(result.current.selectedItemIds.size).toBe(500);
    act(() => {
      result.current.onToggle(makeFrameIdFromPosition(501));
    });
    expect(result.current.selectedItemIds.size).toBe(500);
    expect(
      result.current.selectedItemIds.has(makeFrameIdFromPosition(501)),
    ).toBe(false);
    expect(result.current.problem).toEqual(expect.stringContaining("500"));
  });
});
