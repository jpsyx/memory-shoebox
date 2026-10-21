import { Button, Stack, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { TimelineBulkFormProps } from "./TimelineBulkDialog";
import classes from "./TimelineMilestoneForm.module.css";

const APP_ROUTE = getRouteApi("/_app");

/** Starts the existing creation workflow with this dialog's frozen selection. */
export function TimelineMilestoneCreate({
  props,
  isEmpty,
}: Readonly<{ props: TimelineBulkFormProps; isEmpty: boolean }>): ReactNode {
  const { viewer } = APP_ROUTE.useRouteContext();
  const navigate = useNavigate();
  return (
    <Stack gap="xs" align="flex-start">
      <Button
        classNames={{ root: classes.createButton, label: classes.createLabel }}
        variant={isEmpty ? "filled" : "default"}
        disabled={props.isBlocked}
        leftSection={<IconPlus size={18} aria-hidden />}
        onClick={() => {
          void navigate({
            to: "/milestones",
            search: { mode: "create" },
            state: {
              milestoneCreation: {
                memberId: viewer.memberId,
                selection:
                  props.milestoneSelection ??
                  props.itemIds.map((itemId) => {
                    return { itemId };
                  }),
              },
            },
          });
        }}
      >
        Create a new milestone
      </Button>
      <Text size="sm">
        Your {props.itemIds.length} selected photos and videos will come with
        you.
      </Text>
    </Stack>
  );
}
