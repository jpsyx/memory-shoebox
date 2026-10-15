import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { makeDay, makeItem } from "../../timelineFixtures";
import { getTimelineRowsFromDays } from "../getTimelineRowsFromDays/getTimelineRowsFromDays";
import { useTimelineFocus } from "./useTimelineFocus";

it("keeps a focused row's node identity and bounded snapshot through regrouping and eviction", () => {
  const day = makeDay({
    items: Array.from({ length: 12 }, (_, index) => {
      return makeItem({ itemId: `item-${index}` });
    }),
  });
  const original = getTimelineRowsFromDays({ days: [day], columns: 3 });
  const hook = renderHook(
    ({ rows }) => {
      return useTimelineFocus(rows, "view", 0);
    },
    {
      initialProps: { rows: original },
    },
  );
  act(() => {
    return hook.result.current.onFocus("item-4");
  });
  const pinned = hook.result.current.rows.find((row) => {
    return row.itemIds.includes("item-4");
  })!;
  const focusedRows = hook.result.current.rows;
  hook.rerender({ rows: original });
  expect(hook.result.current.rows).toBe(focusedRows);
  hook.rerender({ rows: getTimelineRowsFromDays({ days: [day], columns: 8 }) });
  expect(
    hook.result.current.rows.flatMap((row) => {
      return row.itemIds;
    }),
  ).toEqual(
    day.items.map((item) => {
      return item.itemId;
    }),
  );
  expect(
    hook.result.current.rows.find((row) => {
      return row.itemIds.includes("item-4");
    }),
  ).toBe(pinned);
  hook.rerender({ rows: [] });
  expect(hook.result.current.rows).toHaveLength(1);
  expect(hook.result.current.rows[0]!.day.items).toHaveLength(3);
  act(() => {
    return hook.result.current.onBlur();
  });
  expect(hook.result.current.rows).toHaveLength(0);
});

it("retires a focused private snapshot on authoritative publication after directional paging", async () => {
  const { QueryClient, QueryClientProvider, InfiniteQueryObserver } =
    await import("@tanstack/react-query");
  const client = new QueryClient();
  const queryKey = ["timeline", "member", "view"];
  const rows = getTimelineRowsFromDays({ days: [makeDay()], columns: 3 });
  const options = {
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      return {
        cursor: pageParam,
      };
    },
    getNextPageParam: (page: { cursor: number }) => {
      return page.cursor + 1;
    },
    maxPages: 5,
  };
  await client.fetchInfiniteQuery(options);
  const observer = new InfiniteQueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  const hook = renderHook(
    () => {
      return useTimelineFocus(rows, JSON.stringify(queryKey), 0);
    },
    {
      wrapper: ({ children }) => {
        return (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );
      },
    },
  );
  act(() => {
    return hook.result.current.onFocus(rows[1]!.itemIds[0]);
  });
  await act(async () => {
    await observer.fetchNextPage();
  });
  expect(hook.result.current.focusedItemId).toBeDefined();
  act(() => {
    client.setQueryData(queryKey, { pages: [{ cursor: 0 }], pageParams: [0] });
  });
  expect(hook.result.current.focusedItemId).toBeUndefined();
  unsubscribe();
  client.clear();
});
