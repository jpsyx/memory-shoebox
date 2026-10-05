import type { ReactNode } from "react";
import type { GroupDeletionState } from "@/surfaces/Groups/GroupDeleteDialog/useGroupDeletion";
import { GroupReconciliationNotice } from "@/surfaces/Groups/GroupReconciliationNotice";
import { GroupDeleteConsentBody } from "@/surfaces/Groups/GroupDeleteDialog/GroupDeleteConsentBody";
type Props = { deletion: GroupDeletionState; onClose: () => void };

/**
 * Completed deletion replaces consent entirely with truthful authority
 * recovery.
 */
export function GroupDeleteBody({
  deletion,
  onClose,
}: Readonly<Props>): ReactNode {
  return deletion.mutation.reconciliation.hasCommitted ? (
    <GroupReconciliationNotice
      reconciliation={deletion.mutation.reconciliation}
      message="The group has been deleted."
    />
  ) : (
    <GroupDeleteConsentBody deletion={deletion} onClose={onClose} />
  );
}
