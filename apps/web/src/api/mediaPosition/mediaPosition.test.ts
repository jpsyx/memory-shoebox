import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMediaPosition, mediaPositionQueryOptions } from "./mediaPosition";
import { ITEM_ID } from "@/testing/itemFixtureHelpers";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";

const request = { itemId: ITEM_ID, selection: { tags: [], people: [] } };
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("media position API", () => {
  it("posts the selection, validates counters and carries cancellation", async () => {
    stubFetch({
      "POST /api/media/position": {
        status: 200,
        body: { position: 2, total: 3 },
      },
    });
    const signal = new AbortController().signal;
    expect(await fetchMediaPosition({ request, signal })).toEqual({
      position: 2,
      total: 3,
    });
    expect(getRecordedRequests()).toEqual([
      { method: "POST", url: "/api/media/position", body: request },
    ]);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).toBe(signal);
    stubFetch({
      "POST /api/media/position": {
        status: 200,
        body: { position: 4, total: 3 },
      },
    });
    await expect(fetchMediaPosition({ request, signal })).rejects.toThrow();
  });
  it("rejects late results after cancellation", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        controller.abort();
        return Response.json({ position: 1, total: 1 });
      }),
    );
    await expect(
      fetchMediaPosition({ request, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("accepts null and rejects malformed requests before networking", async () => {
    stubFetch({ "POST /api/media/position": { status: 200, body: null } });
    const signal = new AbortController().signal;
    await expect(
      fetchMediaPosition({ request: { ...request, itemId: "bad" }, signal }),
    ).rejects.toThrow();
    expect(getRecordedRequests()).toEqual([]);
    await expect(fetchMediaPosition({ request, signal })).resolves.toBeNull();
  });
  it("isolates members and selections and does not retry failed reads", async () => {
    stubFetch({
      "POST /api/media/position": {
        status: 500,
        body: { error: "server_error", message: "unavailable" },
      },
    });
    const options = mediaPositionQueryOptions({
      memberId: "member-a",
      request,
    });
    expect(options.queryKey).toEqual([
      "timeline",
      "member-a",
      "media-position",
      request,
    ]);
    expect(
      mediaPositionQueryOptions({ memberId: "member-b", request }).queryKey,
    ).not.toEqual(options.queryKey);
    expect(
      mediaPositionQueryOptions({
        memberId: "member-a",
        request: {
          ...request,
          selection: { ...request.selection, until: "2026-09-15" },
        },
      }).queryKey,
    ).not.toEqual(options.queryKey);
    expect(options.staleTime).toBe(30_000);
    expect(options.refetchOnWindowFocus).toBe(false);
    const client = new QueryClient();
    await expect(client.fetchQuery(options)).rejects.toThrow();
    expect(getRecordedRequests()).toHaveLength(1);
    client.clear();
  });
});
