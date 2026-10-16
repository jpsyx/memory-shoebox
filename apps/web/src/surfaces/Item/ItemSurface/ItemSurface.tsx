import type { UseQueryResult } from "@tanstack/react-query";
import type { ItemDetail } from "@memory-shoebox/shared";
import { idSchema } from "@memory-shoebox/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useMediaLoading } from "@/media/MediaLoadingContext";
import type { ReactNode } from "react";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { itemQueryOptions } from "@/api/items/items";
import { ItemFailed } from "@/surfaces/Item/ItemSurface/ItemFailed";
import { ItemLoading } from "@/surfaces/Item/ItemSurface/ItemLoading/ItemLoading";
import { ItemNotHere } from "@/surfaces/Item/ItemSurface/ItemNotHere";
import { ItemViewer } from "@/surfaces/Item/ItemViewer/ItemViewer";

type Props = {
  itemId: string;
};

function useSelectedItemDetail({
  itemId,
  isWellFormed,
}: {
  itemId: string;
  isWellFormed: boolean;
}): UseQueryResult<ItemDetail, Error> {
  const queryClient = useQueryClient();
  return useQuery({
    ...itemQueryOptions(itemId),
    enabled: isWellFormed,
    // Previous detail retains inert conversation controls while media changes.
    // After a failure, Try again returns to pending with no data, so the error
    // count prevents restoring the previous item during the retry.
    placeholderData: (previousDetail) => {
      const queryState = queryClient.getQueryState(
        itemQueryOptions(itemId).queryKey,
      );
      return (queryState?.errorUpdateCount ?? 0) > 0
        ? undefined
        : previousDetail;
    },
  });
}

/**
 * Surfaces 3 and 4, chosen between once the item has answered: a link cannot
 * know which kind it points at until then.
 *
 * **The fetch is here, never in a route loader**: every run of
 * `itemQueryOptions` counts an open, and a loader would run when a pointer so
 * much as rested on a link. An address that is not a UUID is not asked about
 * at all, since the answer can only be "not here".
 *
 * While detail loads, a cached preview supplies only the selected media.
 * Previous conversation controls stay inert until actual detail authorizes
 * the selected item. A refused read hides the preview; retry keeps the
 * original actual-detail semantics.
 */
export function ItemSurface({ itemId }: Readonly<Props>): ReactNode {
  const { viewer, settings } = useRouteContext({ from: "/_app" });
  const resources = useMediaLoading();
  const selectedPreview = resources.previews.read(itemId);
  const isWellFormed = idSchema.safeParse(itemId).success;
  const query = useSelectedItemDetail({ itemId, isWellFormed });

  if (
    !isWellFormed ||
    (query.error instanceof ApiRequestError &&
      [404, 400].includes(query.error.status))
  ) {
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
      <ItemLoading preview={selectedPreview} />
    );
  }
  return (
    <ItemViewer
      selectedPreview={selectedPreview}
      detail={query.data}
      isPlaceholder={query.isPlaceholderData}
      viewer={viewer}
      timezone={settings.timezone}
    />
  );
}
