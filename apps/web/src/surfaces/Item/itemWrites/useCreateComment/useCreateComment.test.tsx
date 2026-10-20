import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCreateComment } from "@/surfaces/Item/itemWrites/useCreateComment/useCreateComment";
import {
  getRecordedLines,
  getRecordedRequests,
  stubFetch,
} from "@/testing/fetchStubHelpers";
import { ITEM_ID, makeComment, SIGNED_IN } from "@/testing/itemFixtureHelpers";
import {
  getCachedItemFromQueryClient,
  makeHold,
  makeQueryClientFromItemDetail,
  renderHookWithQueryClient,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";

const COMMENT_POST = `POST /api/items/${ITEM_ID}/comments`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a comment", () => {
  it("lands at the foot of the thread, and clears the field only then", async () => {
    const comment = makeComment({ author: SIGNED_IN, body: "Hello." });
    stubFetch({ [COMMENT_POST]: { status: 201, body: comment } });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        return useCreateComment(ITEM_ID);
      },
      queryClient,
    });
    const onSent = vi.fn();

    act(() => {
      result.current.send({
        draft: { body: "Hello.", atSeconds: null },
        onSent,
      });
    });

    await waitFor(() => {
      expect(getCachedItemFromQueryClient(queryClient)?.comments).toEqual([
        comment,
      ]);
    });
    expect(onSent).toHaveBeenCalledOnce();
  });

  it("is posted once however fast Send is pressed twice", async () => {
    const { hold, letGo } = makeHold();
    const comment = makeComment({ author: SIGNED_IN, body: "Hello." });
    stubFetch({
      [COMMENT_POST]: { status: 201, body: comment, waitFor: hold },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        return useCreateComment(ITEM_ID);
      },
      queryClient,
    });
    const onSent = vi.fn();

    // Both presses come from one render, before `isSending` could arrive.
    act(() => {
      result.current.send({
        draft: { body: "Hello.", atSeconds: null },
        onSent,
      });
      result.current.send({
        draft: { body: "Hello.", atSeconds: null },
        onSent,
      });
    });
    await act(async () => {
      letGo();
    });

    await waitForWritesToSettle(queryClient);
    expect(getRecordedLines()).toEqual([COMMENT_POST]);
    expect(getCachedItemFromQueryClient(queryClient)?.comments).toEqual([
      comment,
    ]);
    expect(onSent).toHaveBeenCalledOnce();
  });
});

describe("comment ownership across navigation", () => {
  it("applies success and its callback after the sender unmounts", async () => {
    const { hold, letGo } = makeHold();
    const comment = makeComment({ author: SIGNED_IN, body: "Away." });
    stubFetch({
      [COMMENT_POST]: { status: 201, body: comment, waitFor: hold },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const sender = renderHookWithQueryClient({
      useHook: () => {
        return useCreateComment(ITEM_ID);
      },
      queryClient,
    });
    const onSent = vi.fn();
    act(() => {
      return sender.result.current.send({
        draft: { body: "Away.", atSeconds: null },
        onSent,
      });
    });
    sender.unmount();
    await act(async () => {
      letGo();
    });
    await waitForWritesToSettle(queryClient);
    expect(onSent).toHaveBeenCalledOnce();
    expect(getCachedItemFromQueryClient(queryClient)?.comments).toEqual([
      comment,
    ]);
  });

  it("blocks a second sender for an item already pending after remount", async () => {
    const { hold, letGo } = makeHold();
    stubFetch({
      [COMMENT_POST]: {
        status: 201,
        body: makeComment({ author: SIGNED_IN }),
        waitFor: hold,
      },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const first = renderHookWithQueryClient({
      useHook: () => {
        return useCreateComment(ITEM_ID);
      },
      queryClient,
    });
    act(() => {
      return first.result.current.send({
        draft: { body: "Once.", atSeconds: null },
        onSent: () => {},
      });
    });
    first.unmount();
    const returned = renderHookWithQueryClient({
      useHook: () => {
        return useCreateComment(ITEM_ID);
      },
      queryClient,
    });
    expect(returned.result.current.isSending).toBe(true);
    act(() => {
      return returned.result.current.send({
        draft: { body: "Twice.", atSeconds: null },
        onSent: () => {},
      });
    });
    await act(async () => {
      letGo();
    });
    await waitForWritesToSettle(queryClient);
    expect(getRecordedLines()).toEqual([COMMENT_POST]);
    await waitFor(() => {
      return expect(returned.result.current.isSending).toBe(false);
    });
  });
});

describe("per-item pending writes", () => {
  it("allows a different item to send while preserving the original item's payload and callback", async () => {
    const otherItemId = "00000000-0000-4000-8000-000000000002";
    const { hold, letGo } = makeHold();
    stubFetch({
      [COMMENT_POST]: {
        status: 201,
        body: makeComment({ author: SIGNED_IN, body: "First" }),
        waitFor: hold,
      },
      [`POST /api/items/${otherItemId}/comments`]: {
        status: 201,
        body: makeComment({ author: SIGNED_IN, body: "Second" }),
      },
    });
    const queryClient = makeQueryClientFromItemDetail();
    let itemId = ITEM_ID;
    const sender = renderHookWithQueryClient({
      queryClient,
      useHook: () => {
        return useCreateComment(itemId);
      },
    });
    const onFirstSent = vi.fn();
    const onSecondSent = vi.fn();
    act(() => {
      sender.result.current.send({
        draft: { body: "First", atSeconds: 6.25 },
        onSent: onFirstSent,
      });
    });
    itemId = otherItemId;
    sender.rerender();
    expect(sender.result.current.isSending).toBe(false);
    act(() => {
      sender.result.current.send({
        draft: {
          body: "Second",
          atSeconds: null,
          parentCommentId: "00000000-0000-4000-8000-000000000003",
        },
        onSent: onSecondSent,
      });
    });
    await waitFor(() => {
      expect(onSecondSent).toHaveBeenCalledOnce();
    });
    expect(onFirstSent).not.toHaveBeenCalled();
    await act(async () => {
      letGo();
    });
    await waitForWritesToSettle(queryClient);
    expect(onFirstSent).toHaveBeenCalledOnce();
    expect(
      getRecordedRequests().map(({ url, body }) => {
        return { url, body };
      }),
    ).toEqual([
      {
        url: `/api/items/${ITEM_ID}/comments`,
        body: { body: "First", atSeconds: 6.25 },
      },
      {
        url: `/api/items/${otherItemId}/comments`,
        body: {
          body: "Second",
          atSeconds: null,
          parentCommentId: "00000000-0000-4000-8000-000000000003",
        },
      },
    ]);
    expect(getCachedItemFromQueryClient(queryClient)?.comments[0]?.body).toBe(
      "First",
    );
  });
});
