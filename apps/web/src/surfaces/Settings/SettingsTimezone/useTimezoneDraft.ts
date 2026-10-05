import { useCanonicalSettingDraft } from "@/surfaces/Settings/useCanonicalSettingDraft";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  UpdateSettingsResponse,
  UpdateSettingsRequest,
} from "@memory-shoebox/shared";
import {
  useSettingsMutation,
  useSettingsBlocked,
} from "@/surfaces/Settings/useSettingsMutation";
import { useTimezoneConsent } from "./useTimezoneConsent";
/** The timezone draft owns a preview tied to its exact candidate. */
export type TimezoneDraft = {
  draft: string;
  isEdited: boolean;
  blocked: boolean;
  previewResult: UpdateSettingsResponse | null;
  preview: UseMutationResult<UpdateSettingsResponse, Error, string>;
  save: UseMutationResult<UpdateSettingsResponse, Error, UpdateSettingsRequest>;
  onChange: (candidate: string) => void;
  onPreview: () => void;
  onConfirm: () => void;
};
/**
 * Changes invalidate previous consent; a real save reports newly computed
 * consequences.
 */
export function useTimezoneDraft(timezone: string): TimezoneDraft {
  const blocked = useSettingsBlocked();
  const {
    draft,
    savedValue: savedZone,
    setDraft,
    onSaved,
  } = useCanonicalSettingDraft(timezone, blocked);
  const { previewResult, preview, resetPreview, onPreview } =
    useTimezoneConsent(draft, timezone);
  const save = useSettingsMutation({
    field: "timezone",
    message: "The timezone has been saved.",
    onSaved: (result) => {
      onSaved(result.shoebox.timezone);
      resetPreview();
    },
  });
  const onChange = (candidate: string) => {
    setDraft(candidate);
    resetPreview();
    save.reset();
  };
  const onConfirm = () => {
    if (previewResult !== null) {
      save.mutate({ shoebox: { timezone: draft } });
    }
  };
  return {
    draft,
    isEdited: draft !== savedZone,
    blocked,
    previewResult,
    preview,
    save,
    onChange,
    onPreview,
    onConfirm,
  };
}
