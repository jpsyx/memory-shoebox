import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { DeclineRemovalDialog } from "../DeclineRemovalDialog";
import { DeleteRemovalDialog } from "../DeleteRemovalDialog";
import type { RemovalActions } from "../useRemovalActions/useRemovalActions";
type Props = { actions: RemovalActions; viewer: Viewer };

/** Keeps modal shells mounted so Mantine can capture the opening trigger. */
export function RemovalActionDialogs({
  actions,
  viewer,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <DeleteRemovalDialog actions={actions} />
      <DeclineRemovalDialog key={viewer.memberId} actions={actions} />
    </>
  );
}
