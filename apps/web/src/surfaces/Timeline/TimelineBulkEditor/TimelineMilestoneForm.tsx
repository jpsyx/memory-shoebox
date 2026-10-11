import { useState, type ReactNode } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { milestonesQueryOptions } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import { UploadMilestoneList } from "@/surfaces/Upload/UploadMilestoneModal/UploadMilestoneList/UploadMilestoneList";
import type { TimelineBulkFormProps } from "./TimelineBulkDialog";

/** The same occasion list as upload, attaching without changing capture dates. */
export function TimelineMilestoneForm(
  props: Readonly<TimelineBulkFormProps>,
): ReactNode {
  const [chosenId, setChosenId] = useState<string>();
  const directory = useQuery(milestonesQueryOptions());
  return (
    <Stack gap="md">
      <Text>
        Choose an occasion for the ticked photos and videos. Their capture dates
        will stay unchanged.
      </Text>
      <MilestoneDirectoryState directory={directory} />
      <UploadMilestoneList
        entries={directory.data?.milestones ?? []}
        chosenId={chosenId}
        onChoose={setChosenId}
        isLocked={props.isBlocked}
      />
      <MilestoneActions
        props={props}
        chosenId={chosenId}
        isReady={directory.isSuccess}
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
        <Text>
          No milestones yet. Create an occasion from Milestones, then return to
          attach these photos.
        </Text>
      ) : null}
    </>
  );
}

function MilestoneActions({
  props,
  chosenId,
  isReady,
}: Readonly<{
  props: TimelineBulkFormProps;
  chosenId: string | undefined;
  isReady: boolean;
}>): ReactNode {
  return (
    <Group>
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
      <Button variant="default" disabled={props.isBusy} onClick={props.onClose}>
        Cancel
      </Button>
    </Group>
  );
}
