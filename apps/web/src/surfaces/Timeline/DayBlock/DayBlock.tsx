import type { ReactNode } from "react";
import type { ItemSummary, TimelineDay } from "@memory-shoebox/shared";
import { MilestoneEmptyPile } from "@/surfaces/Timeline/DayBlock/MilestoneEmptyPile";
import { DayRow } from "@/system/Pile/DayRow";
import { DaySpine } from "@/system/Pile/DaySpine";
import { MilestoneBand } from "@/system/Pile/MilestoneBand";
import { MilestoneContinues } from "@/system/Pile/MilestoneContinues";
import { Pile } from "@/system/Pile/Pile";
import { PileItems } from "@/system/Pile/PileItems/PileItems";
import classes from "@/system/system.module.css";

type Props = {
  day: TimelineDay;
  /** The unit word beside the count, when a filter supplies one. */
  countLabel: string | undefined;
  framesByBurstId: ReadonlyMap<string, readonly ItemSummary[]>;
  onOpenBurst: (burstId: string) => void;
};

/**
 * One day of the pile: the spine, whatever occasions cover it, and its prints.
 *
 * **The client re-derives none of the milestone ranking.** Which occasion takes
 * the day's one full band, and which are continuation strips, is resolved by
 * the server across the whole feed and carried in the payload (Decision 14).
 * Re-deriving it here would give a different answer at a page boundary, where
 * the client cannot see what took a band further up.
 *
 * The anchor id is what the jump rail scrolls to for a day already loaded.
 */
export function DayBlock({
  day,
  countLabel,
  framesByBurstId,
  onOpenBurst,
}: Readonly<Props>): ReactNode {
  return (
    <DayRow>
      <DaySpine day={day} countLabel={countLabel} />
      <Pile>
        <span id={`day-${day.capturedOn}`} className={classes.railSpacer} />
        {day.milestoneBand === null ? null : (
          <MilestoneBand band={day.milestoneBand} />
        )}
        {day.milestoneStrips.map((strip) => {
          return (
            <MilestoneContinues
              key={strip.milestone.milestoneId}
              strip={strip}
            />
          );
        })}
        {day.items.length === 0 ? <MilestoneEmptyPile /> : null}
        <PileItems
          items={day.items}
          framesByBurstId={framesByBurstId}
          onOpenBurst={onOpenBurst}
        />
      </Pile>
    </DayRow>
  );
}
