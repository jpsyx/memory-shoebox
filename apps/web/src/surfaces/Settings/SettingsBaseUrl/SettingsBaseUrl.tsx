import { Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import { BaseUrlControls } from "@/surfaces/Settings/SettingsBaseUrl/BaseUrlControls";
import { useBaseUrlDraft } from "@/surfaces/Settings/SettingsBaseUrl/useBaseUrlDraft";
import { SettingsSaveNotice } from "@/surfaces/Settings/SettingsSaveNotice";
import { settingsFieldErrorCopy } from "@/surfaces/Settings/settingsFieldErrorCopy";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";

type Props = { baseUrl: string | null };

/** The public address used for links in invitations and other emails. */
export function SettingsBaseUrl({ baseUrl }: Readonly<Props>): ReactNode {
  const form = useBaseUrlDraft(baseUrl ?? "");
  return (
    <Sheet wide label="The address of this Shoebox">
      <SheetHead title="The address of this Shoebox" />
      <Stack gap="md">
        <TextInput
          type="url"
          label="Base URL"
          description="The full address people use to open this Shoebox, including https://. Used for links in invitations and other emails. Set up the new address before saving it here."
          autoCapitalize="none"
          spellCheck={false}
          value={form.draft}
          disabled={form.blocked}
          error={settingsFieldErrorCopy({
            error: form.mutation.error ?? undefined,
            field: "baseUrl",
          })}
          onChange={(event) => {
            form.onChange(event.currentTarget.value);
          }}
        />
        <BaseUrlControls form={form} />
        <SettingsSaveNotice field="baseUrl" />
      </Stack>
    </Sheet>
  );
}
