import type { CreateGroupRequest, AdminGroupDto } from "@memory-shoebox/shared";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  useGroupDraft,
  type GroupDraftState,
} from "@/surfaces/Groups/GroupForm/useGroupDraft";
import { createGroup } from "@/api/adminGroupsHelpers/adminGroupsHelpers";
import type { GroupReconciliationState } from "@/surfaces/Groups/useGroupReconciliation";
import { useGroupMutation } from "@/surfaces/Groups/useGroupMutation";
import {
  makeGroupFieldErrorsFromFailures,
  makeGroupSubmissionFromDraft,
  saveGroupDraft,
  type GroupFieldErrors,
} from "@/surfaces/Groups/GroupForm/groupDraftHelpers/groupDraftHelpers";
/** State shared by the group form's focused field and control modules. */
export type GroupFormState = GroupDraftState & {
  onSubmit: () => void;
  isPending: boolean;
  isBlocked: boolean;
  reconciliation: GroupReconciliationState;
  error: Error | undefined;
  errors: GroupFieldErrors;
};

function _saveGroupFormDraft({
  body,
  draft,
  queryClient,
}: Readonly<{
  body: CreateGroupRequest;
  draft: GroupDraftState;
  queryClient: QueryClient;
}>): Promise<void> {
  return draft.committed === undefined
    ? createGroup(body).then(() => {})
    : saveGroupDraft({
        queryClient,
        group: draft.committed,
        name: body.name,
        memberIds: body.memberIds ?? [],
        onRenamed: draft.onRenamed,
      });
}
/**
 * Controlled draft retains partial saves and never repeats a committed rename.
 */
export function useGroupForm(
  options: Readonly<{ group?: AdminGroupDto; onClose: () => void }>,
): GroupFormState {
  const queryClient = useQueryClient();
  const draft = useGroupDraft(options.group);
  const [errors, setErrors] = useState<GroupFieldErrors>({});
  const mutation = useGroupMutation({
    mutationFn: (body: CreateGroupRequest) => {
      return _saveGroupFormDraft({ body, draft, queryClient });
    },
    onSaved: options.onClose,
    completedMessage:
      draft.committed === undefined
        ? "The group has been created."
        : "The group changes have been saved.",
  });
  const isBlocked = mutation.isPending || mutation.reconciliation.hasCommitted;
  const onSubmit = () => {
    if (isBlocked) {
      return;
    }
    const submission = makeGroupSubmissionFromDraft({
      name: draft.name,
      memberIds: draft.memberIds,
    });
    setErrors(submission.errors);
    if (submission.body !== undefined) {
      mutation.mutate(submission.body);
    }
  };
  return {
    ...draft,
    onSubmit,
    isPending: mutation.isPending,
    isBlocked,
    reconciliation: mutation.reconciliation,
    error: mutation.error ?? undefined,
    errors: makeGroupFieldErrorsFromFailures({
      errors,
      error: mutation.error ?? undefined,
    }),
  };
}
