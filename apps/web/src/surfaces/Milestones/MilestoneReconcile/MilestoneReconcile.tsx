import classes from "./MilestoneReconcile.module.css";
import { Button, Stack } from "@mantine/core";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { Prose } from "@/system/typography/Prose";
import { useMilestoneReconcile } from "../useMilestoneReconcile/useMilestoneReconcile";
import { MilestoneReconcileFix } from "./MilestoneReconcileFix";
import { MilestoneReconcileControls } from "./MilestoneReconcileControls";
type Props = {
  detail: MilestoneDetail;
  viewer: Viewer;
  onDone: () => void;
  onOtherMilestone: (milestoneId: string) => void;
  hasUsableAuthority?: boolean;
};
/** Saved occasion reconciliation, remaining batches and named onward fixes. */
export function MilestoneReconcile({
  detail,
  viewer,
  onDone,
  onOtherMilestone,
  hasUsableAuthority,
}: Readonly<Props>): ReactNode {
  const controller = useMilestoneReconcile({
    detail,
    viewer,
    hasUsableAuthority,
  });
  return (
    <Stack gap="md">
      {controller.hasReadError ? (
        <>
          <Prose onPanel role="alert">
            The occasion or its photographs could not be read. Your dates are
            kept. Refresh before another action.
          </Prose>
          <Button
            variant="panel"
            classNames={{
              root: classes.milestoneReconcileControl,
              label: classes.milestoneReconcileControlLabel,
            }}
            onClick={() => {
              void controller.refresh().catch(() => {});
            }}
          >
            Refresh the occasion and photographs
          </Button>
        </>
      ) : null}
      <MilestoneReconcileFix controller={controller} />
      <MilestoneReconcileControls
        controller={controller}
        onDone={onDone}
        onOtherMilestone={onOtherMilestone}
      />
    </Stack>
  );
}
