import { Stack } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import {
  captureMomentLabel,
  getWallClockFromCapture,
  type WallClock,
} from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
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

/**
 * Putting the date right: the one edit that destroys something the file said,
 * so it names what the file said and what the move will break before it does
 * anything.
 */
export function CaptureDateEditor({
  detail,
  timezone,
  wallClock,
  onDone,
}: Readonly<Props>): ReactNode {
  const [day, setDay] = useState(detail.capturedOn);
  const [time, setTime] = useState(wallClock.time);
  const original = getWallClockFromCapture({
    capturedAt: detail.originalCapturedAt,
    offsetMinutes: detail.capturedAtOffsetMinutes,
    timezone,
  });

  return (
    <Stack gap="md">
      <Prose>
        The file said <b>{captureMomentLabel(original)}</b>. If that is wrong,
        put it right: the date is what decides which day this sits on and which
        milestone it falls inside.
      </Prose>
      <CaptureDateFields
        day={day}
        time={time}
        timezone={timezone}
        onDayChange={setDay}
        onTimeChange={setTime}
      />
      <DateMoveWarnings detail={detail} day={day} />
      <CaptureDateSaveRow
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
