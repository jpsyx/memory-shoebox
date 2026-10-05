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
      <Prose>
        The photograph stays exactly as it is. If you would rather keep it but
        make it quieter, you can also change who can see it.
      </Prose>
      {href === undefined ? null : (
        <Prose>
          Open the photograph. Its Who can see this section contains the
          existing edit control. This request stays open.
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
