import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";

/** Props for the bulk row: whether any switch is on, and the two callbacks. */
type Props = {
  someOn: boolean;
  isSaving: boolean;
  onTurnOff: () => void;
  onTurnOn: () => void;
};

/**
 * "Turn them all off" and, once every switch already is, "Turn them back
 * on" in its place. Lifted out of `EmailSheet` so the sheet reads as four
 * switches and one bulk row, rather than the row's own conditional showing
 * through.
 */
export function NotifyBulkButtons({
  someOn,
  isSaving,
  onTurnOff,
  onTurnOn,
}: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      <Button
        variant="default"
        size="sm"
        disabled={!someOn || isSaving}
        onClick={onTurnOff}
      >
        Turn them all off
      </Button>
      {someOn ? null : (
        <Button
          variant="default"
          size="sm"
          disabled={isSaving}
          onClick={onTurnOn}
        >
          Turn them back on
        </Button>
      )}
    </ChipRow>
  );
}
