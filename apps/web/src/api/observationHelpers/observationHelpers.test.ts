import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeActivityQueryOptionsFromFilters,
  makeItemViewersQueryOptionsFromItemId,
  presenceQueryOptions,
} from "./observationHelpers";

const MEMBER_ID: string = "018f0000-0000-7000-8000-000000000001";
beforeEach(() => {
  return vi.unstubAllGlobals();
});
describe("observation transport", () => {
  it("returns empty presence and a null cursor with same-origin credentials", async () => {
    const fetcher = vi.fn(async () => {
      return Response.json({ presence: [], nextCursor: null });
    });
    vi.stubGlobal("fetch", fetcher);
    const client = new QueryClient();
    expect(await client.fetchQuery(presenceQueryOptions())).toEqual({
      presence: [],
      nextCursor: null,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/presence",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
  it("encodes an item's viewer path and isolates its cache", async () => {
    const fetcher = vi.fn(async () => {
      return Response.json({ viewers: [], nextCursor: null });
    });
    vi.stubGlobal("fetch", fetcher);
    const client = new QueryClient();
    expect(
      await client.fetchQuery(
        makeItemViewersQueryOptionsFromItemId("item /?#"),
      ),
    ).toEqual({ viewers: [], nextCursor: null });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/items/item%20%2F%3F%23/viewers",
      expect.anything(),
    );
    expect(makeItemViewersQueryOptionsFromItemId("one").queryKey).not.toEqual(
      makeItemViewersQueryOptionsFromItemId("two").queryKey,
    );
  });
  it("encodes supplied opaque cursors and combined historical filters", async () => {
    const fetcher = vi.fn(async (path: string) => {
      return Response.json({
        activity: [],
        nextCursor: path.includes("cursor=") ? null : "opaque+/=",
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const client = new QueryClient();
    const options = makeActivityQueryOptionsFromFilters({
      family: "authority",
      actorMemberId: MEMBER_ID,
      subjectId: "old.setting &key",
    });
    const first = await client.fetchInfiniteQuery(options);
    expect(first.pageParams).toEqual([undefined]);
    const second = await client.fetchInfiniteQuery({
      ...options,
      initialPageParam: "opaque+/=",
    });
    expect(second.pages[0]?.nextCursor).toBeNull();
    expect(fetcher).toHaveBeenLastCalledWith(
      `/api/activity?family=authority&actorMemberId=${MEMBER_ID}&subjectId=old.setting+%26key&cursor=opaque%2B%2F%3D`,
      expect.anything(),
    );
    expect(options.queryKey).not.toEqual(
      makeActivityQueryOptionsFromFilters({ subjectId: "different" }).queryKey,
    );
  });
  it("rejects malformed responses rather than filling missing figures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return Response.json({ presence: [{}], nextCursor: null });
      }),
    );
    await expect(
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }).fetchQuery(presenceQueryOptions()),
    ).rejects.toThrow();
  });
});
