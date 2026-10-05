import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { GroupReconciliationState } from "@/surfaces/Groups/useGroupReconciliation";
type Props = {
  reconciliation: GroupReconciliationState;
  message: string;
};

/**
 * Completed writes have a truthful status and an account-refresh-only recovery.
 */
export function GroupReconciliationNotice({
  reconciliation,
  message,
}: Readonly<Props>): ReactNode {
  return reconciliation.hasCommitted ? (
    <Stack gap="sm">
      <Text role="status">{message}</Text>
      {reconciliation.isRefreshing ? (
        <Text role="status">Refreshing your account before continuing…</Text>
      ) : null}
      {reconciliation.error === undefined ? null : (
        <>
          <Text role="alert">{reconciliation.error.message}</Text>
          <Text c="var(--on-print-quiet)">
            The change is saved. Refresh your account to continue.
          </Text>
          <Button
            variant="default"
            disabled={reconciliation.isRefreshing}
            onClick={reconciliation.onRetry}
          >
            Retry account refresh
          </Button>
        </>
      )}
    </Stack>
  ) : null;
}
