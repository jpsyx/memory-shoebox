import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { TextSettingDraft } from "@/surfaces/Settings/useTextSettingDraft";

type Props = { form: TextSettingDraft };

/** Saves a changed URL explicitly or restores its saved baseline. */
export function BaseUrlControls({ form }: Readonly<Props>): ReactNode {
  return form.isEdited ? (
    <Group>
      <Button
        disabled={form.blocked || form.draft.trim() === ""}
        loading={form.mutation.isPending}
        onClick={form.onSave}
      >
        Save base URL
      </Button>
      <Button variant="default" disabled={form.blocked} onClick={form.onCancel}>
        Cancel
      </Button>
    </Group>
  ) : null;
}
