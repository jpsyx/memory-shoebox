import { Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { AdminMemberDto } from "@memory-shoebox/shared";
import { GroupFormNotice } from "@/surfaces/Groups/GroupForm/GroupFormNotice";
import { GroupFormFields } from "@/surfaces/Groups/GroupForm/GroupFormFields";
import { GroupFormControls } from "@/surfaces/Groups/GroupForm/GroupFormControls";
import type { GroupFormState } from "@/surfaces/Groups/GroupForm/useGroupForm";
import classes from "@/surfaces/Groups/GroupsSurface/GroupsSurface.module.css";
/** Shared controlled fields retain inputs and explain partial saves. */
export function GroupFormBody({
  form,
  members,
  isCreating,
  onClose,
}: Readonly<{
  form: GroupFormState;
  members: readonly AdminMemberDto[];
  isCreating: boolean;
  onClose: () => void;
}>): ReactNode {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        form.onSubmit();
      }}
    >
      <Stack gap="md" className={classes.form}>
        <GroupFormFields form={form} members={members} />
        <Text c="var(--on-print-quiet)">
          Whoever you add can see everything already restricted to this group,
          straight away. Removing somebody takes that access away. Except rules
          work in the opposite direction.
        </Text>
        <GroupFormNotice form={form} isCreating={isCreating} />
        <GroupFormControls
          form={form}
          isCreating={isCreating}
          onClose={onClose}
        />
      </Stack>
    </form>
  );
}
