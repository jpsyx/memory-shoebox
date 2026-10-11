import type { ReactNode } from "react";
import type { RailDay } from "@memory-shoebox/shared";
import { getJumpFromRail } from "@/surfaces/Timeline/getJumpFromRail/getJumpFromRail";
import { Select } from "@/system/Select/Select";
import { railDayLabel } from "./railDayLabel";
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

/** Moves to any visible day, scrolling locally or restarting the stream. */
export function JumpRail({
  days,
  loadedDays,
  standingOn,
  onRestart,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.rail}>
      <Select
        label={<LabelText component="span">Jump to</LabelText>}
        value={standingOn ?? days[0]?.capturedOn ?? ""}
        data={days.map((day) => {
          return {
            value: day.capturedOn,
            label: railDayLabel(day),
          };
        })}
        onChange={(capturedOn) => {
          const jump = getJumpFromRail({
            capturedOn,
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
