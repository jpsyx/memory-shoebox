import { NativeSelect } from "@mantine/core";
import type { MemberRole } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { InvitationFormState } from "@/surfaces/Members/InviteMemberForm/useInvitationForm";
import { ROLE_OPTIONS } from "@/surfaces/Members/memberCopyHelpers";
import { Prose } from "@/system/typography/Prose";

type Props = { form: InvitationFormState };
/**
 * Suggestion recovery and the offered role stay beside the invitation fields.
 */
export function InviteMemberRoleField({ form }: Readonly<Props>): ReactNode {
  return (
    <>
      <Prose>
        Filled in when the archive already knows the name. Type over it if it is
        wrong.
      </Prose>
      {form.draft.suggestions.isError ? (
        <Prose>
          Name suggestions could not be read. You can still type their name.
        </Prose>
      ) : null}
      <NativeSelect
        label="What they can do"
        description="A role can be changed later, and every higher role can do everything the lower ones can."
        data={ROLE_OPTIONS}
        value={form.role}
        onChange={(event) => {
          form.onRole(event.currentTarget.value as MemberRole);
        }}
        disabled={form.isPending || form.hasSent}
        error={form.errors.role}
      />
    </>
  );
}
