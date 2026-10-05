import { useIsMutating } from "@tanstack/react-query";
import { useSettingsSnapshot } from "./useSettingsSnapshot";

/**
 * All settings controls pause during a write or its unfinished
 * reconciliation.
 */
export function useSettingsBlocked(): boolean {
  const snapshot = useSettingsSnapshot();
  const pendingCount = useIsMutating({ mutationKey: ["settings-write"] });
  return snapshot.hasCommitted || pendingCount > 0;
}
