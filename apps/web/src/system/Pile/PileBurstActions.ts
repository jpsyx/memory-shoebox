import { createContext } from "react";

/** Optional timeline membership action, absent from read-only and upload piles. */
export const PileBurstActionsContext = createContext<
  ((itemId: string) => void) | undefined
>(undefined);
