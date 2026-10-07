import type { ReactNode } from "react";
import type { ArchiveTotals } from "@/api/timeline/timeline";
import { Prose } from "@/system/typography/Prose";

type Props = {
  totals: ArchiveTotals;
};

/**
 * What an unnarrowed Find is looking at, which is everything.
 *
 * The figures are the rail's, summed in the browser exactly as the end of the
 * archive sums them, so the sheet and the foot of the pile cannot disagree
 * about how big this archive is.
 */
export function WholeArchive({ totals }: Readonly<Props>): ReactNode {
  return (
    <Prose onPanel>
      The whole archive: {totals.itemTotal.toLocaleString("en-GB")}{" "}
      {totals.itemTotal === 1 ? "photo or video" : "photos and videos"} across{" "}
      {totals.dayCount.toLocaleString("en-GB")}{" "}
      {totals.dayCount === 1 ? "day" : "days"}.
    </Prose>
  );
}
