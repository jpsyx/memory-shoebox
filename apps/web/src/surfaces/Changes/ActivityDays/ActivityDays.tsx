import type { ActivityEntryDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { LabelText } from "@/system/typography/LabelText";
import { makeActivityDaysFromEntries } from "../activityCopyHelpers/activityCopyHelpers";
import { ActivityRow } from "../ActivityRow/ActivityRow";
import classes from "./ActivityDays.module.css";
type Props = { entries: readonly ActivityEntryDto[]; timezone: string };

/**
 * All loaded events share one local-day grouping, including across page
 * boundaries.
 */
export function ActivityDays({
  entries,
  timezone,
}: Readonly<Props>): ReactNode {
  const days = makeActivityDaysFromEntries({ entries, timezone });
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    dateStyle: "long",
  });
  return (
    <div>
      {days.map(({ day, entries: dayEntries }) => {
        return (
          <div className={classes.activityDaysDay} key={day}>
            <LabelText component="h3">
              {formatter.format(new Date(dayEntries[0]!.occurredAt))}
            </LabelText>
            {dayEntries.map((entry) => {
              return (
                <ActivityRow
                  key={entry.entryId}
                  entry={entry}
                  timezone={timezone}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
