import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  renderHook,
  waitFor,
  type RenderHookResult,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { expect } from "vitest";
import type { ItemDetail } from "@memory-shoebox/shared";
import { itemQueryOptions } from "@/api/items/items";
import { callQueryFn } from "@/testing/callQueryFn";
import { ITEM_ID, makeItemDetail } from "@/testing/itemFixtureHelpers";

/**
 * What the item page's write hooks are tested with: a client already holding
 * the item, a render of a hook against it, and the waits around a write.
 *
 * In `testing/` because each write hook's own suite needs them, and a helper
 * reached across several hook folders belongs to none of them.
 */

/** A promise a test lets go of when it chooses, to hold one answer open. */
export function makeHold(): { hold: Promise<void>; letGo: () => void } {
  let letGo = () => {};
  const hold = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  return { hold, letGo };
}

/**
 * A client holding one item, as if the page had already opened it.
 *
 * The defaults go in first, so the cached entry has the query function the
 * page's own `useQuery` would have given it: an entry made by `setQueryData`
 * alone has none, and a refetch of it would fail without sending anything.
 */
export function makeQueryClientFromItemDetail(
  detail: Readonly<ItemDetail> = makeItemDetail(),
): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const options = itemQueryOptions(detail.itemId);
  queryClient.setQueryDefaults(options.queryKey, {
    queryFn: () => {
      return callQueryFn(options);
    },
  });
  queryClient.setQueryData(options.queryKey, detail);
  return queryClient;
}

/** Renders a hook against one client. */
export function renderHookWithQueryClient<T>(
  options: Readonly<{ useHook: () => T; queryClient: QueryClient }>,
): RenderHookResult<T, unknown> {
  return renderHook(options.useHook, {
    wrapper: ({ children }: Readonly<{ children: ReactNode }>) => {
      return (
        <QueryClientProvider client={options.queryClient}>
          {children}
        </QueryClientProvider>
      );
    },
  });
}

/** What the client holds for the item every test opens, now. */
export function getCachedItemFromQueryClient(
  queryClient: QueryClient,
): ItemDetail | undefined {
  return queryClient.getQueryData(itemQueryOptions(ITEM_ID).queryKey);
}

/** Waits until every write has settled, its answer applied or refused. */
export async function waitForWritesToSettle(
  queryClient: QueryClient,
): Promise<void> {
  await waitFor(() => {
    expect(queryClient.isMutating()).toBe(0);
  });
}
