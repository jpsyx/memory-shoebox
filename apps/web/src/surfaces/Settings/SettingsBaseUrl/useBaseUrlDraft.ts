import { useCanonicalSettingDraft } from "@/surfaces/Settings/useCanonicalSettingDraft";
import { useSettingsBlocked } from "@/surfaces/Settings/useSettingsBlocked";
import { useSettingsMutation } from "@/surfaces/Settings/useSettingsMutation";
import type { TextSettingDraft } from "@/surfaces/Settings/useTextSettingDraft";

/** Keeps the public URL draft and saved baseline through settings refreshes. */
export function useBaseUrlDraft(baseUrl: string): TextSettingDraft {
  const blocked = useSettingsBlocked();
  const { draft, savedValue, setDraft, onSaved } = useCanonicalSettingDraft({
    canonical: baseUrl,
    blocked,
  });
  const mutation = useSettingsMutation({
    field: "baseUrl",
    message: "The base URL has been saved.",
    onSaved: (result) => {
      onSaved(result.public.baseUrl ?? "");
    },
  });
  return {
    draft,
    isEdited: draft !== savedValue,
    blocked,
    mutation,
    onChange: (value) => {
      setDraft(value);
      mutation.reset();
    },
    onCancel: () => {
      setDraft(savedValue);
      mutation.reset();
    },
    onSave: () => {
      mutation.mutate({ public: { baseUrl: draft.trim() } });
    },
  };
}
