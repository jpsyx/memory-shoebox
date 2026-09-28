import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";

export const Route = createFileRoute("/_app/changes")({
  component: ChangesPage,
});

function ChangesPage() {
  return (
    <Page wide>
      <Lede>What has been changed.</Lede>
      <Prose onPanel>
        Surface 18. Built in step 9, against the activity route step 8a
        delivers.
      </Prose>
    </Page>
  );
}
