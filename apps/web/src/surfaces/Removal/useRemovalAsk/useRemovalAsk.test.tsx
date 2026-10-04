import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  makeItemSummaryFromOverrides,
  makeRemovalRequestFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import { useRemovalAsk } from "./useRemovalAsk";
const ITEM = makeItemSummaryFromOverrides();
const MEMBER = "018f0000-0000-7000-8000-00000000c002";
const REQUEST = makeRemovalRequestFromOverrides();
const PATH = `/api/items/${ITEM.itemId}/removal-requests`;
describe("asking mutation recovery", () => {
  it("discovers a committed open ask after a lost response and blocks duplicate presses", async () => {
    stubFetch({
      [`POST ${PATH}`]: { body: {}, status: 500 },
      [`GET ${PATH}`]: {
        status: 200,
        body: {
          item: ITEM,
          nextCursor: null,
          removalRequests: [REQUEST],
          canRequestRemoval: false,
        },
      },
    });
    const onCreated = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => {
        return useRemovalAsk({
          memberId: MEMBER,
          itemId: ITEM.itemId,
          onCreated,
        });
      },
      {
        wrapper: ({ children }) => {
          return (
            <QueryClientProvider client={client}>
              {children}
            </QueryClientProvider>
          );
        },
      },
    );
    act(() => {
      result.current.send("my reason");
      result.current.send("my reason");
    });
    await waitFor(() => {
      return expect(onCreated).toHaveBeenCalledWith(REQUEST);
    });
    expect(
      getRecordedRequests().filter(({ method }) => {
        return method === "POST";
      }),
    ).toHaveLength(1);
    expect(result.current.error).toBeUndefined();
  });
  it.each(["item", "member"])(
    "does not announce an old result after changing %s",
    async (target) => {
      const { hold, letGo } = makeHold();
      stubFetch({
        [`POST ${PATH}`]: { status: 200, body: REQUEST, waitFor: hold },
        [`GET ${PATH}`]: {
          status: 200,
          body: {
            item: ITEM,
            nextCursor: null,
            removalRequests: [REQUEST],
            canRequestRemoval: false,
          },
        },
      });
      const onCreated = vi.fn();
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const { result, rerender } = renderHook(
        ({ memberId, itemId }) => {
          return useRemovalAsk({ memberId, itemId, onCreated });
        },
        {
          initialProps: { memberId: MEMBER, itemId: ITEM.itemId },
          wrapper: ({ children }) => {
            return (
              <QueryClientProvider client={client}>
                {children}
              </QueryClientProvider>
            );
          },
        },
      );
      act(() => {
        return result.current.send("old words");
      });
      rerender({
        memberId: target === "member" ? "other-member" : MEMBER,
        itemId: target === "item" ? "other-item" : ITEM.itemId,
      });
      await act(async () => {
        return letGo();
      });
      await waitFor(() => {
        return expect(client.isMutating()).toBe(0);
      });
      expect(onCreated).not.toHaveBeenCalled();
      expect(result.current.error).toBeUndefined();
    },
  );
  it("announces the current confirmed request under StrictMode's effect replay", async () => {
    stubFetch({ [`POST ${PATH}`]: { status: 200, body: REQUEST } });
    const onCreated = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => {
        return useRemovalAsk({
          memberId: MEMBER,
          itemId: ITEM.itemId,
          onCreated,
        });
      },
      {
        wrapper: ({ children }) => {
          return (
            <StrictMode>
              <QueryClientProvider client={client}>
                {children}
              </QueryClientProvider>
            </StrictMode>
          );
        },
      },
    );
    act(() => {
      return result.current.send("Please");
    });
    await waitFor(() => {
      return expect(client.isMutating()).toBe(0);
    });
    expect(onCreated).toHaveBeenCalledWith(REQUEST);
  });
});
