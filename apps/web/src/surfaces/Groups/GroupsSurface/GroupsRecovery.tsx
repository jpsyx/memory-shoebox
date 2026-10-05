import type { ReactNode } from "react";
import { useGroupReconciliation } from "@/surfaces/Groups/useGroupReconciliation";
import { GroupReconciliationNotice } from "@/surfaces/Groups/GroupReconciliationNotice";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
/** Directory reentry retains a refresh-only recovery for completed group writes. */
export function GroupsRecovery({
  isVisible,
}: Readonly<{ isVisible: boolean }>): ReactNode {
  const reconciliation = useGroupReconciliation(() => {});
  return isVisible && reconciliation.hasCommitted ? (
    <Sheet wide label="Saved group change">
      <SheetHead title="A saved change" />
      <GroupReconciliationNotice
        reconciliation={reconciliation}
        message={reconciliation.message}
      />
    </Sheet>
  ) : null;
}
