import { afterEach, expect, it, vi } from "vitest";
import { callQueryFn } from "@/testing/callQueryFn";
import { stubFetch, getRecordedRequests } from "@/testing/fetchStubHelpers";
import { commentTagCandidatesQueryOptions } from "./commentTagCandidates";
afterEach(() => {
  return vi.unstubAllGlobals();
});
it("validates the item-scoped directory with query-specific cache keys", async () => {
  stubFetch({
    "GET /api/items/photo/comment-tag-candidates": {
      status: 200,
      body: { members: [] },
    },
  });
  const options = commentTagCandidatesQueryOptions({
    itemId: "photo",
    query: "José M",
  });
  expect(await callQueryFn(options)).toEqual({ members: [] });
  expect(getRecordedRequests()[0]?.url).toBe(
    "/api/items/photo/comment-tag-candidates?q=Jos%C3%A9+M",
  );
  expect(options.queryKey).not.toEqual(
    commentTagCandidatesQueryOptions({ itemId: "other", query: "José M" })
      .queryKey,
  );
});
