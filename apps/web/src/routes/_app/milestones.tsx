import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";

export const Route = createFileRoute("/_app/milestones")({
  component: MilestonesPage,
});

function MilestonesPage() {
  return (
    <Page wide>
      <Lede>Milestones.</Lede>
      <Prose onPanel>
        Surface 14. Built in step 8b, against the milestone routes step 7a
        delivers.
      </Prose>
    </Page>
  );
}
