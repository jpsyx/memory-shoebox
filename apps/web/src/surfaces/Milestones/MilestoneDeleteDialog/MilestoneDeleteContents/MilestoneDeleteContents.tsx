import { Prose } from "@/system/typography/Prose";
import { Button, Group, Stack } from "@mantine/core";
import type { ComponentProps, ReactNode } from "react";
import type { MilestoneDeleteDialog } from "../MilestoneDeleteDialog";
import type { useMilestoneDeletion } from "../useMilestoneDeletion";
import { MilestoneDeleteFeedback } from "./MilestoneDeleteFeedback";
/** Confirmation inputs and guarded deletion state. */
export type Props = {
  options: ComponentProps<typeof MilestoneDeleteDialog>;
  deletion: ReturnType<typeof useMilestoneDeletion>;
};
/** Label-only confirmation words and guarded delete/refresh controls. */
export function MilestoneDeleteContents({
  options,
  deletion,
}: Readonly<
  Omit<Props, "options"> & { options: Readonly<Props["options"]> }
>): ReactNode {
  return (
    <Stack gap="md">
      <Prose>
        Delete {options.detail.milestone.name}? Only the label and its
        attachments go. The photographs stay on the days they were taken.
      </Prose>
      <Prose>
        {options.detail.itemCount}{" "}
        {options.detail.itemCount === 1 ? "item is" : "items are"} attached for
        you to see.
      </Prose>
      <MilestoneDeleteFeedback deletion={deletion} />
      <Group>
        <Button disabled={deletion.isBlocked} onClick={deletion.onDelete}>
          Delete the milestone
        </Button>
        {deletion.error ? (
          <Button
            variant="default"
            disabled={deletion.isPending}
            onClick={() => {
              void deletion.onRefresh();
            }}
          >
            Refresh the occasion
          </Button>
        ) : null}
        <Button
          variant="default"
          disabled={deletion.isPending}
          onClick={options.onCancel}
        >
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}
