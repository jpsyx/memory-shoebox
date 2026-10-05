import { getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RemovalItemPage } from "./RemovalItemPage";
const AppRoute = getRouteApi("/_app") satisfies ReturnType<
  typeof getRouteApi<"/_app">
>;
type Props = { itemId: string };

/**
 * Keyed membership and item ownership prevent old rows or notices crossing
 * targets.
 */
export function RemovalSurface({ itemId }: Readonly<Props>): ReactNode {
  const { viewer, settings } = AppRoute.useRouteContext();
  return (
    <RemovalItemPage
      key={`${viewer.memberId}:${itemId}`}
      itemId={itemId}
      viewer={viewer}
      timezone={settings.timezone}
    />
  );
}
