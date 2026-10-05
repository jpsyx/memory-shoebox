import { Textarea } from "@mantine/core";
import type { ReactNode } from "react";
import type { RemovalActions } from "../../useRemovalActions/useRemovalActions";
type Props = {
  actions: RemovalActions;
  reason: string;
  onChangeReason: (reason: string) => void;
};
/** Labeled own words with wire limits and field-addressed validation. */
export function DeclineRemovalField({
  actions,
  reason,
  onChangeReason,
}: Readonly<Props>): ReactNode {
  return (
    <Textarea
      data-autofocus
      label={`What ${actions.target?.requestedBy.displayName ?? "they"} will read`}
      description="This is required. A request answered with silence turns into a phone call."
      value={reason}
      onChange={(event) => {
        onChangeReason(event.currentTarget.value);
      }}
      maxLength={4000}
      disabled={actions.isPending}
      error={actions.fieldErrors.declineReason?.join(" ")}
      autosize
      minRows={4}
    />
  );
}
