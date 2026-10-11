import { useQueryClient } from "@tanstack/react-query";
import { recheckMailHealth } from "@/api/mailHealth";
import { Button, Group, Loader } from "@mantine/core";
import type { MailHealthResponse } from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { TextSettingDraft } from "@/surfaces/Settings/useTextSettingDraft";
type Props = {
  form: TextSettingDraft;
  health: UseQueryResult<MailHealthResponse>;
};

/**
 * Saves the sender separately; the recheck reads diagnosis and sends no
 * email.
 */
export function MailControls({ form, health }: Readonly<Props>): ReactNode {
  const queryClient = useQueryClient();
  return (
    <Group>
      {form.isEdited ? (
        <Button
          disabled={form.blocked || form.draft.trim() === ""}
          loading={form.mutation.isPending}
          onClick={form.onSave}
        >
          Save sending address
        </Button>
      ) : null}
      <Button
        variant="default"
        disabled={form.blocked || health.isFetching}
        aria-busy={health.isFetching}
        leftSection={
          health.isFetching ? (
            <Loader size="xs" color="currentColor" aria-hidden="true" />
          ) : undefined
        }
        onClick={() => {
          void recheckMailHealth(queryClient).catch(() => {});
        }}
      >
        {health.isFetching ? "Checking mail health…" : "Recheck mail health"}
      </Button>
    </Group>
  );
}
