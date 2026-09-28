import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

/**
 * The root route. Every page renders inside one of the two shells below it:
 * `sign-in` for somebody who is not signed in, `_app` for everybody else.
 * There is no chrome here, because the two shells do not share any.
 *
 * The query client rides in the router context so a route's `beforeLoad` can
 * read the viewer before its component mounts.
 */
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootLayout,
});

function RootLayout() {
  return <Outlet />;
}
