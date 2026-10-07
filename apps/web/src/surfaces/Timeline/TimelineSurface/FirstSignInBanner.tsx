import { IconInfoCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { RailDay } from "@memory-shoebox/shared";
import { getArchiveTotalsFromRail } from "@/api/timeline/timeline";
import { Banner } from "@/system/Chrome/Banner";
import { ICON_PROPS } from "@/system/icons";

type Props = {
  railDays: readonly RailDay[];
};

/**
 * The first-sign-in welcome, finished with the rail's own total.
 *
 * **The count is the rail's, not the timeline's.** `TimelineResponse` has no
 * total: `resultCount` is null on an unfiltered request by design, and
 * adding one would be a second place a brand-new archive and a fully
 * restricted viewer could drift apart, which `timeline.md` transformation 10
 * refuses. The rail's own total is viewer filtered already and never comes
 * from a seed.
 */
export function FirstSignInBanner({ railDays }: Readonly<Props>): ReactNode {
  const total = getArchiveTotalsFromRail(railDays).itemTotal;
  return (
    <Banner icon={<IconInfoCircle {...ICON_PROPS} />}>
      <b>Welcome in.</b> {total.toLocaleString("en-GB")} photos and videos are
      ready to look through.
    </Banner>
  );
}
