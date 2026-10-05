import { Button, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";

/** Explicit pending or unavailable observation state with a deliberate retry. */
export function PresenceReadState(
  options: Readonly<{ isPending: boolean; onRetry: () => void; label: string }>,
): ReactNode {
  return (
    <Stack gap="sm">
      <Prose>
        {options.isPending
          ? `Loading ${options.label}…`
          : `The ${options.label} could not be loaded. It may be unavailable or your access may have changed.`}
      </Prose>
      {options.isPending ? null : (
        <Button variant="default" onClick={options.onRetry}>
          Retry
        </Button>
      )}
    </Stack>
  );
}
