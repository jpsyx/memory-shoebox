import { createFileRoute } from "@tanstack/react-router";
import { Page, TopBar } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";

/*
 * The trailing underscore on `$itemId_` is what keeps this a sibling of the
 * item page rather than a child of it. Nested, it rendered inside a parent
 * that has no `<Outlet />`, so the URL changed and the page did not: asking
 * for a photograph to come down showed the photograph instead.
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
