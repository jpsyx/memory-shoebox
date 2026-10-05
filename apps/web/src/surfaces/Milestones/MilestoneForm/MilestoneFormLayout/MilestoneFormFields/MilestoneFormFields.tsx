import { MilestoneDateFields } from "@/system/MilestoneDateFields/MilestoneDateFields";
import { Fieldset, Stack, Textarea } from "@mantine/core";
import type { ReactNode } from "react";
import type { useMilestoneForm } from "../../../useMilestoneForm/useMilestoneForm";
import type { MilestoneFormPart } from "../../MilestoneForm.types";
import { MilestoneNameField } from "./MilestoneNameField";
type Props = MilestoneFormPart;
/** Retained editable words and the existing shared date controls. */
export function MilestoneFormFields({
  form,
  options,
  isBlocked,
}: Readonly<
  Omit<Props, "options"> & { options: Parameters<typeof useMilestoneForm>[0] }
>): ReactNode {
  const dateErrors = [
    form.fieldErrors.startsOn,
    form.fieldErrors.endsOn,
  ].flatMap((errors = []) => {
    return errors;
  });
  return (
    <Fieldset
      disabled={isBlocked || options.detail?.canEdit === false}
      variant="unstyled"
    >
      <Stack gap="md">
        <MilestoneNameField form={form} />
        <MilestoneDateFields
          error={dateErrors.join(" ") || undefined}
          span={form.span}
          onChange={form.setSpan}
          coveredDates={options.selection?.map((item) => {
            return item.capturedOn;
          })}
        />
        <Textarea
          label="A line about it"
          error={form.fieldErrors.blurb?.join(" ")}
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
