import { NativeSelect } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { RailDay } from "@memory-shoebox/shared";
import { getJumpFromRail } from "@/surfaces/Timeline/jumpRail/getJumpFromRail";
import { ICON_PROPS } from "@/system/icons";
import { dayNumberLabel, monthLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import classes from "@/system/system.module.css";

type Props = {
  days: readonly RailDay[];
  loadedDays: readonly string[];
  /** The day the stream is standing on, which is the control's value. */
  standingOn: string | undefined;
  /** Restarts the stream at a day the pile does not hold. */
  onRestart: (at: string) => void;
};

/**
 * One control that moves the whole field.
 *
 * A native select rather than an invented list, because the audience skews
 * older and a native affordance beats a discovered one: it is reachable with a
 * keyboard, it types ahead, and on a phone it is the operating system's own
 * picker.
 */
export function JumpRail({
  days,
  loadedDays,
  standingOn,
  onRestart,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.rail}>
      <NativeSelect
        label={<LabelText component="span">Jump to</LabelText>}
        rightSection={<IconChevronDown {...ICON_PROPS} />}
        value={standingOn ?? days[0]?.capturedOn ?? ""}
        data={days.map((day) => {
          return {
            value: day.capturedOn,
            label: `${dayNumberLabel(day.capturedOn)} ${monthLabel(day.capturedOn).slice(0, 3)} · ${day.itemCount}`,
          };
        })}
        onChange={(event) => {
          const jump = getJumpFromRail({
            capturedOn: event.currentTarget.value,
            loadedDays,
          });
          if (jump.kind === "restart") {
            onRestart(jump.at);
            return;
          }
          document
            .getElementById(jump.anchorId)
            ?.scrollIntoView({ block: "start", behavior: "auto" });
        }}
      />
    </div>
  );
}
