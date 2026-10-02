import { afterEach, describe, expect, it, vi } from "vitest";
import { burstFramesQueryOptions } from "@/api/bursts/bursts";
import { callQueryFn } from "@/testing/callQueryFn";
import { BURST_ID, makeBurstFrame } from "@/testing/itemFixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("burstFramesQueryOptions", () => {
  it("parses what step 5a's route actually answers, which is BurstFrameRef", async () => {
    const answer = {
      frames: [makeBurstFrame(1), makeBurstFrame(2)],
      nextCursor: null,
    };
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requestedUrls.push(String(url));
        return new Response(JSON.stringify(answer), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(
      callQueryFn(burstFramesQueryOptions(BURST_ID)),
    ).resolves.toEqual(answer);
    expect(requestedUrls).toEqual([`/api/bursts/${BURST_ID}/frames`]);
  });
});
