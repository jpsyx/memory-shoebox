import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import type { RemovalActions } from "./useRemovalActions/useRemovalActions";
type Props = {
  actions: RemovalActions;
  pendingLabel: string;
  onPanel?: boolean;
};
/** Announces write progress and actionable errors in either answer dialog. */
export function RemovalActionFeedback({
  actions,
  pendingLabel,
  onPanel = false,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {actions.error === undefined ? null : (
        <Prose role="alert" onPanel={onPanel}>
          {actions.error}
        </Prose>
      )}
      {actions.isPending ? (
        <Prose role="status" onPanel={onPanel}>
          {pendingLabel}
        </Prose>
      ) : null}
    </>
  );
}
