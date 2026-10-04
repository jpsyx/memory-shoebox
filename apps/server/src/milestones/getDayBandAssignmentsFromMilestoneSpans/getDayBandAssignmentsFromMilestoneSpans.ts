import {
  getDayCountFromMilestone,
  getDaysFromMilestone,
} from "../../archive/milestoneSpanHelpers/milestoneSpanHelpers.ts";

/** Dates used to assign a milestone band independently of any viewer. */
export type MilestoneSpanRow = {
  milestoneId: string;
  startsOn: string;
  endsOn: string;
};

/** The headline and continuation occasions assigned to a calendar day. */
export type DayBandAssignment = {
  bandMilestoneId: string | undefined;
  continuesMilestoneIds: string[];
};

/** Start and ID order keeps continuation strips stable. */
function _compareSpansByStartAndId(
  left: Readonly<MilestoneSpanRow>,
  right: Readonly<MilestoneSpanRow>,
): number {
  return (
    left.startsOn.localeCompare(right.startsOn) ||
    left.milestoneId.localeCompare(right.milestoneId)
  );
}

/** Narrower spans take precedence before the stable start and ID order. */
function _compareSpansForBand(
  left: Readonly<MilestoneSpanRow>,
  right: Readonly<MilestoneSpanRow>,
): number {
  return (
    getDayCountFromMilestone(left) - getDayCountFromMilestone(right) ||
    _compareSpansByStartAndId(left, right)
  );
}

/**
 * Assigns occasion bands across the complete milestone day union.
 * @param spans Every milestone, independent of viewer and page bounds.
 */
export function getDayBandAssignmentsFromMilestoneSpans(
  spans: readonly MilestoneSpanRow[],
): Map<string, DayBandAssignment> {
  const days = [...new Set(spans.flatMap(getDaysFromMilestone))]
    .sort()
    .reverse();
  const introduced = new Set<string>();
  const assignments = new Map<string, DayBandAssignment>();
  days.forEach((day) => {
    const covering = spans
      .filter((span) => {
        return span.startsOn <= day && span.endsOn >= day;
      })
      .sort(_compareSpansByStartAndId);
    const [band] = covering
      .filter((span) => {
        return !introduced.has(span.milestoneId);
      })
      .sort(_compareSpansForBand);
    if (band !== undefined) {
      introduced.add(band.milestoneId);
    }
    assignments.set(day, {
      bandMilestoneId: band?.milestoneId,
      continuesMilestoneIds: covering
        .filter((span) => {
          return span.milestoneId !== band?.milestoneId;
        })
        .map((span) => {
          return span.milestoneId;
        }),
    });
  });
  return assignments;
}
