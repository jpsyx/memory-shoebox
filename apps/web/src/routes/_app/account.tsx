import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
});

function AccountPage() {
  return (
    <Page wide>
      <Lede>Your account.</Lede>
      <Prose onPanel>
        Surface 9. Built in step 4b, against the account routes step 3a
        delivers.
      </Prose>
    </Page>
  );
}
