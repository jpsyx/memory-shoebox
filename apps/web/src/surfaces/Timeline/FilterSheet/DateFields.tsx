import { Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { ChipRow } from "@/system/Chip/ChipRow";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";

type Props = {
  selection: TimelineSelection;
  onChange: (selection: TimelineSelection) => void;
};

/**
 * The "When" section: two native date inputs and the capture-date note.
 *
 * Native inputs rather than an invented calendar, because the audience skews
 * older and a native affordance beats a discovered one. Each change fires
 * immediately, exactly like a chip press.
 */
export function DateFields({
  selection,
  onChange,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="xs">
      <LabelText component="h3">When</LabelText>
      <ChipRow>
        <TextInput
          type="date"
          label="From"
          value={selection.from ?? ""}
          onChange={(event) => {
            onChange({
              ...selection,
              from:
                event.currentTarget.value === ""
                  ? undefined
                  : event.currentTarget.value,
            });
          }}
        />
        <TextInput
          type="date"
          label="Until"
          value={selection.until ?? ""}
          onChange={(event) => {
            onChange({
              ...selection,
              until:
                event.currentTarget.value === ""
                  ? undefined
                  : event.currentTarget.value,
            });
          }}
        />
      </ChipRow>
      <Prose>
        Dates are capture dates, not upload dates. A photograph taken in 2019
        and put up last week sits in 2019, where you would look for it.
      </Prose>
    </Stack>
  );
}
