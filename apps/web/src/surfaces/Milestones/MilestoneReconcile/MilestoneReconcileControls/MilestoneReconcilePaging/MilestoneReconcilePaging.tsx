import { Prose } from "@/system/typography/Prose";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { Props as OwnerProps } from "../MilestoneReconcileControls";
import classes from "./MilestoneReconcilePaging.module.css";
type Props = Pick<OwnerProps, "controller">;
/** Presents milestone reconcile paging. */
export function MilestoneReconcilePaging({
  controller,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {controller.hasMore ? (
        <Button
          variant="panel"
          classNames={{
            root: classes.milestoneReconcilePagingButton,
            label: classes.milestoneReconcilePagingLabel,
          }}
          disabled={controller.isPending}
          onClick={controller.loadMore}
        >
          Show more photographs (up to 500 per batch)
        </Button>
      ) : null}
      {controller.strays.length === 500 ? (
        <Prose onPanel>
          Showing the maximum batch of 500. Save this batch to read the
          remaining mismatches.
        </Prose>
      ) : null}
    </>
  );
}
