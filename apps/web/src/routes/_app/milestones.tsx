import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

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
