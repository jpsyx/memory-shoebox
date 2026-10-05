import { makeMilestoneDetailFromOverrides } from "../../../../apps/web/src/testing/askingAndOccasionsFixtures.ts";
import type { MilestoneDetail } from "@memory-shoebox/shared";

import { VISUAL_OCCASIONS } from "./visualOccasions.constants.ts";

/** Prototype-scale occasion directory, with a genuine empty label. */
export function makeVisualOccasions(): MilestoneDetail[] {
  return VISUAL_OCCASIONS.map((row, index) => {
    return makeMilestoneDetailFromOverrides({
      milestone: {
        milestoneId: `018f0000-0000-7000-8000-00000000800${index + 1}`,
        name: row.name,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        blurb: row.blurb,
      },
      itemCount: row.count,
      dayCount: row.startsOn === row.endsOn ? 1 : 5,
    });
  });
}
