import { createFileRoute } from "@tanstack/react-router";
import { Page, TopBar } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";

export const Route = createFileRoute("/_app/items/$itemId/removal")({
  component: ItemRemovalPage,
});

function ItemRemovalPage() {
  return (
    <>
      <TopBar back={{ label: "Back to the pile", to: "/" }} />
      <Page>
        <Lede>Ask for this one to come down.</Lede>
        <Prose onPanel>
          Surface 10. Built in step 8b, against the removal routes step 7a
          delivers.
        </Prose>
      </Page>
    </>
  );
}
