import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminGroupDto } from "@memory-shoebox/shared";
import {
  useGroupDraft,
  type GroupDraftState,
} from "@/surfaces/Groups/GroupForm/useGroupDraft";
import { createGroup } from "@/api/adminGroups/adminGroups";
import type { GroupReconciliationState } from "@/surfaces/Groups/useGroupReconciliation";
import { useGroupMutation } from "@/surfaces/Groups/useGroupMutation";
import {
  makeGroupFieldErrorsFromFailures,
  makeGroupSubmissionFromDraft,
  saveGroupDraft,
} from "@/surfaces/Groups/GroupForm/groupDraftHelpers";
/** Controlled draft retains partial saves and never repeats a committed rename. */
export function useGroupForm(
  options: Readonly<{ group?: AdminGroupDto; onClose: () => void }>,
): GroupFormState {
  const queryClient = useQueryClient();
  const draft = useGroupDraft(options.group);
  const [errors, setErrors] = useState<{ name?: string; memberIds?: string }>(
    {},
  );
  const mutation = useGroupMutation({
    mutationFn: async (body: { name: string; memberIds?: string[] }) => {
      if (draft.committed === undefined) {
        await createGroup(body);
        return;
      }
      await saveGroupDraft({
        queryClient,
        group: draft.committed,
        name: body.name,
        memberIds: body.memberIds ?? [],
        onRenamed: draft.onRenamed,
      });
    },
    onSaved: options.onClose,
  });
  const isBlocked = mutation.isPending || mutation.reconciliation.hasCommitted;
  const onSubmit = () => {
    if (isBlocked) return;
    const submission = makeGroupSubmissionFromDraft({
      name: draft.name,
      memberIds: draft.memberIds,
    });
    setErrors(submission.errors);
    if (submission.body !== undefined) mutation.mutate(submission.body);
  };
  return {
    ...draft,
    onSubmit,
    isPending: mutation.isPending,
    isBlocked,
    reconciliation: mutation.reconciliation,
    error: mutation.error,
    errors: makeGroupFieldErrorsFromFailures({ errors, error: mutation.error }),
  };
}
/** State shared by the group form's focused field and control modules. */
export type GroupFormState = GroupDraftState & {
  onSubmit: () => void;
  isPending: boolean;
  isBlocked: boolean;
  reconciliation: GroupReconciliationState;
  error: Error | null;
  errors: { name?: string; memberIds?: string };
};
