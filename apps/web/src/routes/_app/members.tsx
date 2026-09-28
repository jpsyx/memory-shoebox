import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

export const Route = createFileRoute("/_app/members")({
  component: MembersPage,
});

function MembersPage() {
  return (
    <Page wide>
      <Lede>Members.</Lede>
      <Prose onPanel>
        Surface 12. Built in step 9, against the member routes step 8a delivers.
      </Prose>
    </Page>
  );
}
