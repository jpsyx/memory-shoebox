import { Stack, Switch } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconInfoCircle } from "@tabler/icons-react";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography";

/** What the fields are currently holding, in the shape the caller stores. */
export interface MilestoneSpan {
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly isMultiDay: boolean;
}

function toDate(value: string | null): Date | null {
  return value === null ? null : dayjs(value).toDate();
}

function toIso(value: Date | string | null): string | null {
  return value === null ? null : dayjs(value).format("YYYY-MM-DD");
}

/**
 * When an occasion happened.
 *
 * One date by default, because most occasions are one day and offering a
 * range first makes every birthday into a form. A switch turns it into a span
 * for the ones that are not: a week at the grandparents', a college
 * orientation, a christening weekend.
 *
 * The span is pre-filled from the capture dates of whatever is selected, so
 * the common case is confirming rather than choosing. Moving it off those
 * dates is allowed and says so in ordinary type: it is information, not an
 * error, because a party on Saturday that somebody photographed on Sunday is
 * a normal thing rather than a mistake.
 */
export function MilestoneDateFields({
  span,
  onChange,
  coveredDates = [],
  selectionLabel = "the photographs you ticked",
}: {
  readonly span: MilestoneSpan;
  readonly onChange: (next: MilestoneSpan) => void;
  /** The capture dates of whatever this milestone is being made from. */
  readonly coveredDates?: readonly string[];
  readonly selectionLabel?: string;
}): ReactNode {
  const outside = coveredDates.filter((date) => {
    if (span.startsOn === null) {
      return false;
    }
    const day = dayjs(date);
    return (
      day.isBefore(dayjs(span.startsOn), "day") ||
      day.isAfter(dayjs(span.endsOn ?? span.startsOn), "day")
    );
  });

  return (
    <Stack gap="md">
      <Switch
        checked={span.isMultiDay}
        onChange={(event) => {
          const isMultiDay = event.currentTarget.checked;
          onChange({
            ...span,
            isMultiDay,
            endsOn: isMultiDay ? (span.endsOn ?? span.startsOn) : null,
          });
        }}
        label="It ran over more than one day"
        description="A visit, a weekend, an orientation week."
      />

      {span.isMultiDay ? (
        <DatePickerInput
          type="range"
          label="When it ran"
          description="Both ends are part of it."
          placeholder="Pick the first and last day"
          value={[toDate(span.startsOn), toDate(span.endsOn)]}
          onChange={(next) => {
            const [start, end] = next as [Date | null, Date | null];
            onChange({
              ...span,
              startsOn: toIso(start),
              endsOn: toIso(end),
            });
          }}
        />
      ) : (
        <DatePickerInput
          label="When it happened"
          placeholder="Pick a day"
          value={toDate(span.startsOn)}
          onChange={(next) => {
            onChange({
              ...span,
              startsOn: toIso(next as Date | null),
              endsOn: null,
            });
          }}
        />
      )}

      {outside.length === 0 ? null : (
        <Banner icon={<IconInfoCircle {...ICON_PROPS} />}>
          <b>
            {outside.length} of {selectionLabel} were taken outside these dates.
          </b>{" "}
          They will still be attached: an occasion and the photographs of it do
          not have to agree, and plenty of parties get photographed the next
          morning. You will be asked afterwards whether to move the dates or
          move the photographs.
        </Banner>
      )}

      {coveredDates.length === 0 || span.startsOn === null ? (
        <Prose>
          Nothing is attached to it yet, so there is nothing to take the dates
          from. Choose when it happened and the next step offers you the
          photographs from those days.
        </Prose>
      ) : null}
    </Stack>
  );
}
