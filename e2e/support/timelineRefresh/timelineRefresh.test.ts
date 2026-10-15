import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  readTimelineAdapterFromBundle,
  type TimelineIntegrationPage,
} from "../../../apps/web/src/testing/timelineAdapter/readTimelineAdapterFromBundle.ts";
import {
  makeTimelineRefreshHarness,
  restoreNewestTimelinePages,
} from "./timelineRefreshTestHelpers.ts";
let adapter: Awaited<ReturnType<typeof readTimelineAdapterFromBundle>>;
beforeAll(async () => {
  adapter = await readTimelineAdapterFromBundle();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("production timeline adapter against the real server", () => {
  it("refreshes a nonempty retained window without restarting or changing its page parameters", async () => {
    const harness = await makeTimelineRefreshHarness(adapter);
    try {
      await harness.observer.refetch();
      for (let index = 0; index < 6; index += 1) {
        await harness.observer.fetchNextPage();
      }
      const before = harness.observer.getCurrentResult().data!;
      const requestStart = harness.requests.length;
      await harness.observer.refetch();
      const after = harness.observer.getCurrentResult().data!;
      expect(after.pageParams).toEqual(before.pageParams);
      expect(
        after.pages.map((page) => {
          return page.days;
        }),
      ).toEqual(
        before.pages.map((page) => {
          return page.days;
        }),
      );
      expect(harness.requests.slice(requestStart)).toHaveLength(5);
      expect(
        harness.requests.slice(requestStart).every(({ path }) => {
          return new URL(path, "http://localhost").searchParams.has("cursor");
        }),
      ).toBe(true);
      expect(
        after.pages.every((page) => {
          return page.selectionResultCount === 7;
        }),
      ).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it.each(["empty", "restricted"])(
    "restarts an %s effective selection once and keeps both ends closed",
    async (scenario) => {
      const harness = await makeTimelineRefreshHarness(adapter);
      try {
        await restoreNewestTimelinePages(harness);
        if (scenario === "empty") {
          await harness.fixture.database
            .deleteFrom("items")
            .where("id", "in", harness.itemIds)
            .execute();
        } else {
          await harness.fixture.database
            .updateTable("items")
            .set({ visibility_rule_id: harness.hiddenRule })
            .where("id", "in", harness.itemIds)
            .execute();
        }
        const requestStart = harness.requests.length;
        await harness.observer.refetch();
        const after = harness.observer.getCurrentResult();
        expect(after.data!.pages).toHaveLength(1);
        expect(after.data!.pages[0]).toMatchObject({
          days: [],
          resultCount: 0,
          selectionResultCount: 0,
          nextCursor: null,
          previousCursor: null,
          requestCursor: null,
        });
        expect(after.data!.pageParams).toEqual([null]);
        expect(after.hasNextPage).toBe(false);
        expect(after.hasPreviousPage).toBe(false);
        expect(harness.requests.slice(requestStart)).toHaveLength(2);
        await harness.observer.refetch();
        expect(harness.requests.slice(requestStart)).toHaveLength(3);
      } finally {
        await harness.close();
      }
    },
  );

  it("keeps a canceled restart from replacing the newer operation's count, pages or stored cursors", async () => {
    const harness = await makeTimelineRefreshHarness(adapter);
    try {
      await restoreNewestTimelinePages(harness);
      const oldCursor = harness.observer.getCurrentResult().data!.pageParams[0];
      await harness.fixture.database
        .deleteFrom("items")
        .where("id", "=", harness.itemIds[0]!)
        .execute();
      let releaseOldRestart: (() => void) | undefined;
      harness.hold((path, response) => {
        if (new URL(path, "http://localhost").searchParams.has("cursor")) {
          return Promise.resolve(response);
        }
        return new Promise<Response>((finish) => {
          releaseOldRestart = () => {
            finish(response);
          };
        });
      });
      const oldRefresh = harness.observer.refetch();
      await vi.waitFor(() => {
        return expect(releaseOldRestart).toBeTypeOf("function");
      });
      const oldRestartSignal = harness.requests.at(-1)!.signal;
      await harness.client.cancelQueries({
        queryKey: harness.options.queryKey,
        exact: true,
      });
      expect(oldRestartSignal?.aborted).toBe(true);
      harness.hold(undefined);
      await harness.insert(28);
      await harness.observer.refetch();
      const replacement = harness.observer.getCurrentResult().data!;
      expect(replacement.pages[0]!.days[0]!.capturedOn).toBe("2026-09-28");
      expect(replacement.pageParams[0]).toBe(oldCursor);
      expect(
        replacement.pages.every((page) => {
          return page.selectionResultCount === 7;
        }),
      ).toBe(true);
      expect(replacement.pageParams).toEqual(
        replacement.pages.map((page) => {
          return page.requestCursor;
        }),
      );
      releaseOldRestart!();
      await oldRefresh;
      await new Promise<void>((finish) => {
        return setImmediate(finish);
      });
      expect(harness.observer.getCurrentResult().data).toBe(replacement);
    } finally {
      await harness.close();
    }
  });

  it("restarts an empty reverse refresh head with truthful stored cursors, then refreshes and replays the containing cursor", async () => {
    const harness = await makeTimelineRefreshHarness(adapter);
    try {
      await restoreNewestTimelinePages(harness);
      await harness.fixture.database
        .deleteFrom("items")
        .where("id", "=", harness.itemIds[0]!)
        .execute();
      const requestStart = harness.requests.length;
      const snapshots: Array<{ params: unknown[]; actual: unknown[] }> = [];
      const unsubscribe = harness.client.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          event.query.queryKey === harness.options.queryKey
        ) {
          const data = harness.client.getQueryData<{
            pages: TimelineIntegrationPage[];
            pageParams: unknown[];
          }>(harness.options.queryKey);
          if (data !== undefined) {
            snapshots.push({
              params: data.pageParams,
              actual: data.pages.map((page) => {
                return page.requestCursor;
              }),
            });
          }
        }
      });
      await harness.observer.refetch();
      unsubscribe();
      const refreshed = harness.observer.getCurrentResult();
      expect(
        refreshed.data!.pages.flatMap((page) => {
          return page.days.map((day) => {
            return day.capturedOn;
          });
        }),
      ).toEqual([
        "2026-09-26",
        "2026-09-25",
        "2026-09-24",
        "2026-09-23",
        "2026-09-22",
      ]);
      expect(refreshed.data!.pageParams[0]).toBeNull();
      expect(
        refreshed.data!.pages.every((page) => {
          return page.selectionResultCount === 6;
        }),
      ).toBe(true);
      expect(refreshed.hasNextPage).toBe(true);
      expect(refreshed.hasPreviousPage).toBe(false);
      const refreshRequests = harness.requests.slice(requestStart);
      expect(refreshRequests).toHaveLength(6);
      expect(refreshRequests[0]!.page.days).toEqual([]);
      expect(
        new URL(refreshRequests[1]!.path, "http://localhost").searchParams.has(
          "cursor",
        ),
      ).toBe(false);
      expect(refreshed.data!.pages[0]!.metadataUpdatedAt).toBe(
        refreshRequests[1]!.startedAt,
      );
      expect(snapshots.length).toBeGreaterThan(0);
      snapshots.forEach((snapshot) => {
        return expect(snapshot.params).toEqual(snapshot.actual);
      });
      const containingIndex = 2;
      const containingCursor = refreshed.data!.pageParams[containingIndex];
      const replayPath = `/api/timeline?tags=${new URL(refreshRequests[1]!.path, "http://localhost").searchParams.get("tags")}&until=2026-09-30&limit=1${containingCursor === null ? "" : `&cursor=${containingCursor}`}`;
      // Replay through the same authenticated transport and compare the actual containing day.
      const replayed = await fetch(replayPath).then((response) => {
        return response.json();
      });
      expect(replayed.days).toEqual(
        refreshed.data!.pages[containingIndex]!.days,
      );
      await harness.insert(28);
      const secondStart = harness.requests.length;
      await harness.observer.refetch();
      const second = harness.observer.getCurrentResult().data!;
      expect(second.pages[0]!.days[0]!.capturedOn).toBe("2026-09-28");
      expect(second.pageParams[0]).toBeNull();
      expect(harness.requests.slice(secondStart)).toHaveLength(5);
      expect(
        new URL(
          harness.requests[secondStart]!.path,
          "http://localhost",
        ).searchParams.has("cursor"),
      ).toBe(false);
      expect(second.pages).toHaveLength(5);
      const ids = second.pages.flatMap((page) => {
        return page.days.flatMap((day) => {
          return day.items.map((item) => {
            return item.itemId;
          });
        });
      });
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      await harness.close();
    }
  });
});
