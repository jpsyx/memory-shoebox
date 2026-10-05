import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import { useSettingsReconciliation } from "@/surfaces/Settings/useSettingsReconciliation";
/**
 * A saved edit has a refresh-only recovery owner even after its form
 * unmounts.
 */
export function SettingsRecovery(): ReactNode {
  const recovery = useSettingsReconciliation();
  return recovery.hasCommitted ? (
    <Banner onPanel>
      <Stack gap="sm">
        <Text>
          The settings were saved. Refreshing the account and affected views.
        </Text>
        {recovery.error === undefined ? null : (
          <Text role="alert">{recovery.error.message}</Text>
        )}
        {recovery.error === undefined ? null : (
          <Button
            variant="panel"
            disabled={recovery.isRefreshing}
            onClick={recovery.onRetry}
          >
            Retry account refresh
          </Button>
        )}
      </Stack>
    </Banner>
  ) : null;
}
