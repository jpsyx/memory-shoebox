import { createFileRoute } from "@tanstack/react-router";
import { RemovalSurface } from "@/surfaces/Removal/RemovalSurface/RemovalSurface";

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

  return <RemovalSurface itemId={itemId} />;
}
