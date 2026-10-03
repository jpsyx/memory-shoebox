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
 * reaction, because `onMutate` runs before the scope gates the request, so
 * an earlier write's answer can land on top of a tap; `useConversation.ts`
 * says how the tap survives it. `docs/web.md` § Surface 9 records the same
 * fix for `PATCH /api/me`.
 *
 * **Every write here also carries a `mutationKey` naming its ids.** A
 * re-render hands its options, this scope and the request included, to the
 * mutation still pending, unless the key has changed. The viewer moves along
 * a burst without remounting, so without the ids in the key a write queued
 * on one item would be sent to the next.
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
 * `refetchType: "none"` means nothing refetches now, not even a vocabulary
 * an open editor is reading. Each refetches when it is next mounted, which is
 * how the pile draws the new lock chip, the new day, the new tag or the print
 * that is no longer there once somebody returns to it.
 */
export function markPileStale(queryClient: QueryClient): void {
  PILE_QUERY_KEYS.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
  });
}

/**
 * Asks for the item once more when the server refused a write, while the
 * page is still showing it.
 *
 * A `403` means the viewer's rights changed under the page, and a `404` means
 * the item went or was hidden; either way the page is showing controls the
 * server will not honour, and one honest refetch is how they agree again.
 * It counts one open, which is rare and true.
 *
 * Only while something observes the item (`type: "active"`), because a
 * refusal that lands after the viewer has left would count an open nobody
 * made. Never on top of a read already out (`cancelRefetch: false`), because
 * the read on arriving is already the catching up, and cancelling it for a
 * fresh one would count the open twice.
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
    void options.queryClient.refetchQueries(
      {
        queryKey: itemQueryOptions(options.itemId).queryKey,
        exact: true,
        type: "active",
      },
      { cancelRefetch: false },
    );
  }
}
