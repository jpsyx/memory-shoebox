import { useState } from "react";
import type {
  UpdateSettingsRequest,
  UpdateSettingsResponse,
} from "@memory-shoebox/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  useSettingsBlocked,
  useSettingsMutation,
} from "@/surfaces/Settings/useSettingsMutation";
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
const TEXT_SETTING_MESSAGES = {
  name: "The new name has been saved.",
  sender: "The sending address has been saved.",
};
/**
 * Shared text draft mechanics preserve server refusal without merging
 * settings fields.
 */
export function useTextSettingDraft(
  options: Readonly<{ initialValue: string; field: "name" | "sender" }>,
): TextSettingDraft {
  const [savedValue, setSavedValue] = useState(options.initialValue);
  const [draft, setDraft] = useState(options.initialValue);
  const blocked = useSettingsBlocked();
  const mutation = useSettingsMutation({
    field: options.field,
    message: TEXT_SETTING_MESSAGES[options.field],
    onSaved: (result) => {
      const value =
        options.field === "name"
          ? result.shoebox.name
          : (result.mail.fromAddress ?? "");
      setSavedValue(value);
      setDraft(value);
    },
  });
  const onChange = (value: string) => {
    setDraft(value);
    mutation.reset();
  };
  const onCancel = () => {
    setDraft(savedValue);
    mutation.reset();
  };
  const onSave = () => {
    mutation.mutate(
      options.field === "name"
        ? { shoebox: { name: draft } }
        : { mail: { fromAddress: draft.trim() } },
    );
  };
  return {
    draft,
    isEdited: draft !== savedValue,
    blocked,
    mutation,
    onChange,
    onCancel,
    onSave,
  };
}
