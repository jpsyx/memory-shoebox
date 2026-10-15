import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { useBurstFan } from "@/surfaces/Timeline/TimelineSurface/useBurstFan/useBurstFan";
import { burstFramesQueryOptions } from "@/api/bursts/bursts";
import { stubFetch } from "@/testing/fetchStubHelpers";
import { makeBurstFrame } from "@/testing/itemFixtureHelpers";

const BURST_MORNING = "018f0000-0000-7000-8000-00000000b001";
const BURST_EVENING = "018f0000-0000-7000-8000-00000000b002";

const MORNING_FRAME = makeBurstFrame(1);
const EVENING_FRAME = makeBurstFrame(2);

/** Answers one hanging fetch with its frames. */
type AnswerFetch = (frames: readonly BurstFrameRef[]) => void;

/**
 * A client whose every fetch hangs until the test answers it, in whatever
 * order the test chooses.
 *
 * Two presses in flight at once is the whole point here, and a real fetch
 * settles in the order the network happens to answer, which a test cannot
 * arrange any other way.
 */
function _makeHangingQueryClient(answers: AnswerFetch[]): QueryClient {
  const queryClient = new QueryClient();
  vi.spyOn(queryClient, "fetchQuery").mockImplementation(() => {
    return new Promise((resolve) => {
      answers.push((frames) => {
        resolve({ frames });
      });
    });
  });
  return queryClient;
}

describe("useBurstFan", () => {
  it("remembers a burst's frames under its own id", async () => {
    const answers: AnswerFetch[] = [];
    const client = _makeHangingQueryClient(answers);
    const { result } = renderHook(() => {
      return useBurstFan(client);
    });

    act(() => {
      result.current.onOpenBurst(BURST_MORNING);
    });
    await act(async () => {
      answers[0]?.([MORNING_FRAME]);
    });

    expect(result.current.framesByBurstId.get(BURST_MORNING)).toEqual([
      MORNING_FRAME,
    ]);
  });

  it("keeps both bursts when two presses answer out of order", async () => {
    const answers: AnswerFetch[] = [];
    const client = _makeHangingQueryClient(answers);
    const { result } = renderHook(() => {
      return useBurstFan(client);
    });

    // Both stacks are pressed before either fetch has answered, so both
    // handlers are closures built from the same render.
    act(() => {
      result.current.onOpenBurst(BURST_MORNING);
      result.current.onOpenBurst(BURST_EVENING);
    });
    expect(answers.length).toBe(2);

    // The second press answers first, which is the ordinary case rather than
    // an exotic one: a shorter burst comes back sooner.
    await act(async () => {
      answers[1]?.([EVENING_FRAME]);
    });
    await act(async () => {
      answers[0]?.([MORNING_FRAME]);
    });

    // A burst whose entry is dropped here is unopenable for good:
    // `BurstStack` only fans when its frames are defined, and nothing asks
    // for them a second time.
    expect(result.current.framesByBurstId.get(BURST_EVENING)).toEqual([
      EVENING_FRAME,
    ]);
    expect(result.current.framesByBurstId.get(BURST_MORNING)).toEqual([
      MORNING_FRAME,
    ]);
  });
});

it("updates an already-open fan after a burst write refreshes its query", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const route = `GET /api/bursts/${BURST_MORNING}/frames`;
  stubFetch({
    [route]: {
      body: { frames: [MORNING_FRAME, EVENING_FRAME], nextCursor: null },
      status: 200,
    },
  });
  const { result } = renderHook(() => {
    return useBurstFan(queryClient);
  });
  act(() => {
    return result.current.onOpenBurst(BURST_MORNING);
  });
  await waitFor(() => {
    return expect(
      result.current.framesByBurstId.get(BURST_MORNING),
    ).toHaveLength(2);
  });
  stubFetch({
    [route]: {
      body: { frames: [EVENING_FRAME], nextCursor: null },
      status: 200,
    },
  });
  await act(async () => {
    await queryClient.invalidateQueries({
      queryKey: burstFramesQueryOptions(BURST_MORNING).queryKey,
      refetchType: "all",
    });
  });
  expect(result.current.framesByBurstId.get(BURST_MORNING)).toEqual([
    EVENING_FRAME,
  ]);
  vi.unstubAllGlobals();
});

it("does not repopulate a cleared fan when an older request finally answers", async () => {
  const answers: AnswerFetch[] = [];
  const client = _makeHangingQueryClient(answers);
  const { result } = renderHook(() => {
    return useBurstFan(client);
  });
  act(() => {
    return result.current.onOpenBurst(BURST_MORNING);
  });
  act(() => {
    return result.current.onClearBursts();
  });
  await act(async () => {
    return answers[0]?.([MORNING_FRAME]);
  });
  expect(result.current.framesByBurstId.size).toBe(0);
});

it("bounds live frame queries to the twenty compact expanded IDs, then prunes a closed fan", async () => {
  const { createTimelineMemory } =
    await import("../../windowing/createTimelineMemory");
  const memory = createTimelineMemory();
  const ids = Array.from({ length: 21 }, (_, index) => {
    return `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`;
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  stubFetch(
    Object.fromEntries(
      ids.map((id) => {
        return [
          `GET /api/bursts/${id}/frames`,
          { status: 200, body: { frames: [MORNING_FRAME], nextCursor: null } },
        ];
      }),
    ),
  );
  const hook = renderHook(() => {
    return useBurstFan(client, {
      viewKey: "view",
      memory,
      retainedBurstIds: new Set(ids),
    });
  });
  for (const id of ids) {
    act(() => {
      return hook.result.current.onOpenBurst(id);
    });
    await waitFor(() => {
      return expect(hook.result.current.framesByBurstId.has(id)).toBe(true);
    });
  }
  expect(hook.result.current.framesByBurstId.size).toBe(20);
  expect(client.getQueryCache().findAll({ queryKey: ["bursts"] })).toHaveLength(
    20,
  );
  expect(hook.result.current.framesByBurstId.has(ids[0]!)).toBe(false);
  act(() => {
    return hook.result.current.onCollapseBurst(ids[20]!);
  });
  expect(hook.result.current.framesByBurstId.size).toBe(19);
  expect(client.getQueryCache().findAll({ queryKey: ["bursts"] })).toHaveLength(
    19,
  );
  hook.unmount();
  expect(client.getQueryCache().findAll({ queryKey: ["bursts"] })).toHaveLength(
    0,
  );
  vi.unstubAllGlobals();
});
