import { DatePickerInput } from "@mantine/dates";
import type { ReactNode } from "react";
import type { MilestoneSpan } from "./MilestoneDateFields";
type Props = {
  span: MilestoneSpan;
  error?: string;
  onChange: (span: MilestoneSpan) => void;
};
/** Edits the occasion's inclusive first and last days. */
export function MilestoneRangeField({
  span,
  error,
  onChange,
}: Readonly<
  Omit<Props, "span"> & { span: Readonly<MilestoneSpan> }
>): ReactNode {
  return (
    <DatePickerInput
      error={error}
      type="range"
      label="When it ran"
      description="Both ends are part of it."
      placeholder="Pick the first and last day"
      value={[span.startsOn ?? null, span.endsOn ?? null]}
      onChange={([startsOn, endsOn]) => {
        onChange({
          ...span,
          startsOn: startsOn ?? undefined,
          endsOn: endsOn ?? undefined,
        });
      }}
    />
  );
}
