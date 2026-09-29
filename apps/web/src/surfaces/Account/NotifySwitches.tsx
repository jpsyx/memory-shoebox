import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { NotifyPreferences } from "@memory-shoebox/shared";
import { NotifyRow } from "@/surfaces/Account/NotifyRow";
import { NOTIFY_KINDS } from "@/surfaces/Account/notifyKinds";

/** Props for the four switches: the server's answer, and where a flip goes. */
type Props = {
  notify: NotifyPreferences;
  isSaving: boolean;
  onSave: (notify: NotifyPreferences) => void;
};

/**
 * The four switches, stacked, each write sending the whole `notify` with one
 * key changed. Lifted out of `EmailSheet` alongside `NotifyRow`, so the sheet
 * itself reads as its sections rather than as the loop that fills one of them.
 */
export function NotifySwitches({
  notify,
  isSaving,
  onSave,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="sm">
      {NOTIFY_KINDS.map((kind) => {
        return (
          <NotifyRow
            key={kind.key}
            kind={kind}
            checked={notify[kind.key]}
            disabled={isSaving}
            onChange={(checked) => {
              onSave({ ...notify, [kind.key]: checked });
            }}
          />
        );
      })}
    </Stack>
  );
}
