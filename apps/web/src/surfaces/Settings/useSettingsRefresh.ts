import type { QueryClient } from "@tanstack/react-query";
import { refreshSettingsDependents } from "@/surfaces/Settings/settingsSynchronization/refreshSettingsDependents";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
import {
  SETTINGS_RECOVERY_KEY,
  EMPTY_SETTINGS_SNAPSHOT,
  type SettingsSnapshot,
} from "@/surfaces/Settings/useSettingsSnapshot";
/** Refresh-only recovery catches faults and never repeats a persisted PATCH. */
export function useSettingsRefresh(
  queryClient: QueryClient,
): () => Promise<void> {
  const refreshAuthority = useRefreshMemberAuthority();
  const update = (changes: Readonly<Partial<SettingsSnapshot>>) => {
    queryClient.setQueryData<SettingsSnapshot>(
      SETTINGS_RECOVERY_KEY,
      (snapshot) => {
        return { ...(snapshot ?? EMPTY_SETTINGS_SNAPSHOT), ...changes };
      },
    );
  };
  return async () => {
    if (
      queryClient.getQueryData<SettingsSnapshot>(SETTINGS_RECOVERY_KEY)
        ?.isRefreshing
    ) {
      return;
    }
    update({ isRefreshing: true, error: undefined });
    try {
      await refreshAuthority();
      await Promise.all([
        refreshSettingsDependents(
          queryClient,
          queryClient.getQueryData<SettingsSnapshot>(SETTINGS_RECOVERY_KEY)
            ?.field === "timezone",
        ),
        queryClient.invalidateQueries(
          { queryKey: ["settings"] },
          { throwOnError: true },
        ),
      ]);
      update({ hasCommitted: false });
    } catch (failure) {
      update({
        error:
          failure instanceof Error
            ? failure
            : new Error("Settings refresh failed."),
      });
    } finally {
      update({ isRefreshing: false });
    }
  };
}
