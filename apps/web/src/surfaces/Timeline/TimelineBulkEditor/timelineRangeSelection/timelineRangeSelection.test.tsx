import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  makeBurst,
  makeDay,
  makeItem,
} from "@/surfaces/Timeline/timelineFixtureHelpers";
import { makeBurstFrameFromPosition } from "@/testing/itemFixtureHelpers";
import { useTimelineSelection } from "../useTimelineSelection";

const days = [
  makeDay({
    items: ["a", "b", "c", "d", "e", "z"].map((itemId) => {
      return makeItem({ itemId });
    }),
  }),
];
afterEach(() => {
  return vi.unstubAllGlobals();
});

it("keeps prior ticks and unions every Shift range from the first Shift anchor", async () => {
  const { result } = renderHook(() => {
    return useTimelineSelection(days);
  });
  act(() => {
    result.current.onToggle("z");
    result.current.onSelect({ kind: "item", itemId: "b" }, { shiftKey: true });
    result.current.onSelect({ kind: "item", itemId: "e" }, { shiftKey: true });
    result.current.onSelect({ kind: "item", itemId: "c" }, { shiftKey: true });
  });
  await waitFor(() => {
    return expect(result.current.selectedItemIds).toEqual(
      new Set(["z", "b", "c", "d", "e"]),
    );
  });
  act(() => {
    return result.current.onSelect(
      { kind: "item", itemId: "d" },
      { shiftKey: false },
    );
  });
  act(() => {
    return result.current.onSelect(
      { kind: "item", itemId: "a" },
      { shiftKey: true },
    );
  });
  await waitFor(() => {
    return expect(result.current.selectedItemIds).toEqual(
      new Set(["z", "a", "b", "c", "e"]),
    );
  });
});

it("adds an already selected anchor and supports reverse endpoints", async () => {
  const { result } = renderHook(() => {
    return useTimelineSelection(days);
  });
  act(() => {
    result.current.onToggle("e");
    result.current.onSelect({ kind: "item", itemId: "e" }, { shiftKey: true });
    result.current.onSelect({ kind: "item", itemId: "b" }, { shiftKey: true });
  });
  await waitFor(() => {
    return expect(result.current.selectedItemIds).toEqual(
      new Set(["b", "c", "d", "e"]),
    );
  });
});

it("includes paginated collapsed bursts and stops at an expanded endpoint", async () => {
  const burst = makeBurst();
  const frames = [1, 2, 3].map(makeBurstFrameFromPosition);
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    return Response.json(
      String(url).includes("cursor=")
        ? { frames: frames.slice(1), nextCursor: null }
        : { frames: frames.slice(0, 1), nextCursor: "tail" },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => {
    return useTimelineSelection([
      makeDay({
        items: [
          makeItem({ itemId: "a" }),
          makeItem({ burst }),
          makeItem({ itemId: "z" }),
        ],
      }),
    ]);
  });
  act(() => {
    result.current.onSelect({ kind: "item", itemId: "a" }, { shiftKey: true });
    result.current.onSelect(
      { kind: "burst", burstId: burst.burstId },
      { shiftKey: true },
    );
  });
  await waitFor(() => {
    return expect(result.current.selectedItemIds).toEqual(
      new Set([
        "a",
        ...frames.map((f) => {
          return f.itemId;
        }),
      ]),
    );
  });
  act(() => {
    return result.current.clear();
  });
  act(() => {
    result.current.onSelect({ kind: "item", itemId: "a" }, { shiftKey: true });
    result.current.onSelect(
      { kind: "item", itemId: frames[1]!.itemId },
      { shiftKey: true },
    );
  });
  await waitFor(() => {
    return expect(result.current.selectedItemIds).toEqual(
      new Set(["a", frames[0]!.itemId, frames[1]!.itemId]),
    );
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(["plain", "finish", "clear", "filter"] as const)(
  "discards stale range completion after %s",
  async (operation) => {
    const burst = makeBurst();
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const { result, rerender } = renderHook(
      ({ tag }) => {
        return useTimelineSelection(
          [
            makeDay({
              items: [makeItem({ itemId: "a" }), makeItem({ burst })],
            }),
          ],
          { tags: [tag], people: [], from: undefined, until: undefined },
        );
      },
      { initialProps: { tag: "first" } },
    );
    act(() => {
      result.current.onSelect(
        { kind: "item", itemId: "a" },
        { shiftKey: true },
      );
      result.current.onSelect(
        { kind: "burst", burstId: burst.burstId },
        { shiftKey: true },
      );
    });
    await waitFor(() => {
      return expect(finish).toBeTypeOf("function");
    });
    act(() => {
      if (operation === "plain") {
        result.current.onToggle("z");
      }
      if (operation === "finish") {
        result.current.finish();
      }
      if (operation === "clear") {
        result.current.clear();
      }
      if (operation === "filter") {
        rerender({ tag: "second" });
      }
    });
    await act(async () => {
      finish(
        Response.json({
          frames: [makeBurstFrameFromPosition(1)],
          nextCursor: null,
        }),
      );
    });
    expect(
      result.current.selectedItemIds.has(makeBurstFrameFromPosition(1).itemId),
    ).toBe(false);
    expect(result.current.isLoading).toBe(false);
  },
);

it("selects and deselects a full burst without changing unrelated ticks", async () => {
  const burst = makeBurst();
  const frame = makeBurstFrameFromPosition(1);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json({ frames: [frame], nextCursor: null });
    }),
  );
  const { result } = renderHook(() => {
    return useTimelineSelection([makeDay({ items: [makeItem({ burst })] })]);
  });
  act(() => {
    result.current.onToggle("z");
    result.current.onSelectBurst(burst.burstId);
  });
  await waitFor(() => {
    return expect(result.current.selectedItemIds).toEqual(
      new Set(["z", frame.itemId]),
    );
  });
  act(() => {
    return result.current.onDeselectBurst(burst.burstId);
  });
  await waitFor(() => {
    return expect(result.current.selectedItemIds).toEqual(new Set(["z"]));
  });
});

it("validates the union with old ticks and never truncates an oversized burst", async () => {
  const burst = makeBurst();
  const frames = Array.from({ length: 500 }, (_, index) => {
    return makeBurstFrameFromPosition(index + 1);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json({ frames, nextCursor: null });
    }),
  );
  const { result } = renderHook(() => {
    return useTimelineSelection([makeDay({ items: [makeItem({ burst })] })]);
  });
  act(() => {
    result.current.onToggle("outside");
    result.current.onSelectBurst(burst.burstId);
  });
  await waitFor(() => {
    return expect(result.current.isLoading).toBe(false);
  });
  expect(result.current.selectedItemIds).toEqual(new Set(["outside"]));
  expect(result.current.problem).toContain("500");
  act(() => {
    result.current.onToggle("outside");
    result.current.onSelectBurst(burst.burstId);
  });
  await waitFor(() => {
    return expect(result.current.selectedItemIds.size).toBe(500);
  });
  act(() => {
    return result.current.onSelectBurst(burst.burstId);
  });
  await waitFor(() => {
    return expect(result.current.isLoading).toBe(false);
  });
  expect(result.current.selectedItemIds.size).toBe(500);
});

it("uses logical cross-day order without fetching unrelated bursts", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => {
    return useTimelineSelection([
      makeDay({
        items: [makeItem({ burst: makeBurst() }), makeItem({ itemId: "a" })],
      }),
      makeDay({
        items: [makeItem({ itemId: "b" }), makeItem({ itemId: "c" })],
      }),
    ]);
  });
  act(() => {
    result.current.onSelect({ kind: "item", itemId: "c" }, { shiftKey: true });
    result.current.onSelect({ kind: "item", itemId: "a" }, { shiftKey: true });
  });
  await waitFor(() => {
    return expect(result.current.selectedItemIds).toEqual(
      new Set(["a", "b", "c"]),
    );
  });
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["select", "open"] as const)(
  "keeps pending burst %s when a standalone photo is ticked",
  async (operation) => {
    const burst = makeBurst();
    const frame = makeBurstFrameFromPosition(1);
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const { result } = renderHook(() => {
      return useTimelineSelection([
        makeDay({
          items: [makeItem({ burst }), makeItem({ itemId: "outside" })],
        }),
      ]);
    });
    act(() => {
      result.current.start();
      if (operation === "select") {
        result.current.onSelectBurst(burst.burstId);
      } else {
        result.current.onOpenBurst(burst.burstId);
      }
    });
    await waitFor(() => {
      expect(finish).toBeTypeOf("function");
    });
    act(() => {
      result.current.onToggle("outside");
    });
    await act(async () => {
      finish(Response.json({ frames: [frame], nextCursor: null }));
    });
    expect(result.current.framesByBurstId.get(burst.burstId)).toEqual([frame]);
    expect(result.current.selectedItemIds).toEqual(
      new Set(operation === "select" ? ["outside", frame.itemId] : ["outside"]),
    );
    expect(result.current.isLoading).toBe(false);
  },
);

it("starts a full-burst command without waiting for an abandoned range request", async () => {
  const burst = makeBurst();
  const frame = makeBurstFrameFromPosition(1);
  const finishes: Array<(value: Response) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      return new Promise<Response>((resolve) => {
        finishes.push(resolve);
      });
    }),
  );
  const { result } = renderHook(() => {
    return useTimelineSelection([makeDay({ items: [makeItem({ burst })] })]);
  });
  act(() => {
    result.current.onSelect(
      { kind: "burst", burstId: burst.burstId },
      { shiftKey: true },
    );
  });
  await waitFor(() => {
    expect(finishes).toHaveLength(1);
  });
  act(() => {
    result.current.onToggle("outside");
    result.current.onSelectBurst(burst.burstId);
  });
  await waitFor(() => {
    expect(finishes).toHaveLength(2);
  });
  await act(async () => {
    finishes[1]!(Response.json({ frames: [frame], nextCursor: null }));
  });
  expect(result.current.selectedItemIds).toEqual(
    new Set(["outside", frame.itemId]),
  );
  await act(async () => {
    finishes[0]!(
      Response.json({
        frames: [makeBurstFrameFromPosition(2)],
        nextCursor: null,
      }),
    );
  });
  expect(result.current.selectedItemIds).toEqual(
    new Set(["outside", frame.itemId]),
  );
  expect(result.current.isLoading).toBe(false);
});
