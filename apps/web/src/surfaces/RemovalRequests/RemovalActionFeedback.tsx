import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import type { RemovalActions } from "./useRemovalActions/useRemovalActions";
type Props = { actions: RemovalActions; pendingLabel: string };
/** Announces write progress and actionable errors in either answer dialog. */
export function RemovalActionFeedback({
  actions,
  pendingLabel,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {actions.error === undefined ? null : (
        <Prose role="alert">{actions.error}</Prose>
      )}
      {actions.isPending ? <Prose role="status">{pendingLabel}</Prose> : null}
    </>
  );
}
