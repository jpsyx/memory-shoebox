import type { UpdateSettingsResponse } from "@memory-shoebox/shared";
import { useQuery } from "@tanstack/react-query";
/**
 * Persisted-write status and recovery share the same navigation-surviving
 * owner.
 */
export type SettingsSnapshot = {
  hasCommitted: boolean;
  isRefreshing: boolean;
  error: Error | null;
  field: string;
  message: string;
  result: UpdateSettingsResponse | null;
};
/** This entry holds local recovery only and never performs an HTTP read. */
export const SETTINGS_RECOVERY_KEY = ["settings-recovery"] as const;
/** No saved change needs reconciliation on first entry. */
export const EMPTY_SETTINGS_SNAPSHOT: SettingsSnapshot = {
  hasCommitted: false,
  isRefreshing: false,
  error: null,
  field: "",
  message: "",
  result: null,
};
/**
 * Observes committed results and refresh failure together across route
 * reentry.
 */
export function useSettingsSnapshot(): SettingsSnapshot {
  return useQuery({
    queryKey: SETTINGS_RECOVERY_KEY,
    queryFn: () => {
      return EMPTY_SETTINGS_SNAPSHOT;
    },
    initialData: EMPTY_SETTINGS_SNAPSHOT,
    enabled: false,
    gcTime: Infinity,
  }).data;
}
