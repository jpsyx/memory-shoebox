import { createFileRoute } from "@tanstack/react-router";
import { Page, TopBar } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";

export const Route = createFileRoute("/_app/items/$itemId")({
  staticData: { hasOwnBar: true },
  component: ItemPage,
});

function ItemPage() {
  return (
    <>
      <TopBar back={{ label: "Back to the pile", to: "/" }} />
      <Page>
        <Lede>One item.</Lede>
        <Prose onPanel>
          Surfaces 3 and 4, photo and video on one route. Built in step 6b,
          against the item routes step 5a delivers.
        </Prose>
      </Page>
    </>
  );
}
