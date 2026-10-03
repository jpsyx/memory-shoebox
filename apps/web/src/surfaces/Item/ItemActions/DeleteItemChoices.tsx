import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
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
        <Button variant="danger" disabled={isBusy} onClick={onDelete}>
          {isBusy ? "Deleting" : "Delete it"}
        </Button>
        <Button variant="default" disabled={isBusy} onClick={onKeep}>
          Keep it
        </Button>
      </ChipRow>
    </>
  );
}
