import { useState, type ReactNode } from "react";
import { Button, Divider, Group, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { milestonesQueryOptions } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import { UploadMilestoneList } from "@/surfaces/Upload/UploadMilestoneModal/UploadMilestoneList/UploadMilestoneList";
import type { TimelineBulkFormProps } from "./TimelineBulkDialog";
import { TimelineMilestoneCreate } from "./TimelineMilestoneCreate";
import classes from "./TimelineMilestoneForm.module.css";

/** The same occasion list as upload, attaching without changing capture dates. */
export function TimelineMilestoneForm(
  props: Readonly<TimelineBulkFormProps>,
): ReactNode {
  const [chosenId, setChosenId] = useState<string>();
  const directory = useQuery(milestonesQueryOptions());
  const isEmpty = directory.isSuccess && directory.data.milestones.length === 0;
  return (
    <Stack gap="md">
      <Text>
        Choose an existing milestone or start a new one. Capture dates stay
        unchanged.
      </Text>
      <MilestoneDirectoryState directory={directory} />
      <UploadMilestoneList
        entries={directory.data?.milestones ?? []}
        chosenId={chosenId}
        onChoose={setChosenId}
        isLocked={props.isBlocked || !directory.isSuccess}
      />
      {!isEmpty ? <Divider /> : null}
      <TimelineMilestoneCreate props={props} isEmpty={isEmpty} />
      <MilestoneActions
        props={props}
        chosenId={chosenId}
        isReady={directory.isSuccess}
        isEmpty={isEmpty}
      />
    </Stack>
  );
}

function MilestoneDirectoryState({
  directory,
}: Readonly<{
  directory: ReturnType<
    typeof useQuery<import("@memory-shoebox/shared").ListMilestonesResponse>
  >;
}>): ReactNode {
  return (
    <>
      {directory.isPending ? <Text>Loading milestones…</Text> : null}
      {directory.isError ? (
        <div role="alert">
          <Text>Milestones could not be loaded.</Text>
          <Button
            variant="default"
            onClick={() => {
              void directory.refetch();
            }}
          >
            Retry milestones
          </Button>
        </div>
      ) : null}
      {directory.isSuccess && directory.data.milestones.length === 0 ? (
        <Text>No milestones yet. Make this selection the start of one.</Text>
      ) : null}
    </>
  );
}

function MilestoneActions({
  props,
  chosenId,
  isReady,
  isEmpty,
}: Readonly<{
  props: TimelineBulkFormProps;
  chosenId: string | undefined;
  isReady: boolean;
  isEmpty: boolean;
}>): ReactNode {
  return (
    <Group className={classes.actions}>
      {!isEmpty ? (
        <Button
          disabled={props.isBlocked || !chosenId || !isReady}
          loading={props.isBusy}
          onClick={() => {
            if (chosenId) {
              props.onSubmit({
                action: "milestone",
                itemIds: [...props.itemIds],
                milestoneId: chosenId,
              });
            }
          }}
        >
          Attach {props.itemIds.length}
        </Button>
      ) : null}
      <Button variant="default" disabled={props.isBusy} onClick={props.onClose}>
        Cancel
      </Button>
    </Group>
  );
}
