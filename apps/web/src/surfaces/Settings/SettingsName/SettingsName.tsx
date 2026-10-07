import { settingsFieldErrorCopy } from "@/surfaces/Settings/settingsFieldErrorCopy";
import { Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { SettingsSaveNotice } from "@/surfaces/Settings/SettingsSaveNotice";
import { useTextSettingDraft } from "@/surfaces/Settings/useTextSettingDraft";
import { NameControls } from "@/surfaces/Settings/SettingsName/NameControls";
type Props = { name: string };

/** The instance name is a draft until explicitly saved. */
export function SettingsName({ name }: Readonly<Props>): ReactNode {
  const form = useTextSettingDraft({ initialValue: name, field: "name" });
  return (
    <Sheet wide label="The name of this Shoebox">
      <SheetHead title="The name of this Shoebox" />
      <Stack gap="md">
        <TextInput
          label="Shoebox name"
          description="Shown in the top bar, in every email, and on the sign-in page."
          value={form.draft}
          disabled={form.blocked}
          error={settingsFieldErrorCopy({
            error: form.mutation.error ?? undefined,
            field: "name",
          })}
          onChange={(event) => {
            form.onChange(event.currentTarget.value);
          }}
        />
        <NameControls form={form} />
        <SettingsSaveNotice field="name" />
      </Stack>
    </Sheet>
  );
}
