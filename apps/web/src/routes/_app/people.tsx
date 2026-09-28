import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

export const Route = createFileRoute("/_app/people")({
  component: PeoplePage,
});

function PeoplePage() {
  return (
    <Page wide>
      <Lede>Everybody in here.</Lede>
      <Prose onPanel>
        Surface 7. Built in step 5b, against the directory step 4a delivers.
      </Prose>
    </Page>
  );
}
