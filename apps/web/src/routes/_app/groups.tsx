import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

export const Route = createFileRoute("/_app/groups")({
  component: GroupsPage,
});

function GroupsPage() {
  return (
    <Page wide>
      <Lede>Groups.</Lede>
      <Prose onPanel>
        Surface 13. Built in step 9, against the group routes step 8a delivers.
      </Prose>
    </Page>
  );
}
