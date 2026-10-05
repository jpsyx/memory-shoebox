import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import {
  useMilestoneForm,
  type MilestoneFormOptions,
} from "../../useMilestoneForm/useMilestoneForm";
import { MilestoneFormControls } from "./MilestoneFormControls";
import { MilestoneFormFields } from "./MilestoneFormFields/MilestoneFormFields";
type Props = {
  options: MilestoneFormOptions;
  form: ReturnType<typeof useMilestoneForm>;
  isBlocked: boolean;
};
/** Presents the editable occasion form. */
export function MilestoneFormLayout({
  options,
  form,
  isBlocked,
}: Readonly<
  Omit<Props, "options"> & { options: Parameters<typeof useMilestoneForm>[0] }
>): ReactNode {
  return (
    <Sheet wide label={options.detail ? "Edit milestone" : "A new milestone"}>
      <SheetHead
        title={
          options.detail
            ? options.detail.milestone.name
            : "A new milestone, from nothing"
        }
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          form.onSubmit();
        }}
        aria-busy={form.isSaving}
      >
        <Stack gap="md">
          <MilestoneFormFields
            form={form}
            options={options}
            isBlocked={isBlocked}
          />
          <MilestoneFormControls
            form={form}
            options={options}
            isBlocked={isBlocked}
          />
        </Stack>
      </form>
    </Sheet>
  );
}
