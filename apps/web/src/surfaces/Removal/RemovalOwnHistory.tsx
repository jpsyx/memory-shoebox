import { Button, Stack } from "@mantine/core";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { RemovalRequestCard } from "@/surfaces/RemovalRequests/RemovalRequestCard/RemovalRequestCard";
import type { RemovalActions } from "@/surfaces/RemovalRequests/useRemovalActions/useRemovalActions";
import { RemovalOwnOutcome } from "./RemovalOwnOutcome";
import classes from "./RemovalOwnHistory.module.css";
type Props = {
  timezone: string;
  request: RemovalRequestDto;
  viewer: Viewer;
  actions: RemovalActions;
  canAsk: boolean;
  onAskAgain: () => void;
};

/** Own request outcomes preserve the original and actual responder words. */
export function RemovalOwnHistory({
  request,
  viewer,
  actions,
  canAsk,
  onAskAgain,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      <RemovalOwnOutcome request={request} />
      <RemovalRequestCard
        timezone={timezone}
        request={request}
        viewer={viewer}
        onDelete={actions.openDelete}
        onDecline={actions.openDecline}
        onWithdraw={actions.isPending ? undefined : actions.withdraw}
      />
      {canAsk ? (
        <Button
          variant="default"
          className={classes.askAgain}
          onClick={onAskAgain}
          disabled={actions.isPending}
        >
          Ask again
        </Button>
      ) : null}
    </Stack>
  );
}
