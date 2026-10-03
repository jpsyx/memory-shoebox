import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { FocusKeepingButton } from "@/system/FocusKeepingButton/FocusKeepingButton";
import { Prose } from "@/system/typography/Prose";

type Props = {
  /** Whatever the last save said went wrong, already in words. */
  error: string | undefined;
  isSaving: boolean;
  /** The fields cannot be saved as they stand, so the save is off. */
  isSaveDisabled: boolean;
  saveLabel: string;
  /** What the save says while it is out. */
  savingLabel: string;
  onSave: () => void;
  onCancel: () => void;
};

/**
 * Under an editor that saves on a button: what went wrong, if anything, the
 * save, and a Cancel. Both wait while a save is out: the save closes the
 * editor itself when it lands, and a Cancel pressed before then would not
 * stop it. The pressed save keeps focus until then.
 */
export function EditorSaveRow({
  error,
  isSaving,
  isSaveDisabled,
  saveLabel,
  savingLabel,
  onSave,
  onCancel,
}: Readonly<Props>): ReactNode {
  // FocusKeepingButton, not `disabled`, which would drop the pressed
  // button's focus.
  return (
    <>
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
      <ChipRow>
        <FocusKeepingButton
          disabled={isSaveDisabled}
          isUnavailable={isSaving}
          onClick={onSave}
        >
          {isSaving ? savingLabel : saveLabel}
        </FocusKeepingButton>
        <FocusKeepingButton
          variant="default"
          isUnavailable={isSaving}
          onClick={onCancel}
        >
          Cancel
        </FocusKeepingButton>
      </ChipRow>
    </>
  );
}
