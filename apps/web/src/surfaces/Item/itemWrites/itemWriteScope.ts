import type { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@/api/client/client";
import { itemQueryOptions } from "@/api/items/items";
import { TIMELINE_QUERY_KEY } from "@/api/timeline/timeline";

/**
 * The scope every write on one item shares, which serialises them.
 *
 * **Not a nicety.** Five of these writes answer with a whole `ItemDetail`
 * carrying that request's own snapshot of everything it did not change, and
 * each answer replaces the cache entry. Two close together could land out of
 * order and revert each other; TanStack Query sends a scoped mutation only
 * once the one before it has been applied. It does not delay an optimistic
 * reaction, because `onMutate` runs before the scope gates the request.
 * `docs/web.md` § Surface 9 records the same fix for `PATCH /api/me`.
 */
export function makeWriteScopeFromItemId(itemId: string): { id: string } {
  return { id: `item:${itemId}` };
}

/**
 * Every query outside the item itself whose answer an item write can change.
 */
const PILE_QUERY_KEYS = [
  TIMELINE_QUERY_KEY,
  ["filters"],
  ["tags"],
  ["people"],
  ["bursts"],
] as const;

/**
 * Marks the pile, its facets, its vocabularies and the burst fans stale,
 * without refetching any of them.
 *
 * None is mounted while the viewer is, so each refetches when somebody
 * returns to it and draws the new lock chip, the new day, the new tag or the
 * print that is no longer there.
 */
export function markPileStale(queryClient: QueryClient): void {
  PILE_QUERY_KEYS.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
  });
}

/**
 * Asks for the item once more when the server refused a write.
 *
 * A `403` means the viewer's rights changed under the page, and a `404` means
 * the item went or was hidden; either way the page is showing controls the
 * server will not honour, and one honest refetch is how they agree again
 * (decision 12). It counts one open, which is rare and true.
 */
export function refetchItemWhenRefused(
  options: Readonly<{
    queryClient: QueryClient;
    itemId: string;
    error: unknown;
  }>,
): void {
  const { error } = options;
  if (
    error instanceof ApiRequestError &&
    (error.status === 403 || error.status === 404)
  ) {
    void options.queryClient.refetchQueries({
      queryKey: itemQueryOptions(options.itemId).queryKey,
      exact: true,
    });
  }
}
