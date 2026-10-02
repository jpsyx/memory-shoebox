import type { skipToken } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { burstFramesQueryOptions } from "@/api/bursts/bursts";
import { BURST_ID, makeBurstFrame } from "@/testing/itemFixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Calls a query function with no context, which this one never reads.
 *
 * `queryFn` is typed as optional and as possibly `skipToken`; neither is true
 * of this query, so both are cast away.
 */
function _callQueryFn(options: ReturnType<typeof burstFramesQueryOptions>) {
  const queryFn = options.queryFn as Exclude<
    typeof options.queryFn,
    typeof skipToken | undefined
  >;
  return queryFn({} as Parameters<typeof queryFn>[0]);
}

describe("burstFramesQueryOptions", () => {
  it("parses what step 5a's route actually answers, which is BurstFrameRef", async () => {
    const answer = {
      frames: [makeBurstFrame(1), makeBurstFrame(2)],
      nextCursor: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify(answer), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(
      _callQueryFn(burstFramesQueryOptions(BURST_ID)),
    ).resolves.toEqual(answer);
  });
});
