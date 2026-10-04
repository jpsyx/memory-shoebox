import { Button } from "@mantine/core";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";

type Props = {
  request: RemovalRequestDto;
  onDelete: (request: RemovalRequestDto) => void;
  onDecline: (request: RemovalRequestDto) => void;
  onWithdraw?: (request: RemovalRequestDto) => void;
};
/** Role supplies no action authority, including proxy withdrawal. */
export function RemovalRequestControls({
  request,
  onDelete,
  onDecline,
  onWithdraw,
}: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      {request.canDeleteItem ? (
        <Button
          variant="danger"
          onClick={() => {
            onDelete(request);
          }}
        >
          Delete it
        </Button>
      ) : null}
      {request.canDecline ? (
        <Button
          variant="default"
          onClick={() => {
            onDecline(request);
          }}
        >
          Keep it, and say why
        </Button>
      ) : null}
      {request.canWithdraw && onWithdraw !== undefined ? (
        <Button
          variant="default"
          onClick={() => {
            onWithdraw(request);
          }}
        >
          Withdraw the request
        </Button>
      ) : null}
    </ChipRow>
  );
}
