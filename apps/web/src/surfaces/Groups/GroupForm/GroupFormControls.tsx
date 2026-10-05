import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { GroupFormState } from "@/surfaces/Groups/GroupForm/useGroupForm";
type Props = {
  form: GroupFormState;
  isCreating: boolean;
  onClose: () => void;
};

/** Pending submission prevents cancellation and duplicate writes. */
export function GroupFormControls({
  form,
  isCreating,
  onClose,
}: Readonly<Props>): ReactNode {
  return (
    <Group>
      <Button type="submit" disabled={form.isBlocked}>
        {form.isPending ? "Saving…" : isCreating ? "Create the group" : "Save"}
      </Button>
      <Button variant="default" onClick={onClose} disabled={form.isBlocked}>
        Cancel
      </Button>
    </Group>
  );
}
