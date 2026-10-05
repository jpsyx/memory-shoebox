import { Prose } from "@/system/typography/Prose";
import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { useMilestoneForm } from "../../useMilestoneForm/useMilestoneForm";
import type { MilestoneFormPart } from "../MilestoneForm.types";
type Props = MilestoneFormPart;
/** Announced saving/errors and explicit submit or review controls. */
export function MilestoneFormControls({
  form,
  options,
  isBlocked,
}: Readonly<
  Omit<Props, "options"> & { options: Parameters<typeof useMilestoneForm>[0] }
>): ReactNode {
  return (
    <>
      {" "}
      {form.error ? (
        <div role="alert">
          <Prose>{form.error}</Prose>
        </div>
      ) : null}
      {form.isSaving ? <div role="status">Saving the occasion.</div> : null}
      <Group>
        <Button
          type="submit"
          disabled={isBlocked || options.detail?.canEdit === false}
        >
          {options.detail
            ? "Save the changes"
            : "Create it and find its photographs"}
        </Button>
        <Button
          variant="default"
          disabled={form.isSaving}
          onClick={options.onCancel}
        >
          {form.isUncertain ? "Return to the list and review" : "Cancel"}
        </Button>
      </Group>
    </>
  );
}
