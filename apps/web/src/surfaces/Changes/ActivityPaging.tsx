import { Button, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";

/** Retry keeps the failed cursor and earlier pages; pending requests cannot repeat. */
export function ActivityPaging(
  options: Readonly<{
    hasNextPage: boolean;
    isFetching: boolean;
    hasFailed: boolean;
    onLoad: () => void;
  }>,
): ReactNode {
  if (!options.hasNextPage) return null;
  return (
    <Stack gap="sm">
      {options.hasFailed ? (
        <Prose>
          Older changes could not be loaded. The changes above are still here.
        </Prose>
      ) : null}
      <Button
        variant="default"
        disabled={options.isFetching}
        onClick={options.onLoad}
      >
        {options.isFetching
          ? "Loading older changes…"
          : options.hasFailed
            ? "Retry older changes"
            : "Load older changes"}
      </Button>
    </Stack>
  );
}
