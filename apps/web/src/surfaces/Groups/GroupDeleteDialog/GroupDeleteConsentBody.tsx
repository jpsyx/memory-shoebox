import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { GroupDeletionState } from "@/surfaces/Groups/GroupDeleteDialog/useGroupDeletion";
import { GroupDeleteConsequences } from "@/surfaces/Groups/GroupDeleteDialog/GroupDeleteConsequences";
import { GroupDeleteControls } from "@/surfaces/Groups/GroupDeleteDialog/GroupDeleteControls";
type Props = { deletion: GroupDeletionState; onClose: () => void };

/** Pending deletion retains its usage, consent and real request failures. */
export function GroupDeleteConsentBody({
  deletion,
  onClose,
}: Readonly<Props>): ReactNode {
  const isPending = deletion.mutation.isPending;
  return (
    <Stack gap="md">
      {deletion.read.isPending ? (
        <Text role="status">Checking where this group is used…</Text>
      ) : null}
      {deletion.read.error === null ? null : (
        <Text role="alert">{deletion.read.error.message}</Text>
      )}
      {deletion.needsConfirmation ? (
        <Text role="alert">
          Usage changed. Review these consequences and confirm again.
        </Text>
      ) : null}
      {deletion.usage === undefined ? null : (
        <GroupDeleteConsequences usage={deletion.usage} />
      )}
      {deletion.mutation.error === null ? null : (
        <Text role="alert">{deletion.mutation.error.message}</Text>
      )}
      {deletion.read.isError ||
      (deletion.needsConfirmation && deletion.usage === undefined) ? (
        <Button
          variant="default"
          onClick={deletion.onRetry}
          disabled={isPending}
        >
          Retry
        </Button>
      ) : null}
      <GroupDeleteControls deletion={deletion} onClose={onClose} />
    </Stack>
  );
}
