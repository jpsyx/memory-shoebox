import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { GroupFormState } from "@/surfaces/Groups/GroupForm/useGroupForm";
import { GroupReconciliationNotice } from "@/surfaces/Groups/GroupReconciliationNotice";
/** Partial writes and completed writes retain distinct, truthful status. */
export function GroupFormNotice({
  form,
  isCreating,
}: Readonly<{ form: GroupFormState; isCreating: boolean }>): ReactNode {
  return (
    <>
      {form.savedName === undefined ? null : (
        <Text role="status">
          Name saved as {form.savedName}. Membership is a separate save.
        </Text>
      )}
      {form.error === null ? null : (
        <Text role="alert">{form.error.message}</Text>
      )}
      <GroupReconciliationNotice
        reconciliation={form.reconciliation}
        message={
          isCreating
            ? "The group has been created."
            : "The group changes have been saved."
        }
      />
    </>
  );
}
