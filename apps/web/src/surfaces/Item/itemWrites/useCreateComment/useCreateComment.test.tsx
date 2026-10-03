import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCreateComment } from "@/surfaces/Item/itemWrites/useCreateComment/useCreateComment";
import { getRecordedLines, stubFetch } from "@/testing/fetchStub";
import { ITEM_ID, makeComment, SIGNED_IN } from "@/testing/itemFixtures";
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
      hook: () => {
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
      hook: () => {
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
