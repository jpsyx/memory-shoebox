import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { UpdateSettingsResponse } from "@memory-shoebox/shared";
import { updateAdminSettings } from "@/api/updateAdminSettings/updateAdminSettings";
import { requireSettingsAuthority } from "@/surfaces/Settings/requireSettingsAuthority";
import { useMemberReadAuthority } from "@/surfaces/Members/useMemberReadAuthority";
/**
 * Candidate previews are validated privileged reads, never committed settings
 * saves.
 */
export function useSettingsPreview(
  onResult: (result: UpdateSettingsResponse | undefined) => void,
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
      onResult(undefined);
    },
  });
  useMemberReadAuthority(mutation.error ?? undefined);
  return mutation;
}
