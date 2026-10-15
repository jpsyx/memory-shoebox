import { Link } from "@tanstack/react-router";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { RemovalActions } from "../../useRemovalActions/useRemovalActions";
type Props = {
  actions: RemovalActions;
  reason: string;
  href: string | undefined;
};
/** The visibility link does not settle the open request. */
export function DeclineRemovalControls({
  actions,
  reason,
  href,
}: Readonly<Props>): ReactNode {
  const itemId = actions.target?.itemId;
  return (
    <ChipRow>
      <Button
        onClick={() => {
          actions.confirmDecline(reason);
        }}
        disabled={actions.isPending || !actions.target?.canDecline}
        loading={actions.isPending}
      >
        Send this and keep it
      </Button>
      <Button
        variant="default"
        onClick={actions.close}
        disabled={actions.isPending}
      >
        Cancel
      </Button>
      {href === undefined || !itemId || actions.isPending ? null : (
        <Button
          renderRoot={(props) => {
            return <Link {...props} to="/items/$itemId" params={{ itemId }} />;
          }}
          variant="default"
        >
          Change who can see it instead
        </Button>
      )}
    </ChipRow>
  );
}
