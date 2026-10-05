import type { ReactNode } from "react";
import type { AdminGroupDto, AdminMemberDto } from "@memory-shoebox/shared";
import { GroupFormBody } from "@/surfaces/Groups/GroupForm/GroupFormBody";
import { useGroupForm } from "@/surfaces/Groups/GroupForm/useGroupForm";
/** Inline creation owns its controlled draft. */
export function GroupForm({
  group,
  members,
  onClose,
}: Readonly<{
  group?: AdminGroupDto;
  members: readonly AdminMemberDto[];
  onClose: () => void;
}>): ReactNode {
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
