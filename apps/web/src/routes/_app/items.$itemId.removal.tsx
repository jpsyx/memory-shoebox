import { createFileRoute } from "@tanstack/react-router";
import { Page, TopBar } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";

export const Route = createFileRoute("/_app/items/$itemId/removal")({
  component: ItemRemovalPage,
});

function ItemRemovalPage() {
  const { itemId } = Route.useParams();

  return (
    <>
      {/*
       * Back to the photograph rather than to the pile: asking for something
       * to come down is a step you took from looking at it, and the way out
       * of a step is the thing you were looking at.
       */}
      <TopBar
        back={{
          label: "Back to the photo",
          to: "/items/$itemId",
          params: { itemId },
        }}
      />
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
