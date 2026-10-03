import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDeleteItem } from "@/surfaces/Item/itemWrites/useDeleteItem/useDeleteItem";
import { getRecordedLines, stubFetch } from "@/testing/fetchStub";
import { ITEM_ID } from "@/testing/itemFixtures";
import {
  makeHold,
  makeQueryClientFromItemDetail,
  renderHookWithQueryClient,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";

const ITEM_DELETE = `DELETE /api/items/${ITEM_ID}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the delete", () => {
  it("is sent once however fast Delete is pressed twice", async () => {
    const { hold, letGo } = makeHold();
    stubFetch({
      [ITEM_DELETE]: { body: undefined, status: 204, waitFor: hold },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      hook: () => {
        return useDeleteItem(ITEM_ID);
      },
      queryClient,
    });
    const onDeleted = vi.fn();

    // Both presses come from one render, before `isDeleting` could arrive.
    act(() => {
      result.current.remove(onDeleted);
      result.current.remove(onDeleted);
    });
    await act(async () => {
      letGo();
    });

    await waitForWritesToSettle(queryClient);
    expect(getRecordedLines()).toEqual([ITEM_DELETE]);
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("is not sent again once it has landed, and says it has", async () => {
    stubFetch({ [ITEM_DELETE]: { body: undefined, status: 204 } });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      hook: () => {
        return useDeleteItem(ITEM_ID);
      },
      queryClient,
    });
    const onDeleted = vi.fn();

    act(() => {
      result.current.remove(onDeleted);
    });
    await waitForWritesToSettle(queryClient);
    expect(result.current.isDeleted).toBe(true);

    // The way out has not been taken yet, so the page can still be pressed.
    act(() => {
      result.current.remove(onDeleted);
    });
    await waitForWritesToSettle(queryClient);
    expect(getRecordedLines()).toEqual([ITEM_DELETE]);
    expect(onDeleted).toHaveBeenCalledOnce();
  });
});
