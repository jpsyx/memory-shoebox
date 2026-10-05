import type {
  UpdateSettingsRequest,
  UpdateSettingsResponse,
} from "@memory-shoebox/shared";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { updateAdminSettings } from "@/api/adminSettings/adminSettings";
import { requireSettingsAuthority } from "@/surfaces/Settings/settingsAuthority";
import { useSettingsReconciliation } from "@/surfaces/Settings/useSettingsReconciliation";
import {
  SETTINGS_RECOVERY_KEY,
  useSettingsSnapshot,
  type SettingsSnapshot,
} from "@/surfaces/Settings/useSettingsSnapshot";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
/**
 * All settings controls pause during a write or its unfinished
 * reconciliation.
 */
export function useSettingsBlocked(): boolean {
  const snapshot = useSettingsSnapshot();
  const pendingCount = useIsMutating({ mutationKey: ["settings-write"] });
  return snapshot.hasCommitted || pendingCount > 0;
}
/**
 * A single-field save retains refused drafts and separates persistence from
 * refresh.
 */
export function useSettingsMutation(
  options: Readonly<{
    field: string;
    message: string;
    onSaved: (result: UpdateSettingsResponse) => void;
  }>,
): UseMutationResult<UpdateSettingsResponse, Error, UpdateSettingsRequest> {
  const queryClient = useQueryClient();
  const reconciliation = useSettingsReconciliation();
  const refreshAuthority = useRefreshMemberAuthority();
  return useMutation({
    mutationKey: ["settings-write"],
    scope: { id: "me" },
    mutationFn: (body: UpdateSettingsRequest) => {
      requireSettingsAuthority(queryClient);
      if (
        queryClient.getQueryData<SettingsSnapshot>(SETTINGS_RECOVERY_KEY)
          ?.hasCommitted
      ) {
        throw new Error("Refresh your account before another settings change.");
      }
      return updateAdminSettings(body);
    },
    onSuccess: async (result) => {
      options.onSaved(result);
      await reconciliation.onCommitted(result, options.field, options.message);
    },
    onError: async (error) => {
      if (
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 403)
      ) {
        await refreshAuthority().catch(() => {});
      }
    },
  });
}
