import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { useBurstFan } from "@/surfaces/Timeline/TimelineSurface/useBurstFan/useBurstFan";
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
    const { result } = renderHook(() => {
      return useBurstFan(_makeHangingQueryClient(answers));
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
    const { result } = renderHook(() => {
      return useBurstFan(_makeHangingQueryClient(answers));
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
