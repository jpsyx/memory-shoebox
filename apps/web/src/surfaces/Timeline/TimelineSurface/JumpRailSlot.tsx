import type { ReactNode } from "react";
import type { RailDay, TimelineDay } from "@memory-shoebox/shared";
import { JumpRail } from "@/surfaces/Timeline/JumpRail/JumpRail";

type Props = {
  railDays: readonly RailDay[];
  days: readonly TimelineDay[];
  onRestart: (at: string) => void;
};

/**
 * The rail occupies its own row so dates and media counts have room.
 *
 * No rail where there is nothing to jump to. The dead end still draws the
 * pile under it, deliberately, and a select carrying no options is a
 * control that answers nothing and still takes a tab stop.
 */
export function JumpRailSlot({
  railDays,
  days,
  onRestart,
}: Readonly<Props>): ReactNode {
  if (railDays.length === 0) {
    return null;
  }
  return (
    <JumpRail
      days={railDays}
      loadedDays={days.map((day) => {
        return day.capturedOn;
      })}
      standingOn={days[0]?.capturedOn}
      onRestart={onRestart}
    />
  );
}
