import { useCanonicalSettingDraft } from "./useCanonicalSettingDraft";
import type {
  UpdateSettingsRequest,
  UpdateSettingsResponse,
} from "@memory-shoebox/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useSettingsMutation } from "@/surfaces/Settings/useSettingsMutation";
import { useSettingsBlocked } from "@/surfaces/Settings/useSettingsBlocked";
/** A text field owns its saved baseline separately from a refused draft. */
export type TextSettingDraft = {
  draft: string;
  isEdited: boolean;
  blocked: boolean;
  mutation: UseMutationResult<
    UpdateSettingsResponse,
    Error,
    UpdateSettingsRequest
  >;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};
/**
 * Shared text draft mechanics preserve server refusal without merging
 * settings fields.
 */
export function useTextSettingDraft(
  options: Readonly<{ initialValue: string; field: "name" | "sender" }>,
): TextSettingDraft {
  const blocked = useSettingsBlocked();
  const { draft, savedValue, setDraft, onSaved } = useCanonicalSettingDraft({
    canonical: options.initialValue,
    blocked,
  });
  const mutation = useSettingsMutation({
    field: options.field,
    message:
      options.field === "name"
        ? "The new name has been saved."
        : "The sending address has been saved.",
    onSaved: (result) => {
      const value =
        options.field === "name"
          ? result.shoebox.name
          : (result.mail.fromAddress ?? "");
      onSaved(value);
    },
  });
  return {
    draft,
    isEdited: draft !== savedValue,
    blocked,
    mutation,
    onChange: (value: string) => {
      setDraft(value);
      mutation.reset();
    },
    onCancel: () => {
      setDraft(savedValue);
      mutation.reset();
    },
    onSave: () => {
      mutation.mutate(
        options.field === "name"
          ? { shoebox: { name: draft } }
          : { mail: { fromAddress: draft.trim() } },
      );
    },
  };
}
