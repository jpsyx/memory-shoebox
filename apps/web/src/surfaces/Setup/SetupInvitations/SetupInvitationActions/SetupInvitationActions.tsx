import { Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { SetupInvitationsFlow } from "../../setupFlow.types";
import classes from "./SetupInvitationActions.module.css";

type Props = { form: SetupInvitationsFlow };
/** Clear add, send/retry and skip actions keep invitations optional. */
export function SetupInvitationActions({ form }: Readonly<Props>): ReactNode {
  const hasFailures = form.rows.some((row) => {
    return row.error !== undefined;
  });
  return (
    <Stack>
      <Button variant="default" onClick={form.onAdd} disabled={form.isBusy}>
        Add another person
      </Button>
      {form.completionError === undefined ? null : (
        <Text role="alert" className={classes.setupInvitationActionsError}>
          {form.completionError}
        </Text>
      )}
      <Group>
        <Button type="submit" loading={form.isBusy}>
          {hasFailures ? "Retry invitations" : "Send invitations"}
        </Button>
        <Button variant="default" onClick={form.onSkip} disabled={form.isBusy}>
          Skip for now
        </Button>
      </Group>
    </Stack>
  );
}
