import { useGroupDeletionConsent } from "./useGroupDeletionConsent";
import type { UseQueryResult } from "@tanstack/react-query";
import type { GroupUsageResponse } from "@memory-shoebox/shared";
import { deleteGroup } from "@/api/adminGroupsHelpers/adminGroupsHelpers";
import {
  useGroupMutation,
  type GroupMutationResult,
} from "@/surfaces/Groups/useGroupMutation";
import { useGroupUsageRead } from "@/surfaces/Groups/GroupDeleteDialog/useGroupUsageRead";
import { isGroupDeletionAllowed } from "@/surfaces/Groups/GroupDeleteDialog/groupConsentHelpers/groupConsentHelpers";

/** The deletion dialog's read, consent and write state. */
export type GroupDeletionState = {
  read: UseQueryResult<GroupUsageResponse, Error>;
  usage: GroupUsageResponse | undefined;
  needsConfirmation: boolean;
  mutation: GroupMutationResult<void, GroupUsageResponse>;
  canDelete: boolean;
  onConfirm: () => void;
  onRetry: () => void;
};

/** Deletion's fresh usage and conflicts are distinct from the list's counts. */
export function useGroupDeletion(
  options: Readonly<{ groupId: string; onClose: () => void }>,
): GroupDeletionState {
  const read = useGroupUsageRead(options.groupId);
  const consent = useGroupDeletionConsent(options.groupId);
  const mutation = useGroupMutation({
    mutationFn: (usage: GroupUsageResponse) => {
      return deleteGroup({
        groupId: options.groupId,
        confirmationToken: usage.confirmationToken ?? undefined,
      });
    },
    onSaved: options.onClose,
    completedMessage: "The group has been deleted.",
    onFailed: consent.onFailed,
  });
  const usage =
    consent.freshUsage ?? (consent.needsConfirmation ? undefined : read.data);
  const canDelete =
    !mutation.reconciliation.hasCommitted &&
    isGroupDeletionAllowed({ usage, read, mutation });
  return {
    read,
    usage,
    needsConfirmation: consent.needsConfirmation,
    mutation,
    canDelete,
    onConfirm: () => {
      if (canDelete && usage !== undefined) {
        mutation.mutate(usage);
      }
    },
    onRetry: () => {
      if (mutation.reconciliation.hasCommitted) {
        return;
      }
      consent.reset();
      void read.refetch();
    },
  };
}
