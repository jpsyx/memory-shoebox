import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { RemovalRequestCard } from "@/surfaces/RemovalRequests/RemovalRequestCard/RemovalRequestCard";
import type { RemovalActions } from "@/surfaces/RemovalRequests/useRemovalActions/useRemovalActions";
import { Prose } from "@/system/typography/Prose";
type Props = {
  requests: readonly RemovalRequestDto[];
  viewer: Viewer;
  actions: RemovalActions;
};
/** Shows every scoped incoming ask beside the member's own history. */
export function RemovalIncomingRequests({
  requests,
  viewer,
  actions,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {requests.map((request) => {
        return (
          <RemovalRequestCard
            key={request.requestId}
            request={request}
            viewer={viewer}
            onDelete={actions.openDelete}
            onDecline={actions.openDecline}
          />
        );
      })}
      {viewer.role === "admin" && requests.length > 0 ? (
        <Prose onPanel>
          You are seeing these requests because you run the archive. The
          uploader can act too.
        </Prose>
      ) : null}
    </>
  );
}
