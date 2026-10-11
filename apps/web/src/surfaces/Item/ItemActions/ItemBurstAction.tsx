import { Button } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { BurstActionModal } from "./BurstActionModal";

type Props = { detail: ItemDetail };

/** Membership controls exist only when the server grants burst management. */
export function ItemBurstAction({ detail }: Readonly<Props>): ReactNode {
  const [selectedAction, setSelectedAction] = useState<"remove" | "restore">();
  const action = detail.burst !== null ? "remove" : "restore";
  if (
    detail.capabilities.canManageBurst !== true ||
    (detail.burst === null && detail.canRestoreBurst !== true)
  ) {
    return null;
  }
  return (
    <>
      <ChipRow>
        <Button
          variant="default"
          onClick={() => {
            return setSelectedAction(action);
          }}
        >
          {action === "remove" ? "Make standalone" : "Return to burst"}
        </Button>
      </ChipRow>
      {selectedAction === undefined ? null : (
        <BurstActionModal
          itemId={detail.itemId}
          action={selectedAction}
          onClose={() => {
            return setSelectedAction(undefined);
          }}
        />
      )}
    </>
  );
}
