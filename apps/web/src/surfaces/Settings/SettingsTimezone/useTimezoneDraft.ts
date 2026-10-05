import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  UpdateSettingsResponse,
  UpdateSettingsRequest,
} from "@memory-shoebox/shared";
import {
  useSettingsMutation,
  useSettingsBlocked,
} from "@/surfaces/Settings/useSettingsMutation";
import { useSettingsPreview } from "@/surfaces/Settings/useSettingsPreview";
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
  const [savedZone, setSavedZone] = useState(timezone);
  const [draft, setDraft] = useState(timezone);
  const [previewResult, setPreviewResult] =
    useState<UpdateSettingsResponse | null>(null);
  const blocked = useSettingsBlocked();
  const preview = useSettingsPreview(setPreviewResult);
  const save = useSettingsMutation({
    field: "timezone",
    message: "The timezone has been saved.",
    onSaved: (result) => {
      setSavedZone(result.shoebox.timezone);
      setDraft(result.shoebox.timezone);
      setPreviewResult(null);
    },
  });
  const onChange = (candidate: string) => {
    setDraft(candidate);
    setPreviewResult(null);
    preview.reset();
    save.reset();
  };
  const onPreview = () => {
    setPreviewResult(null);
    preview.mutate(draft);
  };
  const onConfirm = () => {
    if (previewResult?.timezoneImpact?.toZone === draft) {
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
