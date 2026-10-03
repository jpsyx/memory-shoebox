import { DatePickerInput, TimeInput } from "@mantine/dates";
import { IconCalendar } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";
import { getWallClockFromCapture } from "@/system/labelHelpers/labelHelpers";

type Props = {
  /** The day the field holds, `YYYY-MM-DD`. */
  day: string;
  /** The time the field holds, `HH:MM`, or empty while it is cleared. */
  time: string;
  /** `settings.timezone`, which says what today is. */
  timezone: string;
  /** A correction is out, and a change made now would be lost. */
  isDisabled: boolean;
  onDayChange: (day: string) => void;
  onTimeChange: (time: string) => void;
};

/** Today in the Shoebox's timezone, which is as late as a capture can be. */
function _todayIn(timezone: string): string {
  return getWallClockFromCapture({
    capturedAt: new Date().toISOString(),
    offsetMinutes: null,
    timezone,
  }).date;
}

/**
 * The day, capped at today in `settings.timezone`, and the time, pre-filled
 * with the capture's wall clock.
 *
 * The day takes focus as it mounts: pressing "Put the date right" unmounts the
 * button that had it, and the day is the first control and where a keyboard
 * starts.
 */
export function CaptureDateFields({
  day,
  time,
  timezone,
  isDisabled,
  onDayChange,
  onTimeChange,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <DatePickerInput
        label="The day it was taken"
        value={day}
        maxDate={_todayIn(timezone)}
        leftSection={<IconCalendar {...ICON_PROPS} />}
        disabled={isDisabled}
        autoFocus
        onChange={(nextDay) => {
          if (nextDay !== null) {
            onDayChange(nextDay);
          }
        }}
      />
      <TimeInput
        label="The time"
        description="Leave it if only the day was wrong."
        value={time}
        disabled={isDisabled}
        onChange={(event) => {
          return onTimeChange(event.currentTarget.value);
        }}
      />
    </>
  );
}
