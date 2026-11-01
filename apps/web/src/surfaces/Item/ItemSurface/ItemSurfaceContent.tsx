import { useConversationJourney } from "@/session/ConversationJourneyProvider/ConversationJourneyProvider";
import type { QueryClient, UseQueryResult } from "@tanstack/react-query";
import type { ItemDetail } from "@memory-shoebox/shared";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
} from "@/api/me/privateQueryHelpers";
import { apiFetch, ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { idSchema, itemDetailSchema } from "@memory-shoebox/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useLocation } from "@tanstack/react-router";
import { useMediaLoading } from "@/media/MediaLoadingContext";
import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
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

type ItemEntry = {
  itemId: string;
  journey: ReturnType<typeof useConversationJourney>;
  active: boolean;
  authorized: boolean;
  ticket: ReturnType<typeof capturePrivateAuthority>;
};
function useSelectedItemDetail({
  itemId,
  isWellFormed,
}: Readonly<{ itemId: string; isWellFormed: boolean }>): UseQueryResult<
  ItemDetail,
  Error
> & { isEntryAuthorized: boolean } {
  const queryClient = useQueryClient();
  const authority = useItemEntryAuthority(itemId, queryClient);
  const query = useQuery({
    ...itemQueryOptions(itemId),
    queryFn: authority.read,
    enabled: isWellFormed,
    // Only previous-item detail can remain as an inert transition placeholder.
    placeholderData: (previousDetail) => {
      const state = queryClient.getQueryState(
        itemQueryOptions(itemId).queryKey,
      );
      return (state?.errorUpdateCount ?? 0) > 0 ||
        previousDetail?.itemId === itemId
        ? undefined
        : previousDetail;
    },
  });
  return { ...query, isEntryAuthorized: authority.isEntryAuthorized };
}
function useItemEntryAuthority(itemId: string, client: QueryClient) {
  const journey = useConversationJourney();
  const entry = useMemo<ItemEntry>(() => {
    return {
      itemId,
      journey,
      active: true,
      authorized: false,
      ticket: capturePrivateAuthority(client),
    };
  }, [itemId, client, journey]);
  const [, redraw] = useState(0);
  useLayoutEffect(() => {
    entry.active = true;
    return () => {
      entry.active = false;
      void client.cancelQueries({
        queryKey: ["items", entry.itemId],
        exact: true,
      });
    };
  }, [entry, client]);
  return {
    isEntryAuthorized:
      entry.authorized &&
      entry.active &&
      isPrivateAuthorityCurrent(client, entry.ticket),
    read: async ({ signal }: { signal: AbortSignal }) => {
      const detail = await apiFetch({
        path: `/items/${encodeURIComponent(entry.itemId)}`,
        schema: itemDetailSchema,
        init: { signal },
      });
      if (
        entry.active &&
        !signal.aborted &&
        isPrivateAuthorityCurrent(client, entry.ticket)
      ) {
        entry.authorized = true;
        redraw((version) => {
          return version + 1;
        });
      }
      return detail;
    },
  };
}

function useDiscardDeniedItemDraft({
  itemId,
  isDenied,
}: Readonly<{
  itemId: string;
  isDenied: boolean;
}>): void {
  const { retireItem } = useItemCommentDraftMemory();
  useLayoutEffect(() => {
    if (isDenied) {
      retireItem(itemId);
    }
  }, [isDenied, itemId, retireItem]);
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
    query.isEntryAuthorized &&
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
        isAwaitingAuthorization={
          !query.isEntryAuthorized && !query.isPlaceholderData
        }
        selectedPreview={selectedPreview}
        viewer={viewer}
        timezone={settings.timezone}
      />
    </>
  );
}
