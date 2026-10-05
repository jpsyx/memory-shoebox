import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  UpdateSettingsResponse,
  UpdateSettingsRequest,
} from "@memory-shoebox/shared";
import {
  useSettingsBlocked,
  useSettingsMutation,
} from "@/surfaces/Settings/useSettingsMutation";
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
  const [savedArrangement, setSavedArrangement] = useState(arrangement);
  const [draft, setDraft] = useState(arrangement);
  const blocked = useSettingsBlocked();
  const mutation = useSettingsMutation({
    field: "arrangement",
    message: "The arrangement has been saved.",
    onSaved: (result) => {
      setSavedArrangement(result.pile.arrangement);
      setDraft(result.pile.arrangement);
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
