import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import type { GroupUsageResponse } from "@memory-shoebox/shared";
import { deleteGroup } from "@/api/adminGroups/adminGroups";
import {
  useGroupMutation,
  type GroupMutationResult,
} from "@/surfaces/Groups/useGroupMutation";
import { useGroupUsageRead } from "@/surfaces/Groups/GroupDeleteDialog/useGroupUsageRead";
import {
  isGroupConsentError,
  getGroupUsageFromConsentError,
  isGroupDeletionAllowed,
} from "@/surfaces/Groups/GroupDeleteDialog/groupConsentHelpers";
/** Deletion's fresh usage and conflicts are distinct from the list's counts. */
export function useGroupDeletion(
  options: Readonly<{ groupId: string; onClose: () => void }>,
): GroupDeletionState {
  const read = useGroupUsageRead(options.groupId);
  const [freshUsage, setFreshUsage] = useState<GroupUsageResponse>();
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const mutation = useGroupMutation({
    mutationFn: (usage: GroupUsageResponse) => {
      return deleteGroup({
        groupId: options.groupId,
        confirmationToken: usage.confirmationToken,
      });
    },
    onSaved: options.onClose,
    completedMessage: "The group has been deleted.",
    onFailed: (error) => {
      if (isGroupConsentError(error)) {
        setFreshUsage(
          getGroupUsageFromConsentError({ error, groupId: options.groupId }),
        );
        setNeedsConfirmation(true);
      }
    },
  });
  const usage = freshUsage ?? (needsConfirmation ? undefined : read.data);
  const canDelete =
    !mutation.reconciliation.hasCommitted &&
    isGroupDeletionAllowed({ usage, read, mutation });
  return {
    read,
    usage,
    needsConfirmation,
    mutation,
    canDelete,
    onConfirm: () => {
      if (canDelete && usage !== undefined) mutation.mutate(usage);
    },
    onRetry: () => {
      if (mutation.reconciliation.hasCommitted) return;
      setFreshUsage(undefined);
      setNeedsConfirmation(false);
      void read.refetch();
    },
  };
}

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
