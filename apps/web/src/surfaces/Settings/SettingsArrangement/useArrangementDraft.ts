import { useCanonicalSettingDraft } from "@/surfaces/Settings/useCanonicalSettingDraft";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  UpdateSettingsResponse,
  UpdateSettingsRequest,
} from "@memory-shoebox/shared";
import { useSettingsMutation } from "@/surfaces/Settings/useSettingsMutation";
import { useSettingsBlocked } from "@/surfaces/Settings/useSettingsBlocked";
/** A candidate arrangement remains local until its dedicated save succeeds. */
export type ArrangementDraft = {
  draft: "tidy" | "messy";
  isEdited: boolean;
  blocked: boolean;
  mutation: UseMutationResult<
    UpdateSettingsResponse,
    Error,
    UpdateSettingsRequest
  >;
  onChange: (value: string) => void;
  onSave: () => void;
};
/** Owns arrangement refusal, saved baseline and execution blocking. */
export function useArrangementDraft(
  arrangement: "tidy" | "messy",
): ArrangementDraft {
  const blocked = useSettingsBlocked();
  const {
    draft,
    savedValue: savedArrangement,
    setDraft,
    onSaved,
  } = useCanonicalSettingDraft({
    canonical: arrangement,
    blocked,
  });
  const mutation = useSettingsMutation({
    field: "arrangement",
    message: "The arrangement has been saved.",
    onSaved: (result) => {
      onSaved(result.pile.arrangement);
    },
  });
  const onChange = (value: string) => {
    if (value === "tidy" || value === "messy") {
      setDraft(value);
    }
    mutation.reset();
  };
  const onSave = () => {
    mutation.mutate({ pile: { arrangement: draft } });
  };
  return {
    draft,
    isEdited: draft !== savedArrangement,
    blocked,
    mutation,
    onChange,
    onSave,
  };
}
