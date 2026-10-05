import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { RemovalActions } from "@/surfaces/RemovalRequests/useRemovalActions/useRemovalActions";
import { Prose } from "@/system/typography/Prose";
import type { ReactNode } from "react";
import { RemovalOwnHistory } from "../RemovalOwnHistory/RemovalOwnHistory";
import type { useRemovalContentsState } from "./useRemovalContentsState";
type Props = {
  timezone: string;
  state: ReturnType<typeof useRemovalContentsState>;
  viewer: Viewer;
  actions: RemovalActions;
  notice?: string;
};
/** Confirmations and own history precede either responsibility's actions. */
export function RemovalOwnSection({
  state,
  viewer,
  actions,
  notice,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {notice === undefined ? null : (
        <Prose onPanel role="status">
          {notice}
        </Prose>
      )}
      {state.own === undefined ? null : (
        <RemovalOwnHistory
          timezone={timezone}
          request={state.own}
          viewer={viewer}
          actions={actions}
          canAsk={state.canAsk && !state.hasOpenedForm}
          onAskAgain={state.openAskForm}
        />
      )}
    </>
  );
}
