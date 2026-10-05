import { NativeSelect } from "@mantine/core";
import type { MemberRole } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { ROLE_OPTIONS } from "@/surfaces/Members/memberCopyHelpers";
import { Prose } from "@/system/typography/Prose";

type Props = {
  role: MemberRole;
  onRole: (role: MemberRole) => void;
  isPending: boolean;
  error: string | undefined;
};
/** Role choice stays editable after refusal and locked during confirmation. */
export function MemberRoleChoice({
  role,
  onRole,
  isPending,
  error,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <NativeSelect
        label="Role"
        data={ROLE_OPTIONS}
        value={role}
        onChange={(event) => {
          onRole(event.currentTarget.value as MemberRole);
        }}
        disabled={isPending}
        error={error}
      />
      <Prose>
        Every higher role can do everything the lower ones can. An admin can
        demote themselves when another active admin remains.
      </Prose>
    </>
  );
}
