import { TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { InvitationFormState } from "@/surfaces/Members/InviteMemberForm/useInvitationForm";

type Props = { form: InvitationFormState };
/** Email and display name retain independent local and server field errors. */
export function InviteMemberIdentityFields({
  form,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <TextInput
        label="Their email"
        type="email"
        description="This becomes the only address they can sign in with."
        value={form.draft.email}
        onChange={(event) => {
          form.draft.setEmail(event.currentTarget.value);
        }}
        disabled={form.isPending}
        error={form.errors.email}
      />
      <TextInput
        label="What to call them"
        description="Shown on their comments and anything they put up. They can change it later."
        value={form.draft.displayName}
        onChange={(event) => {
          form.draft.setEditedName(event.currentTarget.value);
        }}
        disabled={form.isPending}
        error={form.errors.displayName}
      />
    </>
  );
}
