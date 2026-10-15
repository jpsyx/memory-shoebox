import { makeTimelineQueryOptionsFromView } from "@/api/timeline/timeline";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { makeDay } from "../../timelineFixtures";
import { useTimelineRecovery } from "./useTimelineRecovery";
const view = {
  selection: { tags: [], people: [], from: "2026-09-01", until: undefined },
  at: "2026-09-27",
};
const anchor = {
  capturedOn: "2026-09-20",
  offsetPx: 20,
  pageCursor: "exact-issued",
};
afterEach(() => {
  return vi.unstubAllGlobals();
});

function _setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const options = makeTimelineQueryOptionsFromView({
    view,
    memberId: "member",
  });
  const old = {
    pages: Array.from({ length: 5 }, (_, index) => {
      return {
        days: [makeDay({ capturedOn: `2026-10-0${9 - index}` })],
        nextCursor: null,
        previousCursor: null,
        resultCount: 42,
        selectionResultCount: 42,
        metadataUpdatedAt: 1,
        requestCursor: index === 0 ? null : `issued-${index}`,
      };
    }),
    pageParams: [null, "issued-1", "issued-2", "issued-3", "issued-4"],
  };
  client.setQueryData(options.queryKey, old);
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
  const hook = renderHook(
    () => {
      return useTimelineRecovery({ view, queryKey: options.queryKey });
    },
    { wrapper },
  );
  return { ...hook, client, options, old };
}

it("replaces retained pages with exactly the saved cursor and a fresh effective-selection count", async () => {
  const fetcher = vi.fn(async (_url: string) => {
    return Response.json({
      days: [makeDay({ capturedOn: anchor.capturedOn })],
      nextCursor: "older",
      previousCursor: "newer",
      resultCount: 17,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const setup = _setup();
  await act(async () => {
    return setup.result.current.recoverPage(anchor);
  });
  expect(String(fetcher.mock.calls[0]?.[0])).toContain("cursor=exact-issued");
  expect(String(fetcher.mock.calls[0]?.[0])).toContain(
    "includeResultCount=true",
  );
  expect(setup.client.getQueryData(setup.options.queryKey)).toMatchObject({
    pageParams: ["exact-issued"],
    pages: [{ selectionResultCount: 17, requestCursor: "exact-issued" }],
  });
});

it("rejects a late recovery after exact-query invalidation without overwriting committed pages", async () => {
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal("fetch", () => {
    return new Promise<Response>((fulfill) => {
      finish = fulfill;
    });
  });
  const setup = _setup();
  let recovery: Promise<void>;
  await act(async () => {
    recovery = setup.result.current.recoverPage(anchor);
  });
  await act(async () => {
    return setup.client.invalidateQueries({
      queryKey: setup.options.queryKey,
      exact: true,
      refetchType: "none",
    });
  });
  await act(async () => {
    finish!(
      Response.json({
        days: [makeDay()],
        nextCursor: null,
        previousCursor: null,
        resultCount: 99,
      }),
    );
    await recovery!;
  });
  expect(setup.client.getQueryData(setup.options.queryKey)).toEqual(setup.old);
});

it("retires an unfinished recovery on view change and enables the new view", async () => {
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal("fetch", () => {
    return new Promise<Response>((fulfill) => {
      finish = fulfill;
    });
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
  const firstKey = makeTimelineQueryOptionsFromView({
    view,
    memberId: "member",
  }).queryKey;
  const secondView = { ...view, at: "2026-09-15" };
  const secondKey = makeTimelineQueryOptionsFromView({
    view: secondView,
    memberId: "member",
  }).queryKey;
  const hook = renderHook(
    (props) => {
      return useTimelineRecovery(props);
    },
    {
      wrapper,
      initialProps: { view, queryKey: firstKey },
    },
  );
  let recovery: Promise<void>;
  await act(async () => {
    recovery = hook.result.current.recoverPage(anchor);
  });
  expect(hook.result.current.isRecovering).toBe(true);
  hook.rerender({ view: secondView, queryKey: secondKey });
  expect(hook.result.current.isRecovering).toBe(false);
  await act(async () => {
    finish!(
      Response.json({
        days: [makeDay()],
        nextCursor: null,
        previousCursor: null,
        resultCount: 99,
      }),
    );
    await recovery!;
  });
  expect(client.getQueryData(firstKey)).toBeUndefined();
  expect(client.getQueryData(secondKey)).toBeUndefined();
});

it("cannot overwrite a concurrent exact-query publication after cache collection", async () => {
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal("fetch", () => {
    return new Promise<Response>((fulfill) => {
      finish = fulfill;
    });
  });
  const setup = _setup();
  setup.client.removeQueries({ queryKey: setup.options.queryKey, exact: true });
  let recovery: Promise<void>;
  await act(async () => {
    recovery = setup.result.current.recoverPage(anchor);
  });
  const fresh = {
    ...setup.old,
    pages: [{ ...setup.old.pages[0]!, selectionResultCount: 12 }],
  };
  await act(async () => {
    setup.client.setQueryData(setup.options.queryKey, fresh);
  });
  await act(async () => {
    finish!(
      Response.json({
        days: [makeDay()],
        nextCursor: null,
        previousCursor: null,
        resultCount: 99,
      }),
    );
    await recovery!;
  });
  expect(setup.client.getQueryData(setup.options.queryKey)).toEqual(fresh);
});

it("restarts an empty collected cursor within the effective boundary and publishes truthful provenance", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        days: [],
        nextCursor: null,
        previousCursor: null,
        resultCount: 0,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        days: [makeDay()],
        nextCursor: null,
        previousCursor: null,
        resultCount: 8,
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const setup = _setup();
  setup.client.removeQueries({ queryKey: setup.options.queryKey, exact: true });
  const started = Date.now();
  await act(async () => {
    return setup.result.current.recoverPage(anchor);
  });
  const paths = fetcher.mock.calls.map(([input]) => {
    return new URL(String(input), "https://local.test");
  });
  expect(paths).toHaveLength(2);
  expect(
    paths.map((path) => {
      return path.searchParams.get("until");
    }),
  ).toEqual([view.at, view.at]);
  expect(paths[0]!.searchParams.get("includeResultCount")).toBe("true");
  expect(paths[1]!.searchParams.has("cursor")).toBe(false);
  const result = setup.client.getQueryData<{
    pages: Array<{
      metadataUpdatedAt: number;
      selectionResultCount: number;
      requestCursor: null;
    }>;
    pageParams: null[];
  }>(setup.options.queryKey)!;
  expect(result.pageParams).toEqual([null]);
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0]).toMatchObject({
    selectionResultCount: 8,
    requestCursor: null,
  });
  expect(result.pages[0]!.metadataUpdatedAt).toBeGreaterThanOrEqual(started);
});

it("rejects late recovery publication after media authority retirement", async () => {
  const { createMediaLoadingResources, createMediaLoadingLifetime } =
    await import("@/media/createMediaLoadingResources/createMediaLoadingResources");
  const { MediaLoadingContext } = await import("@/media/MediaLoadingContext");
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const queryKey = makeTimelineQueryOptionsFromView({
    view,
    memberId: "member",
  }).queryKey;
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal("fetch", () => {
    return new Promise<Response>((fulfill) => {
      finish = fulfill;
    });
  });
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={client}>
        <MediaLoadingContext value={resources}>{children}</MediaLoadingContext>
      </QueryClientProvider>
    );
  };
  const hook = renderHook(
    () => {
      return useTimelineRecovery({ view, queryKey });
    },
    {
      wrapper,
    },
  );
  let recovery: Promise<void>;
  await act(async () => {
    recovery = hook.result.current.recoverPage(anchor);
  });
  resources.clearMember();
  await act(async () => {
    finish!(
      Response.json({
        days: [makeDay()],
        nextCursor: null,
        previousCursor: null,
        resultCount: 99,
      }),
    );
    await recovery!;
  });
  expect(client.getQueryData(queryKey)).toBeUndefined();
  resources.dispose();
});
