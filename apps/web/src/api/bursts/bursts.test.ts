import { afterEach, describe, expect, it, vi } from "vitest";
import { burstFramesQueryOptions } from "@/api/bursts/bursts";
import { callQueryFn } from "@/testing/callQueryFn";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { BURST_ID, makeBurstFrame } from "@/testing/itemFixtureHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("burstFramesQueryOptions", () => {
  it("answers with the BurstFrameRef frames the /frames route returns", async () => {
    const answer = {
      frames: [makeBurstFrame(1), makeBurstFrame(2)],
      nextCursor: null,
    };
    stubFetch({
      [`GET /api/bursts/${BURST_ID}/frames`]: { body: answer, status: 200 },
    });

    await expect(
      callQueryFn(burstFramesQueryOptions(BURST_ID)),
    ).resolves.toEqual(answer);
    expect(
      getRecordedRequests().map((request) => {
        return request.url;
      }),
    ).toEqual([`/api/bursts/${BURST_ID}/frames`]);
  });
});
