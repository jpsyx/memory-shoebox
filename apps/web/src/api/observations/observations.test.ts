import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityQueryOptions,
  itemViewersQueryOptions,
  presenceQueryOptions,
} from "./observations";

const MEMBER_ID = "018f0000-0000-7000-8000-000000000001";
beforeEach(() => {
  return vi.unstubAllGlobals();
});
describe("observation transport", () => {
  it("reads unpaginated presence through its shared contract", async () => {
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
      await client.fetchQuery(itemViewersQueryOptions("item /?#")),
    ).toEqual({ viewers: [], nextCursor: null });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/items/item%20%2F%3F%23/viewers",
      expect.anything(),
    );
    expect(itemViewersQueryOptions("one").queryKey).not.toEqual(
      itemViewersQueryOptions("two").queryKey,
    );
  });
  it("combines historical-key filters and encodes opaque cursors when appending", async () => {
    const fetcher = vi.fn(async (path: string) => {
      return Response.json({
        activity: [],
        nextCursor: path.includes("cursor=") ? null : "opaque+/=",
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const client = new QueryClient();
    const options = activityQueryOptions({
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
      activityQueryOptions({ subjectId: "different" }).queryKey,
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
