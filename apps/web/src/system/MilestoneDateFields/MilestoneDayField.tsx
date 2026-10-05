import { DatePickerInput } from "@mantine/dates";
import type { ReactNode } from "react";
import type { MilestoneSpan } from "./MilestoneDateFields";
type Props = {
  span: MilestoneSpan;
  error?: string;
  onChange: (span: MilestoneSpan) => void;
};
/** Edits the occasion's single day. */
export function MilestoneDayField({
  span,
  error,
  onChange,
}: Readonly<
  Omit<Props, "span"> & { span: Readonly<MilestoneSpan> }
>): ReactNode {
  return (
    <DatePickerInput
      error={error}
      label="When it happened"
      placeholder="Pick a day"
      value={span.startsOn ?? null}
      onChange={(chosenDate) => {
        onChange({
          ...span,
          startsOn: chosenDate ?? undefined,
          endsOn: undefined,
        });
      }}
    />
  );
}
