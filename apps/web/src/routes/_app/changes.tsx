import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

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
