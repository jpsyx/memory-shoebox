import { Stack } from "@mantine/core";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { Sheet } from "@/system/Chrome/Sheet";
import { RemovalRequestPreview } from "../RemovalRequestPreview";
import { RemovalRequestWords } from "./RemovalRequestWords";
import { RemovalRequestControls } from "./RemovalRequestControls";
import classes from "./RemovalRequestCard.module.css";

type Props = {
  request: RemovalRequestDto;
  viewer: Viewer;
  onDelete: (request: RemovalRequestDto) => void;
  onDecline: (request: RemovalRequestDto) => void;
  onWithdraw?: (request: RemovalRequestDto) => void;
};

/** A private request snapshot with controls granted only by its DTO. */
export function RemovalRequestCard({
  request,
  onDelete,
  onDecline,
  onWithdraw,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label={`Request from ${request.requestedBy.displayName}`}>
      <Stack gap="md">
        <div className={classes.row}>
          <RemovalRequestPreview request={request} />
          <RemovalRequestWords request={request} />
        </div>
        <RemovalRequestControls
          request={request}
          onDelete={onDelete}
          onDecline={onDecline}
          onWithdraw={onWithdraw}
        />
      </Stack>
    </Sheet>
  );
}
