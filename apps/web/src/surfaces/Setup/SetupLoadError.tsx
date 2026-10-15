import { useQueryClient } from "@tanstack/react-query";
import {
  SETTINGS_RECOVERY_KEY,
  type SettingsSnapshot,
} from "@/surfaces/Settings/useSettingsSnapshot";
import {
  GROUP_CONTINUATION_QUERY_KEY,
  type GroupReconciliationSnapshot,
} from "@/surfaces/Groups/useGroupReconciliationSnapshot";
import { Centred } from "@/system/Chrome/Centred";
import { Sheet } from "@/system/Chrome/Sheet";
import { Lede } from "@/system/typography/Lede";
import { Button, Stack, Text } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Initialization failure is an explicit retry, never assumed availability. */
export function SetupLoadError(): ReactNode {
  const router = useRouter();
  const client = useQueryClient();
  const settings = client.getQueryData<SettingsSnapshot>(SETTINGS_RECOVERY_KEY);
  const group = client.getQueryData<GroupReconciliationSnapshot>(
    GROUP_CONTINUATION_QUERY_KEY,
  );
  const savedMessage = settings?.hasCommitted
    ? settings.message
    : group?.hasCommitted
      ? group.message
      : undefined;
  return (
    <Centred>
      <Sheet>
        <Stack>
          <Lede>Could not open this Shoebox.</Lede>
          {savedMessage ? <Text role="status">{savedMessage}</Text> : null}
          <Text>
            {savedMessage
              ? "We could not refresh your account. Your saved change will not be sent again."
              : "We could not check whether it is ready. Try again when the connection is back."}
          </Text>
          <Button
            onClick={() => {
              void router.invalidate();
            }}
          >
            {savedMessage ? "Retry account refresh" : "Try again"}
          </Button>
        </Stack>
      </Sheet>
    </Centred>
  );
}
