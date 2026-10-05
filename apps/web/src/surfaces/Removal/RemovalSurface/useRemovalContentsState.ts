import { useState } from "react";
import type {
  ListItemRemovalRequestsResponse,
  RemovalRequestDto,
} from "@memory-shoebox/shared";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { RemovalActions } from "@/surfaces/RemovalRequests/useRemovalActions/useRemovalActions";
import {
  type RemovalView,
  getRemovalViewFromResponse,
  makeRemovalResponseFromConfirmedRequest,
} from "../removalStateHelpers/removalStateHelpers";
type Options = {
  response: ListItemRemovalRequestsResponse;
  confirmed?: RemovalRequestDto;
  viewer: Viewer;
  isRefreshing: boolean;
  actions: RemovalActions;
};
type RemovalContentsState = {
  own: RemovalRequestDto | undefined;
  canAsk: boolean;
  showForm: boolean;
  view: RemovalView;
  hasOpenedForm: boolean;
  openAskForm: () => void;
};
/**
 * Fresh-form selection is local, while fresh asking requires refreshed
 * authority.
 */
export function useRemovalContentsState({
  response,
  confirmed,
  viewer,
  isRefreshing,
  actions,
}: Readonly<Options>): RemovalContentsState {
  const [openedRequestId, setOpenedRequestId] = useState<string>();
  const view = getRemovalViewFromResponse({
    response:
      confirmed === undefined
        ? response
        : makeRemovalResponseFromConfirmedRequest({
            response,
            request: confirmed,
          }),
    viewer,
  });
  const own = view.ownOpen ?? view.ownNewest;
  const hasOpenedForm = own !== undefined && openedRequestId === own.requestId;
  const openAskForm = () => {
    setOpenedRequestId(own?.requestId);
  };
  const canAsk = view.canAsk && !isRefreshing && !actions.isPending;
  const showForm = view.canAsk && (own === undefined || hasOpenedForm);
  return { own, canAsk, showForm, view, hasOpenedForm, openAskForm };
}
