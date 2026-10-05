import type { ReactNode } from "react";
import type { AdminGroupDto, AdminMemberDto } from "@memory-shoebox/shared";
import { GroupFormBody } from "@/surfaces/Groups/GroupForm/GroupFormBody/GroupFormBody";
import { useGroupForm } from "@/surfaces/Groups/GroupForm/useGroupForm";
type Props = {
  group?: AdminGroupDto;
  members: readonly AdminMemberDto[];
  onClose: () => void;
};

/** Inline creation owns its controlled draft. */
export function GroupForm({
  group,
  members,
  onClose,
}: Readonly<Props>): ReactNode {
  const form = useGroupForm({ group, onClose });
  return (
    <GroupFormBody
      form={form}
      members={members}
      isCreating={group === undefined}
      onClose={onClose}
    />
  );
}
