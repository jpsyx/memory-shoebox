import { Prose } from "@/system/typography/Prose";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { RemovalActionFeedback } from "../../RemovalActionFeedback";
import { getItemHrefFromRemovalRequest } from "../../removalCopyHelpers/removalCopyHelpers";
import type { RemovalActions } from "../../useRemovalActions/useRemovalActions";
import { DeclineRemovalControls } from "./DeclineRemovalControls";
import { DeclineRemovalField } from "./DeclineRemovalField";
type Props = {
  actions: RemovalActions;
  reason: string;
  onChangeReason: (reason: string) => void;
};
/** The required reply and a separate path to the existing visibility editor. */
export function DeclineRemovalContents({
  actions,
  reason,
  onChangeReason,
}: Readonly<Props>): ReactNode {
  const href =
    actions.target === undefined
      ? undefined
      : getItemHrefFromRemovalRequest(actions.target);
  return (
    <Stack gap="md">
      <DeclineRemovalField
        actions={actions}
        reason={reason}
        onChangeReason={onChangeReason}
      />
      <Prose>The photograph stays exactly as it is.</Prose>
      {href === undefined ? null : (
        <Prose>
          To change its audience, open the photograph and edit Who can see this.
          Changing its audience leaves this request open.
        </Prose>
      )}
      <RemovalActionFeedback
        actions={actions}
        pendingLabel="Sending your answer…"
      />
      <DeclineRemovalControls actions={actions} reason={reason} href={href} />
    </Stack>
  );
}
