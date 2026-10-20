import type { UseQueryResult } from "@tanstack/react-query";
import type { ItemDetail } from "@memory-shoebox/shared";
import { idSchema } from "@memory-shoebox/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useLocation } from "@tanstack/react-router";
import { useMediaLoading } from "@/media/MediaLoadingContext";
import { useLayoutEffect, type ReactNode } from "react";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { itemQueryOptions } from "@/api/items/items";
import { useItemCommentDraftMemory } from "@/surfaces/Item/ItemConversation/ItemCommentDraftProvider/ItemCommentDraftProvider";
import { ItemTheaterHeader } from "../ItemTheater/ItemTheaterHeader";
import type { TheaterMode } from "../ItemTheater/useTheaterMode/useTheaterMode";
import type { VideoTransport } from "../ItemViewer/useVideoTransport";
import { mediaPositionQueryOptions } from "@/api/mediaPosition/mediaPosition";
import { getViewFromSearch } from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import { getNavigationSelectionFromView } from "@/media/getNavigationSelectionFromView";

import { ItemQueryContent } from "./ItemQueryContent";

type Props = {
  itemId: string;
  theater: TheaterMode;
  transport: VideoTransport;
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

function useDiscardDeniedItemDraft({
  itemId,
  isDenied,
}: Readonly<{
  itemId: string;
  isDenied: boolean;
}>): void {
  const { remove } = useItemCommentDraftMemory();
  useLayoutEffect(() => {
    if (isDenied) {
      remove(itemId);
    }
  }, [isDenied, itemId, remove]);
}

function useCurrentTheaterPosition({
  itemId,
  theater,
  memberId,
  isAuthorized,
}: Readonly<{
  itemId: string;
  theater: TheaterMode;
  memberId: string;
  isAuthorized: boolean;
}>) {
  const location = useLocation();
  const selection = getNavigationSelectionFromView({
    selection:
      location.state.itemNavigationSelection ?? getViewFromSearch({}).selection,
    at: undefined,
  });
  const enabled = theater.presentation === "theater" && isAuthorized;
  const query = useQuery({
    ...mediaPositionQueryOptions({ memberId, request: { itemId, selection } }),
    enabled,
  });
  return enabled && !query.isError ? query.data : undefined;
}

function useItemSurfaceState({
  itemId,
  theater,
  memberId,
}: Readonly<Props & { memberId: string }>) {
  const resources = useMediaLoading();
  const selectedPreview = resources.previews.read(itemId);
  const isWellFormed = idSchema.safeParse(itemId).success;
  const query = useSelectedItemDetail({ itemId, isWellFormed });

  const isNotHere =
    !isWellFormed ||
    (query.error instanceof ApiRequestError &&
      [404, 400].includes(query.error.status));
  useDiscardDeniedItemDraft({
    itemId,
    isDenied:
      isNotHere ||
      (query.error instanceof ApiRequestError && query.error.status === 403),
  });
  const isAuthorized =
    !isNotHere &&
    !query.isError &&
    !query.isPlaceholderData &&
    query.data?.itemId === itemId;
  const position = useCurrentTheaterPosition({
    itemId,
    theater,
    memberId,
    isAuthorized,
  });
  return { query, isNotHere, isAuthorized, position, selectedPreview };
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
export function ItemSurfaceContent({
  itemId,
  theater,
  transport,
}: Readonly<Props>): ReactNode {
  const { viewer, settings } = useRouteContext({ from: "/_app" });
  const { query, isNotHere, isAuthorized, position, selectedPreview } =
    useItemSurfaceState({
      itemId,
      theater,
      transport,
      memberId: viewer.memberId,
    });
  return (
    <>
      <ItemTheaterHeader
        theater={theater}
        detail={isAuthorized ? query.data : undefined}
        timezone={settings.timezone}
        position={position}
      />
      <ItemQueryContent
        theater={theater}
        transport={transport}
        query={query}
        isNotHere={isNotHere}
        selectedPreview={selectedPreview}
        viewer={viewer}
        timezone={settings.timezone}
      />
    </>
  );
}
