import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { TextSettingDraft } from "@/surfaces/Settings/useTextSettingDraft";
type Props = { form: TextSettingDraft };

/**
 * Save and Cancel appear only for a name that differs from its saved
 * baseline.
 */
export function NameControls({ form }: Readonly<Props>): ReactNode {
  return form.isEdited ? (
    <Group>
      <Button
        disabled={form.blocked || form.draft.trim() === ""}
        loading={form.mutation.isPending}
        onClick={form.onSave}
      >
        Save the new name
      </Button>
      <Button variant="default" disabled={form.blocked} onClick={form.onCancel}>
        Cancel
      </Button>
    </Group>
  ) : null;
}
