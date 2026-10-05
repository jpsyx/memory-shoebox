import { Stack, Switch } from "@mantine/core";
import type { ReactNode } from "react";
import { MilestoneDateFeedback } from "./MilestoneDateFeedback";
import { MilestoneDayField } from "./MilestoneDayField";
import { MilestoneRangeField } from "./MilestoneRangeField";
/** The editable dates of an occasion before a request is validated. */
export type MilestoneSpan = {
  startsOn: string | undefined;
  endsOn: string | undefined;
  isMultiDay: boolean;
};

type Props = {
  span: MilestoneSpan;
  onChange: (span: MilestoneSpan) => void;
  coveredDates?: string[];
  selectionLabel?: string;
  error?: string;
};

/** Offers one day or a span and explains mismatched photographs. */
export function MilestoneDateFields({
  span,
  error,
  onChange,
  coveredDates = [],
  selectionLabel = "the photographs you ticked",
}: Readonly<
  Omit<Props, "span" | "coveredDates"> & {
    span: Readonly<MilestoneSpan>;
    coveredDates?: readonly string[];
  }
>): ReactNode {
  const Field = span.isMultiDay ? MilestoneRangeField : MilestoneDayField;
  return (
    <Stack gap="md">
      <Switch
        checked={span.isMultiDay}
        onChange={(event) => {
          const isMultiDay = event.currentTarget.checked;
          onChange({
            ...span,
            isMultiDay,
            endsOn: isMultiDay ? (span.endsOn ?? span.startsOn) : undefined,
          });
        }}
        label="It ran over more than one day"
        description="A visit, a weekend, an orientation week."
      />
      <Field span={span} error={error} onChange={onChange} />
      <MilestoneDateFeedback
        span={span}
        coveredDates={coveredDates}
        selectionLabel={selectionLabel}
      />
    </Stack>
  );
}
