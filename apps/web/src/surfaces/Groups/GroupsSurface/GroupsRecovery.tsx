import type { ReactNode } from "react";
import { useGroupReconciliation } from "@/surfaces/Groups/useGroupReconciliation";
import { GroupReconciliationNotice } from "@/surfaces/Groups/GroupReconciliationNotice";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
type Props = { isVisible: boolean };

/**
 * Directory reentry retains a refresh-only recovery for completed group writes.
 */
export function GroupsRecovery({ isVisible }: Readonly<Props>): ReactNode {
  const reconciliation = useGroupReconciliation({
    onSaved: () => {},
  });
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
