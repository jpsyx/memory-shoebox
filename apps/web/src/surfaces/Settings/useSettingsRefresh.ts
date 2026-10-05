import type { QueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/api/me/me";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
import {
  SETTINGS_RECOVERY_KEY,
  EMPTY_SETTINGS_SNAPSHOT,
  type SettingsSnapshot,
} from "@/surfaces/Settings/useSettingsSnapshot";
async function _refreshDependents(queryClient: QueryClient): Promise<void> {
  const isAdmin =
    queryClient.getQueryData(meQueryOptions.queryKey)?.me.role === "admin";
  const keys = [
    "public-settings",
    "timeline",
    "items",
    "bursts",
    "milestones",
    "presence",
    "activity",
    "observations",
    ...(isAdmin ? ["settings", "mail-health"] : []),
  ];
  await Promise.all(
    keys.map((key) => {
      return queryClient.invalidateQueries(
        { queryKey: [key] },
        { throwOnError: true },
      );
    }),
  );
}
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
    update({ isRefreshing: true, error: null });
    try {
      await refreshAuthority();
      await _refreshDependents(queryClient);
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
