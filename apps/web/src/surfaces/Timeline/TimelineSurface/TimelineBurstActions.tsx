import { useState, type ReactNode } from "react";
import { PileBurstActionsContext } from "@/system/Pile/PileBurstActions";
import { BurstActionModal } from "@/surfaces/Item/ItemActions/BurstActionModal";

type Props = { children: ReactNode };

/** Keeps one burst confirmation alive while the refreshed pile changes shape. */
export function TimelineBurstActions({ children }: Readonly<Props>): ReactNode {
  const [itemId, setItemId] = useState<string>();
  return (
    <PileBurstActionsContext value={setItemId}>
      {children}
      {itemId === undefined ? null : (
        <BurstActionModal
          key={itemId}
          itemId={itemId}
          action="remove"
          onClose={() => {
            return setItemId(undefined);
          }}
        />
      )}
    </PileBurstActionsContext>
  );
}
