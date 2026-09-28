import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

export const Route = createFileRoute("/_app/presence")({
  component: PresencePage,
});

function PresencePage() {
  return (
    <Page wide>
      <Lede>Who has been looking.</Lede>
      <Prose onPanel>
        Surface 17. Built in step 9, against the presence route step 8a
        delivers.
      </Prose>
    </Page>
  );
}
