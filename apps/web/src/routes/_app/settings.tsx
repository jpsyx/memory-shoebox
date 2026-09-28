import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <Page wide>
      <Lede>Shoebox settings.</Lede>
      <Prose onPanel>
        Surface 11. Built in step 9, against the settings routes step 8a
        delivers.
      </Prose>
    </Page>
  );
}
