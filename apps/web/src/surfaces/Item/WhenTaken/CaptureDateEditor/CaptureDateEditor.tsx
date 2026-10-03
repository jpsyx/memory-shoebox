import { Stack } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import {
  captureMomentLabel,
  getWallClockFromCapture,
  type WallClock,
} from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
import classes from "@/surfaces/Item/WhenTaken/CaptureDateEditor/CaptureDateEditor.module.css";
import { useSetItemCaptureDate } from "@/surfaces/Item/itemWrites/useSetItemCaptureDate";
import { CaptureDateFields } from "@/surfaces/Item/WhenTaken/CaptureDateFields";
import { CaptureDateSaveRow } from "@/surfaces/Item/WhenTaken/CaptureDateSaveRow";
import { DateMoveWarnings } from "@/surfaces/Item/WhenTaken/DateMoveWarnings";

type Props = {
  detail: ItemDetail;
  timezone: string;
  /** The capture's wall clock now. */
  wallClock: WallClock;
  onDone: () => void;
};

/** What the file itself said, on the clock where it was taken. */
function _fileSaidLabel(
  options: Readonly<{ detail: ItemDetail; timezone: string }>,
): string {
  const { detail, timezone } = options;
  return captureMomentLabel(
    getWallClockFromCapture({
      capturedAt: detail.originalCapturedAt,
      offsetMinutes: detail.capturedAtOffsetMinutes ?? undefined,
      timezone,
    }),
  );
}

/**
 * Putting the date right: the one edit that destroys something the file said,
 * so it names what the file said and what the move will break before it does
 * anything.
 *
 * A screen reader hears the warning as the day changes. The fields wait
 * while a correction is out, so nothing typed then is lost when its answer
 * closes the editor.
 */
export function CaptureDateEditor({
  detail,
  timezone,
  wallClock,
  onDone,
}: Readonly<Props>): ReactNode {
  const write = useSetItemCaptureDate(detail.itemId);
  const [day, setDay] = useState(detail.capturedOn);
  const [time, setTime] = useState(wallClock.time);
  // The warning's `status` region is always drawn: a live region that
  // arrives already holding its words is not announced.
  return (
    <Stack gap="md">
      <Prose>
        The file said <b>{_fileSaidLabel({ detail, timezone })}</b>. If that is
        wrong, put it right: the date is what decides which day this sits on and
        which milestone it falls inside.
      </Prose>
      <CaptureDateFields
        day={day}
        time={time}
        timezone={timezone}
        isDisabled={write.isSaving}
        onDayChange={setDay}
        onTimeChange={setTime}
      />
      <div role="status" className={classes.captureDateEditorStatus}>
        <DateMoveWarnings detail={detail} day={day} />
      </div>
      <CaptureDateSaveRow
        write={write}
        detail={detail}
        wallClock={wallClock}
        day={day}
        time={time}
        onDone={onDone}
      />
      <Prose>
        Whatever the file originally said is kept, so this is always undoable,
        however many times the date is moved.
      </Prose>
    </Stack>
  );
}
