import { idSchema } from "@memory-shoebox/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ApiRequestError } from "@/api/client/client";
import { itemQueryOptions } from "@/api/items/items";
import { ItemFailed } from "@/surfaces/Item/ItemSurface/ItemFailed";
import { ItemLoading } from "@/surfaces/Item/ItemSurface/ItemLoading";
import { ItemNotHere } from "@/surfaces/Item/ItemSurface/ItemNotHere";
import { ItemViewer } from "@/surfaces/Item/ItemViewer/ItemViewer";

type Props = {
  itemId: string;
};

/** Whether an answer means "not here": a 404, or a 400 for a malformed id. */
function _isNotHere(error: Error | null): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 404 || error.status === 400)
  );
}

/**
 * Surfaces 3 and 4, chosen between once the item has answered: a link cannot
 * know which kind it points at until then.
 *
 * **The fetch is here, never in a route loader** (decision 1): every run of
 * `itemQueryOptions` counts an open, and a loader would run when a pointer so
 * much as rested on a link. An address that is not a UUID is not asked about
 * at all, since the answer can only be "not here".
 *
 * While a sibling loads, the item before it stays drawn
 * (`placeholderData: keepPreviousData`), so the strip keeps keyboard focus
 * across the move (decision 5).
 */
export function ItemSurface({ itemId }: Readonly<Props>): ReactNode {
  const { viewer, settings } = useRouteContext({ from: "/_app" });
  const isWellFormed = idSchema.safeParse(itemId).success;
  const query = useQuery({
    ...itemQueryOptions(itemId),
    enabled: isWellFormed,
    placeholderData: keepPreviousData,
  });

  if (!isWellFormed || _isNotHere(query.error)) {
    return <ItemNotHere />;
  }
  if (query.data === undefined) {
    return query.isError ? (
      <ItemFailed
        onRetry={() => {
          void query.refetch();
        }}
      />
    ) : (
      <ItemLoading />
    );
  }
  return (
    <ItemViewer
      detail={query.data}
      viewer={viewer}
      timezone={settings.timezone}
    />
  );
}
