import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { ReactNode } from "react";
import type { RemovalActions } from "../useRemovalActions/useRemovalActions";
import { DeclineRemovalDialog } from "./DeclineRemovalDialog/DeclineRemovalDialog";
import { DeleteRemovalDialog } from "./DeleteRemovalDialog/DeleteRemovalDialog";
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
