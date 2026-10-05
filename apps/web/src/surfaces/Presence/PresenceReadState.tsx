import { Button, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
type Props = { isPending: boolean; onRetry: () => void; label: string };

/**
 * Explicit pending or unavailable observation state with a deliberate retry.
 */
export function PresenceReadState({
  isPending,
  onRetry,
  label,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="sm">
      <Prose>
        {isPending
          ? `Loading ${label}…`
          : `The ${label} could not be loaded. It may be unavailable or your access may have changed.`}
      </Prose>
      {isPending ? null : (
        <Button variant="default" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Stack>
  );
}
