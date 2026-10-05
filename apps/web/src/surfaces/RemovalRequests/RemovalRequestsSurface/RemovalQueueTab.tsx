import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { Banner } from "@/system/Chrome/Banner";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { RemovalRequestCard } from "../RemovalRequestCard/RemovalRequestCard";
import type { RemovalActions } from "../useRemovalActions/useRemovalActions";
import {
  getRequestsFromQueuePages,
  hasRepeatedQueueCursor,
  type RemovalQueueQuery,
} from "./removalQueueHelpers";
import { RemovalQueueMore } from "./RemovalQueueMore";
import { RemovalQueueReadState } from "./RemovalQueueReadState";
import { useQueueContinuation } from "./useQueueContinuation";
type Props = {
  timezone: string;
  query: RemovalQueueQuery;
  state: "open" | "settled";
  viewer: Viewer;
  actions: RemovalActions;
};

/** Empty advancing pages continue; repeated cursors stop with recovery copy. */
export function RemovalQueueTab({
  query,
  state,
  viewer,
  actions,
  timezone,
}: Readonly<Props>): ReactNode {
  useQueueContinuation(query);
  const pages = query.data?.pages ?? [];
  const requests = getRequestsFromQueuePages(pages);
  const hasRepeatedCursor = hasRepeatedQueueCursor({
    nextCursor: pages.at(-1)?.nextCursor ?? undefined,
    pageParams: query.data?.pageParams ?? [],
  });
  return (
    <Stack gap="md">
      {state === "open" ? (
        <Banner onPanel>
          A request that nobody answers stays here. It does not expire. The
          reminder email goes out weekly until somebody acts.
        </Banner>
      ) : null}
      <RemovalQueueReadState
        query={query}
        state={state}
        hasRepeatedCursor={hasRepeatedCursor}
        numRequests={requests.length}
      />
      {requests.map((request) => {
        return (
          <RemovalRequestCard
            timezone={timezone}
            key={request.requestId}
            request={request}
            viewer={viewer}
            onDelete={actions.openDelete}
            onDecline={actions.openDecline}
            onWithdraw={actions.withdraw}
          />
        );
      })}
      <RemovalQueueMore query={query} />
    </Stack>
  );
}
