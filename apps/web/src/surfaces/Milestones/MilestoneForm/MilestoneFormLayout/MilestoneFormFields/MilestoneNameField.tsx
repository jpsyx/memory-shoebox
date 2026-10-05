import { TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { MilestoneFormPart } from "../../MilestoneForm.types";
type Props = Pick<MilestoneFormPart, "form">;
/** Edits the occasion name with its retained field validation. */
export function MilestoneNameField({ form }: Readonly<Props>): ReactNode {
  return (
    <TextInput
      label="What happened"
      error={form.fieldErrors.name?.join(" ")}
      value={form.name}
      onChange={(event) => {
        return form.setName(event.currentTarget.value);
      }}
      maxLength={200}
      autoFocus
    />
  );
}
