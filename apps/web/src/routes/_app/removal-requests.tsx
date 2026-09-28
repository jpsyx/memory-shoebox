import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

export const Route = createFileRoute("/_app/removal-requests")({
  component: RemovalRequestsPage,
});

function RemovalRequestsPage() {
  return (
    <Page wide>
      <Lede>Removal requests.</Lede>
      <Prose onPanel>
        Surface 15. Built in step 8b, against the removal routes step 7a
        delivers.
      </Prose>
    </Page>
  );
}
