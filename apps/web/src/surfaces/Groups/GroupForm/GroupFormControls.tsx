import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { GroupFormState } from "@/surfaces/Groups/GroupForm/useGroupForm";
/** Pending submission prevents cancellation and duplicate writes. */
export function GroupFormControls({
  form,
  isCreating,
  onClose,
}: Readonly<{
  form: GroupFormState;
  isCreating: boolean;
  onClose: () => void;
}>): ReactNode {
  return (
    <Group>
      <Button type="submit" disabled={form.isPending}>
        {form.isPending ? "Saving…" : isCreating ? "Create the group" : "Save"}
      </Button>
      <Button variant="quiet" onClick={onClose} disabled={form.isPending}>
        Cancel
      </Button>
    </Group>
  );
}
