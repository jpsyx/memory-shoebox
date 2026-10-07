import { Prose } from "@/system/typography/Prose";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
type Props = {
  isPending: boolean;
  isError: boolean;
  error?: string;
  isLocked: boolean;
  onRetry: () => void;
};
/** Distinguishes an unavailable directory from an empty occasion list. */
export function UploadMilestoneStatus({
  isPending,
  isError,
  error,
  isLocked,
  onRetry,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {isPending ? <Prose>Loading milestones…</Prose> : null}
      {isError ? (
        <div role="alert">
          <Prose>
            Milestones are unavailable. Try again to choose or create one.
          </Prose>
          <Button
            mt="sm"
            variant="default"
            disabled={isLocked}
            onClick={onRetry}
          >
            Retry milestones
          </Button>
        </div>
      ) : null}
      {error ? (
        <div role="alert">
          <Prose>{error}</Prose>
        </div>
      ) : null}
    </>
  );
}
