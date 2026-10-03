import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import type { WallClock } from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
import { useSetItemCaptureDate } from "@/surfaces/Item/itemWrites/useItemEdits";

type Props = {
  detail: ItemDetail;
  /** The capture's wall clock now, which the time field started from. */
  wallClock: WallClock;
  /** The day the field holds now, `YYYY-MM-DD`. */
  day: string;
  /** The time the field holds now, `HH:MM`, or empty while it is cleared. */
  time: string;
  onDone: () => void;
};

/**
 * The capture date editor's write: what went wrong, if anything, a "Put it
 * right" that asks nothing when neither field changed, and a Cancel. Both
 * wait while a correction is out: it closes the editor itself when it lands,
 * and a Cancel pressed before then would not stop it.
 *
 * The time is sent only when it changed, so the server keeps the clock time
 * the file carried, seconds and all, and invents nothing (`items.md`
 * § The capture date, step 2).
 */
export function CaptureDateSaveRow({
  detail,
  wallClock,
  day,
  time,
  onDone,
}: Readonly<Props>): ReactNode {
  const write = useSetItemCaptureDate(detail.itemId);
  const isUnchanged = day === detail.capturedOn && time === wallClock.time;

  return (
    <>
      {write.error === undefined ? null : (
        <Prose role="alert">{write.error}</Prose>
      )}
      <ChipRow>
        <Button
          disabled={write.isSaving || time === ""}
          onClick={() => {
            if (isUnchanged) {
              onDone();
              return;
            }
            write.save(
              time === wallClock.time
                ? { capturedOn: day }
                : { capturedOn: day, capturedTime: time },
              { onSuccess: onDone },
            );
          }}
        >
          {write.isSaving ? "Putting it right" : "Put it right"}
        </Button>
        <Button variant="default" disabled={write.isSaving} onClick={onDone}>
          Cancel
        </Button>
      </ChipRow>
    </>
  );
}
