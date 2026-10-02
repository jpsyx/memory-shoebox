import type { ReactNode } from "react";
import type {
  BurstFrameRef,
  RailDay,
  TimelineDay,
} from "@memory-shoebox/shared";
import { getArchiveTotalsFromRail } from "@/api/timeline/timeline";
import { ArchiveEnd } from "@/surfaces/Timeline/ArchiveEnd/ArchiveEnd";
import { DayStream } from "@/surfaces/Timeline/DayStream";
import { JumpRailSlot } from "@/surfaces/Timeline/TimelineSurface/JumpRailSlot";

type Props = {
  days: readonly TimelineDay[];
  railDays: readonly RailDay[];
  countLabel: string | undefined;
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  hasMore: boolean;
  onOpenBurst: (burstId: string) => void;
  onReachEnd: () => void;
  onRestart: (at: string) => void;
};

/**
 * The rail, the stream, and the end of the archive, in that order.
 *
 * This is everything `Archive` holds once the surface is past the two empty
 * states: surface 2 and the tail of surface 6 both end here.
 */
export function ArchiveBody({
  days,
  railDays,
  countLabel,
  framesByBurstId,
  hasMore,
  onOpenBurst,
  onReachEnd,
  onRestart,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <JumpRailSlot railDays={railDays} days={days} onRestart={onRestart} />
      <DayStream
        days={days}
        countLabel={countLabel}
        framesByBurstId={framesByBurstId}
        onOpenBurst={onOpenBurst}
        onReachEnd={onReachEnd}
        hasMore={hasMore}
      />
      {hasMore || days.length === 0 ? null : (
        <ArchiveEnd totals={getArchiveTotalsFromRail(railDays)} />
      )}
    </>
  );
}
