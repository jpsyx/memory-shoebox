import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import { Button, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { RemovalActionFeedback } from "../../RemovalActionFeedback";
import type { RemovalActions } from "../../useRemovalActions/useRemovalActions";
type Props = { actions: RemovalActions };
/** Names destruction and its private notifications before confirmation. */
export function DeleteRemovalContents({ actions }: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      <Prose>
        The photograph and its file both go permanently, along with anything
        written on it.{" "}
        {actions.target?.requestedBy.displayName ?? "The person who asked"} and{" "}
        {actions.target?.uploadedBy.displayName ?? "the uploader"} are notified
        according to their mail preferences. Nobody else is told.
      </Prose>
      <RemovalActionFeedback
        actions={actions}
        pendingLabel="Deleting the photograph…"
      />
      <ChipRow>
        <Button
          variant="danger"
          onClick={actions.confirmDelete}
          loading={actions.isPending}
          disabled={actions.isPending || !actions.target?.canDeleteItem}
        >
          Delete it
        </Button>
        <Button
          variant="default"
          onClick={actions.close}
          disabled={actions.isPending}
        >
          Cancel
        </Button>
      </ChipRow>
    </Stack>
  );
}
