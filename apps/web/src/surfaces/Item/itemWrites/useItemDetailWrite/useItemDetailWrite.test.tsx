import { useQuery } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { itemQueryOptions } from "@/api/items/items";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useSetItemTags";
import {
  getRecordedLines,
  stubFetch,
  type Answer,
} from "@/testing/fetchStubHelpers";
import { ITEM_ID, makeItemDetail } from "@/testing/itemFixtureHelpers";
import {
  getCachedItemFromQueryClient,
  makeHold,
  makeQueryClientFromItemDetail,
  renderHookWithQueryClient,
} from "@/testing/itemWriteTestHelpers";

const ITEM_READ = `GET /api/items/${ITEM_ID}`;
const TAGS_PUT = `PUT /api/items/${ITEM_ID}/tags`;

const FORBIDDEN_SENTENCE =
  "You can no longer change this one. The page has caught up with what you may do.";

const FORBIDDEN_ANSWER: Answer = {
  status: 403,
  body: { error: "item_edit_forbidden", message: "x" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a write that answers with the item", () => {
  it("puts the answer in the cache and asks for nothing else", async () => {
    const answer = makeItemDetail({
      tags: [{ tagId: "018f0000-0000-7000-8000-00000000e202", name: "beach" }],
    });
    stubFetch({ [TAGS_PUT]: { status: 200, body: answer } });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        return useSetItemTags(ITEM_ID);
      },
      queryClient,
    });

    act(() => {
      result.current.save({ variables: ["beach"] });
    });

    await waitFor(() => {
      expect(getCachedItemFromQueryClient(queryClient)?.tags).toEqual(
        answer.tags,
      );
    });
    expect(getRecordedLines()).toEqual([TAGS_PUT]);
  });

  it("asks for the item once more when the server refuses, and says why", async () => {
    stubFetch({
      [TAGS_PUT]: FORBIDDEN_ANSWER,
      [ITEM_READ]: { status: 200, body: makeItemDetail() },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        useQuery(itemQueryOptions(ITEM_ID));
        return useSetItemTags(ITEM_ID);
      },
      queryClient,
    });
    // The page's own read on arriving, settled before anything is saved.
    await waitFor(() => {
      expect(getRecordedLines()).toEqual([ITEM_READ]);
      expect(queryClient.isFetching()).toBe(0);
    });

    act(() => {
      result.current.save({ variables: ["beach"] });
    });

    await waitFor(() => {
      expect(result.current.error).toBe(FORBIDDEN_SENTENCE);
    });
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(getRecordedLines()).toEqual([ITEM_READ, TAGS_PUT, ITEM_READ]);
  });

  it("rides the page's own read when a refusal lands during it", async () => {
    const read = makeHold();
    stubFetch({
      [TAGS_PUT]: FORBIDDEN_ANSWER,
      [ITEM_READ]: { status: 200, body: makeItemDetail(), waitFor: read.hold },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        useQuery(itemQueryOptions(ITEM_ID));
        return useSetItemTags(ITEM_ID);
      },
      queryClient,
    });
    await waitFor(() => {
      expect(getRecordedLines()).toEqual([ITEM_READ]);
    });

    // Refused while the read on arriving is still out: that read is already
    // the catching up, and a second one would count a second open.
    act(() => {
      result.current.save({ variables: ["beach"] });
    });
    await waitFor(() => {
      expect(result.current.error).toBe(FORBIDDEN_SENTENCE);
    });
    await act(async () => {
      read.letGo();
    });

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(getRecordedLines()).toEqual([ITEM_READ, TAGS_PUT]);
  });

  it("asks for nothing when nobody is looking at the item any more", async () => {
    stubFetch({ [TAGS_PUT]: FORBIDDEN_ANSWER });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        return useSetItemTags(ITEM_ID);
      },
      queryClient,
    });

    act(() => {
      result.current.save({ variables: ["beach"] });
    });

    await waitFor(() => {
      expect(result.current.error).toBe(FORBIDDEN_SENTENCE);
    });
    expect(queryClient.isFetching()).toBe(0);
    expect(getRecordedLines()).toEqual([TAGS_PUT]);
  });
});
