import { Button, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
type Props = {
  hasNextPage: boolean;
  isFetching: boolean;
  hasFailed: boolean;
  onLoad: () => void;
};

/**
 * Retry keeps the failed cursor and earlier pages; pending requests cannot
 * repeat.
 */
export function ActivityPaging({
  hasNextPage,
  isFetching,
  hasFailed,
  onLoad,
}: Readonly<Props>): ReactNode {
  if (!hasNextPage) {
    return null;
  }
  return (
    <Stack gap="sm">
      {hasFailed ? (
        <Prose>
          Older changes could not be loaded. The changes above are still here.
        </Prose>
      ) : null}
      <Button variant="default" disabled={isFetching} onClick={onLoad}>
        {isFetching
          ? "Loading older changes…"
          : hasFailed
            ? "Retry older changes"
            : "Load older changes"}
      </Button>
    </Stack>
  );
}
