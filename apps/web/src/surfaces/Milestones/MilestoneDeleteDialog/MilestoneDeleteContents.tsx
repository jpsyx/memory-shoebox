import { Button, Group, Stack } from "@mantine/core";
import type { ReactNode, ComponentProps } from "react";
import { Prose } from "@/system/typography/Prose";
import type { MilestoneDeleteDialog } from "./MilestoneDeleteDialog";
import type { useMilestoneDeletion } from "./useMilestoneDeletion";
type Props = {
  options: Readonly<ComponentProps<typeof MilestoneDeleteDialog>>;
  deletion: ReturnType<typeof useMilestoneDeletion>;
};
function _MilestoneDeleteFeedback({
  deletion,
}: Readonly<Pick<Props, "deletion">>): ReactNode {
  return (
    <>
      {" "}
      {deletion.error ? (
        <div role="alert">
          <Prose>{deletion.error}</Prose>
        </div>
      ) : null}
      {deletion.isPending ? (
        <div role="status">Updating the occasion.</div>
      ) : null}
    </>
  );
}
/** Label-only confirmation words and guarded delete/refresh controls. */
export function MilestoneDeleteContents({
  options,
  deletion,
}: Readonly<Props>): ReactNode {
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
      <_MilestoneDeleteFeedback deletion={deletion} />
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
