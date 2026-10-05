import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useMemberContinuationGate } from "@/surfaces/Members/useMemberContinuationGate";
import { useMemberReconciliation } from "@/surfaces/Members/useMemberReconciliation";
import { Sheet } from "@/system/Chrome/Sheet";

/** Saved member changes offer a read-only recovery, including after navigation. */
export function MemberRecovery(): ReactNode {
  const state = useMemberContinuationGate();
  const refresh = useMemberReconciliation();
  return state.hasCommitted ? (
    <Sheet wide label="Saved member change">
      <Stack gap="sm">
        <Text role="status">
          The change is saved. Refresh your account to continue.
        </Text>
        {state.error === null ? (
          <Text>Refreshing your account…</Text>
        ) : (
          <>
            <Text role="alert">{state.error.message}</Text>
            <Button
              variant="default"
              disabled={state.isRefreshing}
              onClick={() => {
                void refresh();
              }}
            >
              Refresh your account
            </Button>
          </>
        )}
      </Stack>
    </Sheet>
  ) : null;
}
