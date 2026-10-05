import { Prose } from "@/system/typography/Prose";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
type Props = {
  isPending: boolean;
  isError: boolean;
  onRefresh: () => void;
};
/** Presents milestone directory read state. */
export function MilestoneDirectoryReadState({
  isPending,
  isError,
  onRefresh,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {isPending ? (
        <Prose onPanel role="status">
          Reading milestones.
        </Prose>
      ) : null}
      {isError ? (
        <>
          <Prose onPanel role="alert">
            Milestones could not be refreshed. Refresh the list before starting
            another change.
          </Prose>
          <Button variant="panel" onClick={onRefresh}>
            Refresh the list
          </Button>
        </>
      ) : null}
    </>
  );
}
