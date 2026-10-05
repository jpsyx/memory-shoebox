import type { ActivityEntryDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { LabelText } from "@/system/typography/LabelText";
import { getActivityDaysFromEntries } from "./activityCopy/activityCopy";
import { ActivityRow } from "./ActivityRow";
import classes from "./Changes.module.css";

/** All loaded events share one local-day grouping, including across page boundaries. */
export function ActivityDays(
  options: Readonly<{ entries: readonly ActivityEntryDto[]; timezone: string }>,
): ReactNode {
  const days = getActivityDaysFromEntries(options);
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: options.timezone,
    dateStyle: "long",
  });
  return (
    <div>
      {days.map(({ day, entries }) => {
        return (
          <div className={classes.day} key={day}>
            <LabelText component="h3">
              {formatter.format(new Date(entries[0]!.occurredAt))}
            </LabelText>
            {entries.map((entry) => {
              return (
                <ActivityRow
                  key={entry.entryId}
                  entry={entry}
                  timezone={options.timezone}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
