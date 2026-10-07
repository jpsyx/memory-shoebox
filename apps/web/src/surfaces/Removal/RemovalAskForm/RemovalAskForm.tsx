import { RemovalAskControls } from "./RemovalAskControls";
import { Stack, Textarea } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { RemovalAskFeedback } from "./RemovalAskFeedback";
import type { RemovalAsk } from "../useRemovalAsk/useRemovalAsk";
type Props = { ask: RemovalAsk; itemId: string; isAuthorityPending: boolean };

/**
 * An optional private reason that survives failures and blocks duplicate
 * sends.
 */
export function RemovalAskForm({
  ask,
  itemId,
  isAuthorityPending,
}: Readonly<Props>): ReactNode {
  const [reason, setReason] = useState("");
  return (
    <Sheet wide label="The request">
      <Stack gap="md">
        <Textarea
          label="Why, if you want to say"
          description="Optional. Only the uploader and admins can read it."
          value={reason}
          onChange={(event) => {
            return setReason(event.currentTarget.value);
          }}
          error={ask.fieldErrors.reason?.join(" ")}
          disabled={ask.isPending || isAuthorityPending}
        />
        <RemovalAskFeedback ask={ask} />
        <RemovalAskControls
          itemId={itemId}
          isDisabled={ask.isPending || isAuthorityPending}
          onSend={() => {
            return ask.send(reason);
          }}
        />
      </Stack>
    </Sheet>
  );
}
