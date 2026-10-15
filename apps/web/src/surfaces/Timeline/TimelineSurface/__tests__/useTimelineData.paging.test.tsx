import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meQueryOptions } from "@/api/me/me";
import { getViewFromSearch } from "@/api/timeline/selection/selection";
import {
  makeTimelineQueryOptionsFromView,
  timelineRailQueryOptions,
} from "@/api/timeline/timeline";
import { makeFilterFacetsQueryOptionsFromSelection } from "@/api/vocabularies/vocabularies";
import { makeDay } from "@/surfaces/Timeline/timelineFixtures";
import { createMeResponse } from "@/testing/createMeResponse";
import { useTimelineData } from "../useTimelineData";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  return {
    ...(await importOriginal<typeof import("@tanstack/react-router")>()),
    useNavigate: () => {
      return vi.fn();
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the actual timeline paging caller", () => {
  it("serializes forward, reverse and refresh, including callbacks in the same render", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    const account = createMeResponse();
    client.setQueryData(meQueryOptions.queryKey, account);
    const view = getViewFromSearch({});
    const options = makeTimelineQueryOptionsFromView({
      view,
      memberId: account.me.member.memberId,
    });
    client.setQueryData(timelineRailQueryOptions(view.selection).queryKey, {
      days: [],
      nextCursor: null,
    });
    client.setQueryData(options.queryKey, {
      pages: [
        {
          selectionResultCount: null,
          days: [makeDay()],
          nextCursor: "older",
          previousCursor: "newer",
          resultCount: null,
          metadataUpdatedAt: Date.now(),
        },
      ],
      pageParams: ["retained"],
    });
    const requests: string[] = [];
    let finishRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", (url: string) => {
      requests.push(url);
      return new Promise<Response>((finish) => {
        finishRequest = finish;
      });
    });
    const wrapper = ({ children }: { children: ReactNode }) => {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    };
    const hook = renderHook(
      () => {
        return useTimelineData({});
      },
      { wrapper },
    );
    try {
      expect(typeof hook.result.current.onReachStart).toBe("function");
      act(() => {
        hook.result.current.onReachEnd();
        hook.result.current.onReachStart();
        hook.result.current.onReachEnd();
      });
      expect(requests).toEqual(["/api/timeline?cursor=older"]);
      await act(async () => {
        finishRequest!(
          Response.json({
            days: [],
            nextCursor: "oldest",
            previousCursor: "newer",
            resultCount: null,
          }),
        );
      });
      await waitFor(() => {
        return expect(
          client.isFetching({ queryKey: options.queryKey, exact: true }),
        ).toBe(0);
      });
      act(() => {
        hook.result.current.onReachStart();
        hook.result.current.onReachEnd();
        hook.result.current.onReachStart();
      });
      expect(requests.at(-1)).toBe("/api/timeline?cursor=newer");
      expect(requests).toHaveLength(2);
      await act(async () => {
        finishRequest!(
          Response.json({
            days: [],
            nextCursor: "older",
            previousCursor: "newest",
            resultCount: null,
          }),
        );
      });
      // A refresh owns the same fetch slot for all retained pages.
      let refresh: Promise<void>;
      act(() => {
        refresh = client.refetchQueries({
          queryKey: options.queryKey,
          exact: true,
        });
        hook.result.current.onReachEnd();
        hook.result.current.onReachStart();
      });
      expect(requests).toHaveLength(3);
      await act(async () => {
        finishRequest!(
          Response.json({
            days: [makeDay()],
            nextCursor: null,
            previousCursor: null,
            resultCount: null,
          }),
        );
        await refresh!;
      });
    } finally {
      hook.unmount();
      client.clear();
    }
  });

  it("keeps the effective jump count through eviction and remount without renewing retained provenance", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    const account = createMeResponse();
    client.setQueryData(meQueryOptions.queryKey, account);
    const search = {
      from: "2026-09-01",
      until: "2026-09-30",
      at: "2026-09-23",
    };
    const view = getViewFromSearch(search);
    const options = makeTimelineQueryOptionsFromView({
      view,
      memberId: account.me.member.memberId,
    });
    client.setQueryData(timelineRailQueryOptions(view.selection).queryKey, {
      days: [],
      nextCursor: null,
    });
    client.setQueryData(
      makeFilterFacetsQueryOptionsFromSelection({ selection: view.selection })
        .queryKey,
      { tags: [], people: [], resultCount: 30 },
    );
    let serverCount = 8;
    const refreshFlags: Array<string | null> = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const parameters = new URL(url, "http://localhost").searchParams;
      expect(parameters.get("until")).toBe("2026-09-23");
      const pageIndex = Number(
        parameters.get("cursor")?.split("-").at(-1) ?? 0,
      );
      refreshFlags.push(parameters.get("includeResultCount"));
      return Response.json({
        days: [makeDay({ capturedOn: `2026-09-${23 - pageIndex}` })],
        nextCursor: String(pageIndex + 1),
        previousCursor: pageIndex === 0 ? null : `newer-${pageIndex - 1}`,
        resultCount:
          pageIndex === 0 || parameters.has("includeResultCount")
            ? serverCount
            : null,
      });
    });
    const wrapper = ({ children }: { children: ReactNode }) => {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    };
    let hook = renderHook(
      () => {
        return useTimelineData(search);
      },
      { wrapper },
    );
    try {
      await waitFor(() => {
        return expect(hook.result.current.filterCount).toBe(8);
      });
      for (let pageIndex = 1; pageIndex < 8; pageIndex += 1) {
        act(() => {
          return hook.result.current.onReachEnd();
        });
        await waitFor(() => {
          return expect(
            client.isFetching({ queryKey: options.queryKey, exact: true }),
          ).toBe(0);
        });
      }
      const retained = client.getQueryData<{
        pages: Array<{ metadataUpdatedAt: number; resultCount: number | null }>;
      }>(options.queryKey)!;
      expect(retained.pages).toHaveLength(5);
      expect(
        retained.pages.every((page) => {
          return page.resultCount === null;
        }),
      ).toBe(true);
      expect(hook.result.current.filterCount).toBe(8);
      serverCount = 7;
      await act(async () => {
        await client.invalidateQueries({ queryKey: ["timeline"] });
      });
      await waitFor(() => {
        return expect(hook.result.current.filterCount).toBe(7);
      });
      expect(refreshFlags.slice(-5)).toEqual(["true", null, null, null, null]);
      hook.unmount();
      hook = renderHook(
        () => {
          return useTimelineData(search);
        },
        { wrapper },
      );
      expect(hook.result.current.filterCount).toBe(7);
      act(() => {
        return hook.result.current.onReachStart();
      });
      await waitFor(() => {
        return expect(
          client.isFetching({ queryKey: options.queryKey, exact: true }),
        ).toBe(0);
      });
      expect(hook.result.current.filterCount).toBe(7);
      expect(refreshFlags.at(-1)).toBeNull();
    } finally {
      hook.unmount();
      client.clear();
    }
  });
});
