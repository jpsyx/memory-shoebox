import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type {
  ListItemRemovalRequestsResponse,
  RemovalRequestDto,
} from "@memory-shoebox/shared";
import { z } from "zod";
import { itemRemovalRequestsQueryOptions } from "@/api/removals/removalsQueryHelpers";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import {
  useRemovalActions,
  type RemovalActions,
} from "@/surfaces/RemovalRequests/useRemovalActions/useRemovalActions";
import { useRemovalAsk, type RemovalAsk } from "../useRemovalAsk/useRemovalAsk";

type RemovalPageState = {
  isValidAddress: boolean;
  history: UseQueryResult<ListItemRemovalRequestsResponse, Error>;
  notice: string | undefined;
  confirmed: RemovalRequestDto | undefined;
  actions: RemovalActions;
  ask: RemovalAsk;
};

/** Isolates display and navigation callbacks for the keyed removal page. */
export function useRemovalPageState({
  itemId,
  viewer,
}: Readonly<{ itemId: string; viewer: Viewer }>): RemovalPageState {
  const isValidAddress = z.uuid().safeParse(itemId).success;
  const history = useQuery({
    ...itemRemovalRequestsQueryOptions({ memberId: viewer.memberId, itemId }),
    enabled: isValidAddress,
    retry: false,
  });
  const navigate = useNavigate();
  const isMounted = useRef(true);
  useEffect(function isolateRemovalPageCompletion() {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const [notice, setNotice] = useState<string>();
  const [confirmed, setConfirmed] = useState<RemovalRequestDto>();
  const actions = useRemovalActions({
    viewer,
    onRequestSettled: (request) => {
      if (isMounted.current) setConfirmed(request);
    },
    onItemDeleted: (deletedItemId) => {
      if (isMounted.current && deletedItemId === itemId)
        void navigate({
          to: "/removal-requests",
          state: { removalDeleted: true },
        });
    },
  });
  const ask = useRemovalAsk({
    memberId: viewer.memberId,
    itemId,
    onCreated: (request) => {
      setConfirmed(request);
      setNotice("Your request was recorded. Notifications were queued.");
    },
  });
  return { isValidAddress, history, notice, confirmed, actions, ask };
}
