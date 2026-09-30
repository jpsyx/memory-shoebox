import type { ReactNode } from "react";
import type { ArchiveTotals } from "@/api/timeline/timeline";
import { dayLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  totals: ArchiveTotals;
};

/**
 * The foot of the archive.
 *
 * There is an end, and reaching the end of a family's whole history is worth
 * marking rather than just stopping.
 *
 * **The three figures are summed in the browser from the rail**, never served
 * as a totals object: such an object would be a second place a brand-new
 * archive and a fully restricted viewer could drift apart, which is exactly
 * what `timeline.md` transformation 10 refuses.
 */
export function ArchiveEnd({ totals }: Readonly<Props>): ReactNode {
  return (
    <div className={classes.archiveEnd}>
      <LabelText>The beginning</LabelText>
      <p className={classes.milestoneName}>That is all of it.</p>
      <div className={classes.archiveEndRow}>
        {totals.firstCapturedOn === null ? null : (
          <span>
            {dayLabel(totals.firstCapturedOn)}, the first day anything went up.
          </span>
        )}
        <span>
          {totals.itemTotal.toLocaleString("en-GB")}{" "}
          {totals.itemTotal === 1 ? "photo or video" : "photos and videos"}
        </span>
        <span>
          {totals.dayCount.toLocaleString("en-GB")}{" "}
          {totals.dayCount === 1 ? "day" : "days"}
        </span>
      </div>
      <Prose onPanel>
        Nothing is archived away and nothing expires. Scrolling to here means
        you have seen the whole thing.
      </Prose>
    </div>
  );
}
