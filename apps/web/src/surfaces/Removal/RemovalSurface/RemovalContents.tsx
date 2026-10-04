import { Stack } from "@mantine/core";
import type {
  ListItemRemovalRequestsResponse,
  RemovalRequestDto,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { RemovalActions } from "@/surfaces/RemovalRequests/useRemovalActions/useRemovalActions";
import { RemovalActionFeedback } from "@/surfaces/RemovalRequests/RemovalActionFeedback";
import { RemovalOwnSection } from "./RemovalOwnSection";
import { RemovalAskSection } from "./RemovalAskSection";
import { RemovalIncomingRequests } from "./RemovalIncomingRequests";
import { RemovalItemPreview } from "../RemovalItemPreview/RemovalItemPreview";
import { useRemovalContentsState } from "./useRemovalContentsState";
import type { RemovalAsk } from "../useRemovalAsk/useRemovalAsk";
type Props = {
  response: ListItemRemovalRequestsResponse;
  confirmed?: RemovalRequestDto;
  viewer: Viewer;
  timezone: string;
  actions: RemovalActions;
  ask: RemovalAsk;
  notice?: string;
  isRefreshing: boolean;
};

/** History, fresh asking, and incoming answers remain visible together. */
export function RemovalContents({
  response,
  confirmed,
  viewer,
  timezone,
  actions,
  ask,
  notice,
  isRefreshing,
}: Readonly<Props>): ReactNode {
  const state = useRemovalContentsState({
    response,
    confirmed,
    viewer,
    isRefreshing,
    actions,
  });
  return (
    <Stack gap="lg">
      <RemovalItemPreview item={response.item} timezone={timezone} />
      <RemovalOwnSection
        state={state}
        viewer={viewer}
        actions={actions}
        notice={notice}
      />
      <RemovalAskSection
        item={response.item}
        ask={ask}
        showForm={state.showForm}
        isAuthorityPending={isRefreshing || actions.isPending}
        isUnavailable={state.own === undefined && !state.view.canAsk}
      />
      <RemovalIncomingRequests
        requests={state.view.incoming}
        viewer={viewer}
        actions={actions}
      />
      {actions.dialog === undefined ? (
        <RemovalActionFeedback
          actions={actions}
          pendingLabel="Updating your request…"
        />
      ) : null}
    </Stack>
  );
}
