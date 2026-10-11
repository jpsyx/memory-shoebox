import { settingsFieldErrorCopy } from "@/surfaces/Settings/settingsFieldErrorCopy";
import { Stack, TextInput } from "@mantine/core";
import type { MailHealthResponse } from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { SettingsSaveNotice } from "@/surfaces/Settings/SettingsSaveNotice";
import { useTextSettingDraft } from "@/surfaces/Settings/useTextSettingDraft";
import { MailControls } from "@/surfaces/Settings/SettingsMail/MailControls";
import { MailHealthNotice } from "@/surfaces/Settings/SettingsMail/MailHealthNotice";
type Props = {
  fromAddress: string | undefined;
  health: UseQueryResult<MailHealthResponse>;
  timezone: string;
};

/** The drawn sender address and an honest read of the mail dependency. */
export function SettingsMail({
  fromAddress = "",
  health,
  timezone,
}: Readonly<Props>): ReactNode {
  const form = useTextSettingDraft({
    initialValue: fromAddress,
    field: "sender",
  });
  return (
    <Sheet wide label="Where the mail comes from">
      <SheetHead title="Where mail comes from" />
      <Stack gap="md">
        <TextInput
          type="email"
          label="Sending address"
          description="Resend needs this domain verified before it will send anything."
          value={form.draft}
          disabled={form.blocked}
          error={settingsFieldErrorCopy({
            error: form.mutation.error ?? undefined,
            field: "sender",
          })}
          onChange={(event) => {
            form.onChange(event.currentTarget.value);
          }}
        />
        <MailControls form={form} health={health} />
        <SettingsSaveNotice field="sender" />
        <MailHealthNotice health={health} timezone={timezone} />
      </Stack>
    </Sheet>
  );
}
