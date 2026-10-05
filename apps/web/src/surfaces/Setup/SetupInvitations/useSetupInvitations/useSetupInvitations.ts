import type { SetupInvitationsFlow } from "../../setupFlow.types";
import { useCompleteInvitations } from "./useCompleteInvitations";
import { useSendInvitations } from "./useSendInvitations/useSendInvitations";
import { useSetupInvitationDrafts } from "./useSetupInvitationDrafts";
/**
 * Queues only unfinished drafts and permits explicit completion despite errors.
 */
export function useSetupInvitations(): SetupInvitationsFlow {
  const draft = useSetupInvitationDrafts();
  const completion = useCompleteInvitations();
  const sending = useSendInvitations((queuedRows) => {
    draft.onQueued(queuedRows);
    if (
      queuedRows.every((row) => {
        return row.isQueued;
      })
    ) {
      completion.mutate();
    }
  });
  const isBusy = sending.isPending || completion.isPending;
  const onSubmit = () => {
    if (isBusy) {
      return;
    }
    const validated = draft.getValidatedRows();
    if (validated !== undefined) {
      sending.send(validated);
    }
  };
  return {
    rows: draft.rows,
    onAdd: draft.onAdd,
    onChange: draft.onChange,
    isBusy,
    onSubmit,
    onSkip: () => {
      if (!isBusy) {
        completion.mutate();
      }
    },
    completionError: completion.isError
      ? "Could not finish setup. Try again or skip for now."
      : undefined,
  };
}
