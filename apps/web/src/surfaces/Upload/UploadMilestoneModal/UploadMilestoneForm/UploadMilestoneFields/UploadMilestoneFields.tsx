import { MilestoneDateFields } from "@/system/MilestoneDateFields/MilestoneDateFields";
import { Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { useUploadMilestoneForm } from "../../useUploadMilestoneForm";
import classes from "./UploadMilestoneFields.module.css";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  isLocked: boolean;
};

/**
 * Name, inclusive dates and optional copy using the established form fields.
 */
export function UploadMilestoneFields({
  form,
  isLocked,
}: Readonly<Props>): ReactNode {
  const disabled = isLocked || !!form.created;
  return (
    <Stack gap="md">
      <TextInput
        label="What happened"
        placeholder="Mateo's first night at home"
        maxLength={120}
        value={form.name}
        disabled={disabled}
        onChange={(event) => {
          return form.patch({ name: event.currentTarget.value });
        }}
      />
      <fieldset
        disabled={disabled}
        className={`${classes.uploadMilestoneFieldsGroup} ${classes.uploadMilestoneFieldsDescriptions}`}
      >
        <MilestoneDateFields
          span={form.span}
          onChange={(span) => {
            return form.patch({ span });
          }}
          coveredDates={form.coveredDates}
        />
      </fieldset>
      <TextInput
        label="A line about it"
        placeholder="He slept four hours, which we are told is good."
        maxLength={280}
        value={form.blurb}
        disabled={disabled}
        onChange={(event) => {
          return form.patch({ blurb: event.currentTarget.value });
        }}
      />
    </Stack>
  );
}
