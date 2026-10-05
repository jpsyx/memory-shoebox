import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { useGroupDeletion } from "@/surfaces/Groups/GroupDeleteDialog/useGroupDeletion";
import { GroupReconciliationNotice } from "@/surfaces/Groups/GroupReconciliationNotice";
import { GroupDeleteConsequences } from "@/surfaces/Groups/GroupDeleteDialog/GroupDeleteConsequences";
import { GroupDeleteControls } from "@/surfaces/Groups/GroupDeleteDialog/GroupDeleteControls";
/** Read, consent and write failures remain distinct and recoverable. */
export function GroupDeleteBody({
  deletion,
  onClose,
}: Readonly<{
  deletion: ReturnType<typeof useGroupDeletion>;
  onClose: () => void;
}>): ReactNode {
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
      <GroupReconciliationNotice
        reconciliation={deletion.mutation.reconciliation}
        message="The group has been deleted."
      />
      <GroupDeleteControls deletion={deletion} onClose={onClose} />
    </Stack>
  );
}
