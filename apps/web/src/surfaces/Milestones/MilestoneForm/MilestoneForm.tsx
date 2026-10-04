import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { MilestoneFormFields } from "./MilestoneFormFields";
import { MilestoneFormControls } from "./MilestoneFormControls";
import {
  useMilestoneForm,
  type MilestoneFormOptions,
} from "../useMilestoneForm/useMilestoneForm";
type Props = MilestoneFormOptions;
/** Create or edit an occasion, without changing photograph capture dates. */
export function MilestoneForm(options: Readonly<Props>): ReactNode {
  const form = useMilestoneForm(options);
  const isBlocked = form.isSaving || form.isUncertain || form.hasSaved;
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
