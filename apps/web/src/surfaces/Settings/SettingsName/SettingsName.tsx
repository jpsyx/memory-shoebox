import { settingsFieldErrorCopy } from "@/surfaces/Settings/settingsFieldErrorCopy";
import { Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import { SettingsSaveNotice } from "@/surfaces/Settings/SettingsSaveNotice";
import { useTextSettingDraft } from "@/surfaces/Settings/useTextSettingDraft";
import { NameControls } from "@/surfaces/Settings/SettingsName/NameControls";
/** The instance name is a draft until explicitly saved. */
export function SettingsName({ name }: Readonly<{ name: string }>): ReactNode {
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
          error={settingsFieldErrorCopy(form.mutation.error, "name")}
          onChange={(event) => {
            form.onChange(event.currentTarget.value);
          }}
        />
        <Prose>
          It starts as <b>My Shoebox</b> and is meant to be changed. Call it
          whatever the family calls it: the Sarmiento shoebox, Mateo, Abuela's
          wall. Members see this name and almost never see the software's own,
          because they are visiting their family's archive rather than a product
          they signed up to.
        </Prose>
        <NameControls form={form} />
        <SettingsSaveNotice field="name" />
      </Stack>
    </Sheet>
  );
}
