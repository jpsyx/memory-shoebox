import type { ReactNode } from "react";
import { useMilestoneNavigation } from "./useMilestoneNavigation";
import { MilestoneDeleteNotice } from "./MilestoneDeleteNotice";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import { MilestoneForm } from "../MilestoneForm/MilestoneForm";
import { MilestoneDirectory } from "./MilestoneDirectory";
import { MilestoneSelection } from "./MilestoneSelection";
type Props = { viewer: Viewer };
/** Member-keyed page content and confirmed occasion navigation. */
export function MilestonesPage({ viewer }: Readonly<Props>): ReactNode {
  const { search, deleted, onNavigate, onSaved, onDeleted } =
    useMilestoneNavigation(viewer);
  return (
    <Page wide>
      <Lede>Milestones.</Lede>
      <Prose onPanel>
        A dated occasion: a birth, a first day of school, a week at the
        grandparents'. It appears in the timeline across its own days.
      </Prose>
      <MilestoneDeleteNotice deleted={deleted} />
      {search.mode === "create" ? (
        viewer.role === "viewer" ? (
          <Prose onPanel>
            Only uploaders and admins can create milestones.
          </Prose>
        ) : (
          <MilestoneForm
            key={`${viewer.memberId}:create`}
            onSaved={onSaved}
            onCancel={() => {
              return onNavigate({});
            }}
          />
        )
      ) : null}
      {search.milestone ? (
        <MilestoneSelection
          memberId={viewer.memberId}
          milestoneId={search.milestone}
          mode={search.mode}
          onNavigate={onNavigate}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      ) : null}
      <MilestoneDirectory viewer={viewer} onNavigate={onNavigate} />
    </Page>
  );
}
