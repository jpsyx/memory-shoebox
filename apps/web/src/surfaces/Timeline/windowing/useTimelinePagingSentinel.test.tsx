import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useTimelinePaging } from "@/api/timeline/useTimelinePaging/useTimelinePaging";
import { useTimelinePagingSentinel } from "./useTimelinePagingSentinel";

afterEach(() => {
  return vi.unstubAllGlobals();
});

it.each(["older", "newer"] as const)(
  "rearms an intersecting %s sentinel when the real Query fetch slot becomes idle",
  async (direction) => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private callback: IntersectionObserverCallback) {}
        observe(target: Element) {
          this.callback(
            [
              {
                target,
                isIntersecting: true,
                intersectionRatio: 1,
              } as IntersectionObserverEntry,
            ],
            {} as IntersectionObserver,
          );
        }
        disconnect() {}
      },
    );
    const client = new QueryClient();
    const queryKey = ["timeline", direction];
    const requests: number[] = [];
    let release: () => void = () => {};
    const pending = new Promise<void>((done) => {
      release = done;
    });
    const options = {
      queryKey,
      initialPageParam: 2,
      staleTime: Infinity,
      queryFn: async ({ pageParam }: { pageParam: number }) => {
        requests.push(pageParam);
        await pending;
        return pageParam;
      },
      getNextPageParam: (page: number) => {
        return page < 3 ? page + 1 : undefined;
      },
      getPreviousPageParam: (page: number) => {
        return page > 1 ? page - 1 : undefined;
      },
    };
    client.setQueryData(queryKey, { pages: [2], pageParams: [2] });
    const refresh = client.fetchInfiniteQuery({ ...options, staleTime: 0 });
    const wrapper = ({ children }: { children: React.ReactNode }) => {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    };
    const hook = renderHook(
      () => {
        const stream = useInfiniteQuery(options);
        const paging = useTimelinePaging({ queryKey, stream });
        const sentinelRef = useRef(document.createElement("div"));
        useTimelinePagingSentinel({
          sentinelRef,
          hasMore:
            direction === "older" ? stream.hasNextPage : stream.hasPreviousPage,
          onReachEnd:
            direction === "older" ? paging.onReachEnd : paging.onReachStart,
          isFetching: stream.isFetching,
        });
      },
      { wrapper },
    );
    expect(requests).toEqual([2]);
    await act(async () => {
      release();
      await refresh;
    });
    await waitFor(() => {
      return expect(requests).toEqual([2, direction === "older" ? 3 : 1]);
    });
    hook.unmount();
    client.clear();
  },
);

it("ignores a queued intersection after recovery or view retirement disconnects its observer", () => {
  const callbacks: IntersectionObserverCallback[] = [];
  const target = document.createElement("div");
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const onReachEnd = vi.fn();
  const sentinelRef = { current: target };
  const hook = renderHook(
    ({ isFetching }) => {
      return useTimelinePagingSentinel({
        sentinelRef,
        onReachEnd,
        hasMore: true,
        isFetching,
      });
    },
    { initialProps: { isFetching: false } },
  );
  hook.rerender({ isFetching: true });
  callbacks[0]!(
    [
      {
        target,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: new DOMRect(),
        intersectionRect: new DOMRect(),
        rootBounds: null,
        time: 0,
      },
    ],
    {} as IntersectionObserver,
  );
  expect(onReachEnd).not.toHaveBeenCalled();
  hook.unmount();
});
