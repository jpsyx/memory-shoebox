import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { UpdateSettingsResponse } from "@memory-shoebox/shared";
import { adminSettingsQueryOptions } from "@/api/adminSettings/adminSettings";
import { publicSettingsQueryOptions } from "@/api/publicSettings/publicSettings";
import { useSettingsRefresh } from "@/surfaces/Settings/useSettingsRefresh";
import {
  EMPTY_SETTINGS_SNAPSHOT,
  SETTINGS_RECOVERY_KEY,
  useSettingsSnapshot,
  type SettingsSnapshot,
} from "@/surfaces/Settings/useSettingsSnapshot";
function _updateSnapshot(
  queryClient: QueryClient,
  update: Readonly<Partial<SettingsSnapshot>>,
): void {
  queryClient.setQueryData<SettingsSnapshot>(
    SETTINGS_RECOVERY_KEY,
    (snapshot) => {
      return { ...(snapshot ?? EMPTY_SETTINGS_SNAPSHOT), ...update };
    },
  );
}
/**
 * Reconciliation catches refresh failures so a completed PATCH remains a
 * success.
 */
export function useSettingsReconciliation(): SettingsReconciliation {
  const queryClient = useQueryClient();
  const snapshot = useSettingsSnapshot();
  const refresh = useSettingsRefresh(queryClient);
  const onCommitted = async (
    result: UpdateSettingsResponse,
    field: string,
    message: string,
  ) => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, result);
    queryClient.setQueryData(publicSettingsQueryOptions.queryKey, {
      shoeboxName: result.shoebox.name,
      baseUrl: result.public.baseUrl,
    });
    _updateSnapshot(queryClient, {
      hasCommitted: true,
      result,
      field,
      message,
    });
    await refresh();
  };
  const onRetry = () => {
    if (snapshot.hasCommitted) {
      void refresh();
    }
  };
  return { ...snapshot, onCommitted, onRetry };
}

/** Recovery methods never repeat the completed settings write. */
export type SettingsReconciliation = SettingsSnapshot & {
  onCommitted: (
    result: UpdateSettingsResponse,
    field: string,
    message: string,
  ) => Promise<void>;
  onRetry: () => void;
};
