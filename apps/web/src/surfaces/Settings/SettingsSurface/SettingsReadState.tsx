import { Button, Stack } from "@mantine/core";
import type { GetSettingsResponse } from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
type Props = { settings: UseQueryResult<GetSettingsResponse> };

/**
 * Settings read faults can be retried without changing a draft or saved
 * result.
 */
export function SettingsReadState({ settings }: Readonly<Props>): ReactNode {
  return (
    <Stack gap="sm">
      <Prose onPanel role={settings.error === null ? "status" : "alert"}>
        {settings.error?.message ?? "Reading Shoebox settings…"}
      </Prose>
      {settings.error === null ? null : (
        <Button
          variant="panel"
          disabled={settings.isFetching}
          onClick={() => {
            void settings.refetch();
          }}
        >
          Retry settings
        </Button>
      )}
    </Stack>
  );
}
