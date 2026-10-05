import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { RemovalRequestCard } from "@/surfaces/RemovalRequests/RemovalRequestCard/RemovalRequestCard";
import type { RemovalActions } from "@/surfaces/RemovalRequests/useRemovalActions/useRemovalActions";
import { Prose } from "@/system/typography/Prose";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = {
  timezone: string;
  requests: RemovalRequestDto[];
  viewer: Viewer;
  actions: RemovalActions;
};
/** Shows every scoped incoming ask beside the member's own history. */
export function RemovalIncomingRequests({
  requests,
  viewer,
  actions,
  timezone,
}: Readonly<
  Omit<Props, "requests"> & { requests: readonly RemovalRequestDto[] }
>): ReactNode {
  return (
    <>
      {requests.map((request) => {
        return (
          <RemovalRequestCard
            timezone={timezone}
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
