import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

/*
 * The trailing underscore on `$itemId_` keeps this a sibling of the item
 * page rather than a child of it. Do not drop it: nested under the item
 * page, this route would render inside a parent with no `<Outlet />`, so
 * the URL would change while the page did not, showing the photograph
 * instead of the removal ask.
 */
export const Route = createFileRoute("/_app/items/$itemId_/removal")({
  staticData: { hasOwnBar: true },
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
