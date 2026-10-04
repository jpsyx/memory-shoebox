import { Fieldset, Stack, TextInput, Textarea } from "@mantine/core";
import type { ReactNode } from "react";
import { MilestoneDateFields } from "@/system/MilestoneDateFields/MilestoneDateFields";
import type {
  useMilestoneForm,
  MilestoneFormOptions,
} from "../useMilestoneForm/useMilestoneForm";
type Props = {
  form: ReturnType<typeof useMilestoneForm>;
  options: Readonly<MilestoneFormOptions>;
  isBlocked: boolean;
};
/** Retained editable words and the existing shared date controls. */
export function MilestoneFormFields({
  form,
  options,
  isBlocked,
}: Readonly<Props>): ReactNode {
  return (
    <Fieldset
      disabled={isBlocked || options.detail?.canEdit === false}
      variant="unstyled"
    >
      <Stack gap="md">
        <TextInput
          label="What happened"
          value={form.name}
          onChange={(event) => {
            return form.setName(event.currentTarget.value);
          }}
          maxLength={200}
          autoFocus
        />
        <MilestoneDateFields
          span={form.span}
          onChange={form.setSpan}
          coveredDates={options.selection?.map((item) => {
            return item.capturedOn;
          })}
        />
        <Textarea
          label="A line about it"
          description="Optional. It sits under the name in the timeline."
          value={form.blurb}
          onChange={(event) => {
            return form.setBlurb(event.currentTarget.value);
          }}
          maxLength={280}
        />
      </Stack>
    </Fieldset>
  );
}
