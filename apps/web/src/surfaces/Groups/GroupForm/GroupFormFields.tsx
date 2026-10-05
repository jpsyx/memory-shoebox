import { TextInput, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { AdminMemberDto } from "@memory-shoebox/shared";
import { PeopleField } from "@/system/PeopleField/PeopleField";
import type { GroupFormState } from "@/surfaces/Groups/GroupForm/useGroupForm";
/** The established member picker, with only active and invited identities. */
export function GroupFormFields({
  form,
  members,
}: Readonly<{
  form: GroupFormState;
  members: readonly AdminMemberDto[];
}>): ReactNode {
  return (
    <>
      <TextInput
        label="What to call it"
        value={form.name}
        onChange={(event) => {
          return form.setName(event.currentTarget.value);
        }}
        error={form.errors.name}
        disabled={form.isBlocked}
        data-autofocus
      />
      <fieldset disabled={form.isBlocked}>
        <PeopleField
          label="Who is in it"
          description="Start typing a name. Only people who can sign in: a group is a way of naming several of them at once."
          mode="members"
          members={members.filter((member) => {
            return member.status !== "removed";
          })}
          value={form.memberIds}
          onChange={form.setMemberIds}
          placeholder="Start typing a name"
        />
        {form.errors.memberIds === undefined ? null : (
          <Text role="alert">{form.errors.memberIds}</Text>
        )}
      </fieldset>
    </>
  );
}
