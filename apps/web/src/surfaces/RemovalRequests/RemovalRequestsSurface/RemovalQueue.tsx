import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { Prose } from "@/system/typography/Prose";
import { RemovalActionDialogs } from "../RemovalActionDialogs/RemovalActionDialogs";
import { useRemovalActions } from "../useRemovalActions/useRemovalActions";
import { RemovalQueueTabs } from "./RemovalQueueTabs";
import { useRemovalQueue } from "./useRemovalQueue";
type Props = { viewer: Viewer };

/** Independently cached tabs retain the server's counts and confirmed cards. */
export function RemovalQueue({ viewer }: Readonly<Props>): ReactNode {
  const actions = useRemovalActions({ viewer });
  const queue = useRemovalQueue(viewer.memberId);
  return (
    <>
      <Prose onPanel>
        Anybody tagged in a photograph can ask for it to be removed. The person
        who put it up hears about it and so does every admin, and either can
        act.
      </Prose>
      <RemovalQueueTabs queue={queue} viewer={viewer} actions={actions} />
      {actions.isPending ? (
        <Prose role="status" onPanel>
          Saving the answer…
        </Prose>
      ) : null}
      {actions.error === undefined || actions.dialog !== undefined ? null : (
        <Prose role="alert" onPanel>
          {actions.error}
        </Prose>
      )}
      <RemovalActionDialogs actions={actions} viewer={viewer} />
    </>
  );
}
