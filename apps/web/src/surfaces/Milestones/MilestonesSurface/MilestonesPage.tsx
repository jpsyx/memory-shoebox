import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { MilestoneCreationForm } from "./MilestoneCreationForm";
import { MilestoneDeleteNotice } from "./MilestoneDeleteNotice";
import { MilestoneDirectory } from "./MilestoneDirectory/MilestoneDirectory";
import { MilestoneSelection } from "./MilestoneSelection/MilestoneSelection";
import { useMilestoneNavigation } from "./useMilestoneNavigation";
type Props = { viewer: Viewer };
/** Member-keyed page content and confirmed occasion navigation. */
export function MilestonesPage({ viewer }: Readonly<Props>): ReactNode {
  const { search, deleted, onNavigate, onSaved, onDeleted } =
    useMilestoneNavigation(viewer);
  return (
    <Page wide>
      <Stack gap="lg">
        <Lede>Milestones.</Lede>
        <MilestoneDeleteNotice deleted={deleted} />
        {search.mode === "create" ? (
          <MilestoneCreationForm
            viewer={viewer}
            onSaved={onSaved}
            onCancel={() => {
              onNavigate({});
            }}
          />
        ) : null}
        {search.milestone ? (
          <MilestoneSelection
            viewer={viewer}
            memberId={viewer.memberId}
            milestoneId={search.milestone}
            mode={search.mode}
            onNavigate={onNavigate}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : null}
        <MilestoneDirectory viewer={viewer} onNavigate={onNavigate} />
      </Stack>
    </Page>
  );
}
