import { Prose } from "@/system/typography/Prose";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { useInvitationForm } from "@/surfaces/Members/InviteMemberForm/useInvitationForm";
import { InviteMemberIdentityFields } from "@/surfaces/Members/InviteMemberForm/InviteMemberIdentityFields";
import { InviteMemberRoleField } from "@/surfaces/Members/InviteMemberForm/InviteMemberRoleField";
import { InviteMemberControls } from "@/surfaces/Members/InviteMemberForm/InviteMemberControls";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";

type Props = { onClose: () => void; onSent: (email: string) => void };
/** Inline invitation composition with field-specific validation and errors. */
export function InviteMemberForm({
  onClose,
  onSent,
}: Readonly<Props>): ReactNode {
  const form = useInvitationForm(onSent);
  return (
    <Sheet wide label="Invite somebody">
      <SheetHead title="Invite somebody" />
      <form onSubmit={form.onSubmit} noValidate>
        <Stack gap="md">
          <InviteMemberIdentityFields form={form} />
          <InviteMemberRoleField form={form} />
          <Prose>
            The invitation only works for their email address. Forwarding it
            does not let anybody else in.
          </Prose>
          <InviteMemberControls form={form} onClose={onClose} />
        </Stack>
      </form>
    </Sheet>
  );
}
