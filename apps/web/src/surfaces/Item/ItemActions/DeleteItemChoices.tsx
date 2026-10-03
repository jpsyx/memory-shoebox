import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { FocusKeepingButton } from "@/system/FocusKeepingButton/FocusKeepingButton";
import { Prose } from "@/system/typography/Prose";

type Props = {
  /** Whatever the delete said went wrong, already in words. */
  error: string | undefined;
  /** The delete is out or has landed, so neither choice is open any more. */
  isBusy: boolean;
  onDelete: () => void;
  onKeep: () => void;
};

/**
 * The delete dialog's two choices, and what went wrong with the last one.
 * Both wait once "Delete it" is pressed: keeping it then would not stop the
 * request, and pressing it again would ask to delete what is already gone.
 * They wait without `disabled`, so "Delete it" keeps focus while it works.
 */
export function DeleteItemChoices({
  error,
  isBusy,
  onDelete,
  onKeep,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
      <ChipRow>
        <FocusKeepingButton
          variant="danger"
          isUnavailable={isBusy}
          onClick={onDelete}
        >
          {isBusy ? "Deleting" : "Delete it"}
        </FocusKeepingButton>
        <FocusKeepingButton
          variant="default"
          isUnavailable={isBusy}
          onClick={onKeep}
        >
          Keep it
        </FocusKeepingButton>
      </ChipRow>
    </>
  );
}
