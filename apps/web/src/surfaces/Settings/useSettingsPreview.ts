import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { UpdateSettingsResponse } from "@memory-shoebox/shared";
import { updateAdminSettings } from "@/api/adminSettings/adminSettings";
import { requireSettingsAuthority } from "@/surfaces/Settings/settingsAuthority";
import { useMemberReadAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
/**
 * Candidate previews are validated privileged reads, never committed settings
 * saves.
 */
export function useSettingsPreview(
  onResult: (result: UpdateSettingsResponse | null) => void,
): UseMutationResult<UpdateSettingsResponse, Error, string> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ["settings-write"],
    scope: { id: "me" },
    mutationFn: (candidate: string) => {
      requireSettingsAuthority(queryClient);
      return updateAdminSettings({
        preview: true,
        shoebox: { timezone: candidate },
      });
    },
    onSuccess: (result) => {
      onResult(result);
    },
    onError: () => {
      onResult(null);
    },
  });
  useMemberReadAuthority(mutation.error);
  return mutation;
}
