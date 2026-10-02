import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ItemSurface } from "@/surfaces/Item/ItemSurface/ItemSurface";

/*
 * **No loader, and do not add one.** `GET /api/items/:itemId` counts an open
 * every time it runs, and the router preloads a route's loader whenever a
 * pointer rests on a link to it (`defaultPreload: "intent"` in
 * `src/router.ts`). A loader here would count an open for every sibling in
 * the strip a mouse crossed. `ItemSurface` fetches with `useQuery` instead
 * (decision 1 of the step 6b design), and a test preloads a link to prove it.
 */
export const Route = createFileRoute("/_app/items/$itemId")({
  staticData: { hasOwnBar: true },
  component: ItemPage,
});

function ItemPage(): ReactNode {
  const { itemId } = Route.useParams();
  return <ItemSurface itemId={itemId} />;
}
